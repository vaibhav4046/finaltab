from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
WORD_RE = re.compile(r"[\w]+(?:[-’'][\w]+)*", re.UNICODE)
MAX_RAW_ASR_WER = 0.15
MAPPING_METHOD = "monotonic-levenshtein-forced-v1"


def fail(message: str) -> None:
    raise SystemExit(message)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_json(path: Path, payload) -> None:
    temporary = path.with_name(f"{path.name}.tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def spoken_words(text: str) -> list[str]:
    return WORD_RE.findall(text)


def normalized(text: str) -> str:
    tokens = spoken_words(text)
    if len(tokens) != 1:
        fail(f"Transcript entry must contain exactly one spoken word: {text!r}")
    return tokens[0].replace("’", "'").casefold()


def monotonic_alignment(expected: list[str], observed: list[str]) -> tuple[int, list[tuple[int | None, int | None]]]:
    """Return a deterministic Levenshtein path in locked-word/ASR-word order."""
    expected_normalized = [normalized(word) for word in expected]
    observed_normalized = [normalized(word) for word in observed]
    rows = len(expected_normalized) + 1
    columns = len(observed_normalized) + 1
    distance = [[0] * columns for _ in range(rows)]
    for expected_index in range(rows):
        distance[expected_index][0] = expected_index
    for observed_index in range(columns):
        distance[0][observed_index] = observed_index
    for expected_index in range(1, rows):
        for observed_index in range(1, columns):
            substitution = 0 if expected_normalized[expected_index - 1] == observed_normalized[observed_index - 1] else 1
            distance[expected_index][observed_index] = min(
                distance[expected_index - 1][observed_index] + 1,
                distance[expected_index][observed_index - 1] + 1,
                distance[expected_index - 1][observed_index - 1] + substitution,
            )

    # Prefer a diagonal on ties, then a locked-word deletion, then an ASR
    # insertion, so identical inputs always produce an identical forced map.
    path: list[tuple[int | None, int | None]] = []
    expected_index = len(expected_normalized)
    observed_index = len(observed_normalized)
    while expected_index or observed_index:
        if expected_index and observed_index:
            substitution = 0 if expected_normalized[expected_index - 1] == observed_normalized[observed_index - 1] else 1
            if distance[expected_index][observed_index] == distance[expected_index - 1][observed_index - 1] + substitution:
                path.append((expected_index - 1, observed_index - 1))
                expected_index -= 1
                observed_index -= 1
                continue
        if expected_index and distance[expected_index][observed_index] == distance[expected_index - 1][observed_index] + 1:
            path.append((expected_index - 1, None))
            expected_index -= 1
            continue
        if observed_index:
            path.append((None, observed_index - 1))
            observed_index -= 1
            continue
        fail("ASR alignment could not produce a monotonic path")
    path.reverse()
    return distance[-1][-1], path


def forced_locked_word_timings(expected: list[str], observed: list[dict]) -> tuple[list[dict], dict]:
    """Map fuzzy ASR tokens onto every locked word without changing script text."""
    if not observed:
        fail("Transcript contains no observed words")
    edit_distance, path = monotonic_alignment(expected, [word["text"] for word in observed])
    raw_wer = edit_distance / len(expected)
    if raw_wer > MAX_RAW_ASR_WER + 1e-12:
        fail(f"Raw ASR word error rate is {raw_wer:.3%}; the maximum is {MAX_RAW_ASR_WER:.0%}")

    observed_by_expected: list[list[int]] = [[] for _ in expected]
    last_mapped_expected: int | None = None
    for path_index, (expected_index, observed_index) in enumerate(path):
        if expected_index is not None and observed_index is not None:
            observed_by_expected[expected_index].append(observed_index)
            last_mapped_expected = expected_index
        elif expected_index is None and observed_index is not None:
            # ASR commonly splits locked tokens (FINALTab -> final tab, MCP ->
            # M C P). Fold an insertion into the preceding timing anchor, or
            # the next anchor when the insertion is at the beginning.
            target = last_mapped_expected
            if target is None:
                target = next(
                    (future_expected for future_expected, future_observed in path[path_index + 1 :] if future_expected is not None and future_observed is not None),
                    None,
                )
            if target is None:
                fail("ASR insertion has no locked-word timing anchor")
            observed_by_expected[target].append(observed_index)

    timings: list[dict | None] = [None] * len(expected)
    centers: list[float | None] = [None] * len(expected)
    for expected_index, observed_indices in enumerate(observed_by_expected):
        if not observed_indices:
            continue
        group = [observed[index] for index in sorted(set(observed_indices))]
        start = min(word["start"] for word in group)
        end = max(word["end"] for word in group)
        timings[expected_index] = {"start": start, "end": end}
        centers[expected_index] = (start + end) / 2

    anchored = [index for index, center in enumerate(centers) if center is not None]
    if not anchored:
        fail("ASR alignment contains no locked-word timing anchors")
    for expected_index, center in enumerate(centers):
        if center is not None:
            continue
        previous = next((index for index in reversed(anchored) if index < expected_index), None)
        following = next((index for index in anchored if index > expected_index), None)
        if previous is not None and following is not None:
            fraction = (expected_index - previous) / (following - previous)
            centers[expected_index] = centers[previous] + (centers[following] - centers[previous]) * fraction
        elif following is not None:
            available = max(centers[following] - observed[0]["start"], 0.001 * (following + 1))
            centers[expected_index] = centers[following] - available * (following - expected_index) / (following + 1)
        elif previous is not None:
            available = max(observed[-1]["end"] - centers[previous], 0.001 * (len(expected) - previous))
            centers[expected_index] = centers[previous] + available * (expected_index - previous) / (len(expected) - previous)
        else:
            fail("ASR alignment could not interpolate a missing locked word")

    resolved_centers = [float(center) for center in centers]
    if any(center <= resolved_centers[index - 1] for index, center in enumerate(resolved_centers) if index):
        fail("Forced ASR map does not have strictly increasing timing anchors")
    mapped: list[dict] = []
    for expected_index, word in enumerate(expected):
        start = (
            observed[0]["start"]
            if expected_index == 0
            else (resolved_centers[expected_index - 1] + resolved_centers[expected_index]) / 2
        )
        end = (
            observed[-1]["end"]
            if expected_index == len(expected) - 1
            else (resolved_centers[expected_index] + resolved_centers[expected_index + 1]) / 2
        )
        if end <= start:
            fail("Forced ASR map produced an empty word interval")
        mapped.append({"id": f"w{expected_index}", "text": word, "start": start, "end": end})

    if len(mapped) != len(expected) or any(
        word["end"] <= word["start"] or (index and word["start"] < mapped[index - 1]["end"])
        for index, word in enumerate(mapped)
    ):
        fail("Forced ASR map is incomplete or non-monotonic")
    metadata = {
        "method": MAPPING_METHOD,
        "rawAsrWordCount": len(observed),
        "lockedWordCount": len(expected),
        "rawAsrEditDistance": edit_distance,
        "rawAsrWordErrorRate": round(raw_wer, 6),
        "maximumRawAsrWordErrorRate": MAX_RAW_ASR_WER,
        "mappedWordCount": len(mapped),
        "fullMonotonicMapping": True,
    }
    return mapped, metadata


def script_lines(source: str) -> list[str]:
    return [match.group(1).strip() for match in re.finditer(r"^ {4}(.+)$", source, re.MULTILINE)]


def script_windows(source: str) -> list[tuple[float, float]]:
    def seconds(value: str) -> float:
        minutes, rest = value.split(":", 1)
        return int(minutes) * 60 + float(rest)

    return [
        (seconds(match.group(1)), seconds(match.group(2)))
        for match in re.finditer(r"\*\*Time:\*\* (\d\d:\d\d\.\d\d\d) . (\d\d:\d\d\.\d\d\d)", source)
    ]


def transcript_words(payload) -> list[dict]:
    candidates = payload if isinstance(payload, list) else payload.get("words") or payload.get("transcript")
    if not isinstance(candidates, list):
        fail("Transcript must be a word array or an object with a words array")
    result = []
    for index, item in enumerate(candidates):
        if not isinstance(item, dict):
            fail(f"Transcript word {index} is not an object")
        text = str(item.get("text") or item.get("word") or "").strip()
        start = item.get("start") if item.get("start") is not None else item.get("start_time")
        end = item.get("end") if item.get("end") is not None else item.get("end_time")
        if not text or not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
            fail(f"Transcript word {index} requires text, numeric start, and numeric end")
        if float(start) < 0 or float(end) <= float(start):
            fail(f"Transcript word {index} has invalid timing")
        if result and float(start) < result[-1]["start"]:
            fail(f"Transcript word {index} is not time ordered")
        result.append({"id": f"w{index}", "text": text, "start": float(start), "end": float(end)})
    return result


def run(command: list[str], label: str) -> str:
    try:
        result = subprocess.run(command, check=False, text=True, capture_output=True)
    except FileNotFoundError:
        fail(f"{label} requires {command[0]} on PATH")
    if result.returncode != 0:
        fail(f"{label} failed: {(result.stderr or result.stdout).strip()}")
    return result.stdout


def media_tools() -> tuple[str, str]:
    payload = run(["node", str(PROJECT / "scripts/resolve-media-tools.mjs")], "Media-tool resolution")
    try:
        resolved = json.loads(payload)
        return resolved["ffmpeg"]["path"], resolved["ffprobe"]["path"]
    except (KeyError, TypeError, json.JSONDecodeError):
        fail("Media-tool resolution returned an invalid payload")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the 90-second V3 narration master from one aligned ElevenLabs response, fully offline.")
    parser.add_argument("--transcript", type=Path, help="word-level JSON for the raw complete-script response")
    parser.add_argument("--execute", action="store_true", help="write the timed master and approved alignment")
    parser.add_argument("--overwrite", action="store_true", help="replace an existing timed master/alignment")
    parser.add_argument("--self-test-mapping", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()

    if args.self_test_mapping:
        expected = ["FINALTab", "uses", "MCP", "safely", *[f"word{index}" for index in range(4, 188)]]
        observed_tokens = ["final", "tab", "uses", "M", "C", "P", *expected[4:]]
        observed = transcript_words([
            {"text": text, "start": index * 0.2, "end": index * 0.2 + 0.15}
            for index, text in enumerate(observed_tokens)
        ])
        mapped, metadata = forced_locked_word_timings(expected, observed)
        if len(mapped) != len(expected) or not metadata["fullMonotonicMapping"] or metadata["rawAsrWordErrorRate"] > MAX_RAW_ASR_WER:
            fail("Forced ASR mapping self-test failed")
        print("FORCED ASR MAPPING SELF-TEST PASSED")
        return

    contract = load_json(PROJECT / "data/v3-source-contract.json")
    manifest_path = PROJECT / "data/voiceover-manifest.json"
    ledger_path = PROJECT / "data/narration-generation-ledger.json"
    release_path = PROJECT / "data/release-proof.json"
    manifest = load_json(manifest_path)
    ledger = load_json(ledger_path)
    release = load_json(release_path)
    script_source = (PROJECT / "SCRIPT.md").read_text(encoding="utf-8")
    lines = script_lines(script_source)
    windows = script_windows(script_source)
    expected_words = [word for line in lines for word in spoken_words(line)]

    if contract.get("durationSeconds") != 90 or len(contract.get("scenes", [])) != 8:
        fail("Frozen V3 source contract must contain eight scenes across exactly 90 seconds")
    if len(lines) != 8 or len(windows) != 8 or len(expected_words) != 188:
        fail("SCRIPT.md must contain eight timed narration lines and exactly 188 spoken words")
    if any(line != contract["scenes"][index]["narration"] for index, line in enumerate(lines)):
        fail("SCRIPT.md narration differs from the frozen V3 source contract")
    for index, (start, end) in enumerate(windows):
        scene = contract["scenes"][index]
        if not (scene["start"] <= start < end <= scene["end"]):
            fail(f"SCRIPT.md timing escapes scene {index + 1}")

    if not args.execute:
        print("OFFLINE ALIGNMENT CONTRACT PASSED · raw ASR WER <=15% with full monotonic 188-word mapping · no media or manifest written")
        return
    if args.transcript is None:
        fail("--execute requires --transcript <word-level.json>")
    if manifest.get("status") != "generated-v3-single-batch" or ledger.get("status") != "generated-v3-single-batch":
        fail("One recorded complete-script ElevenLabs batch is required before offline alignment")

    raw_relative = manifest.get("rawProviderResponse", {}).get("path")
    if not raw_relative:
        fail("Voice manifest does not identify the raw provider response")
    raw_audio = (PROJECT / raw_relative).resolve()
    try:
        raw_audio.relative_to(PROJECT)
    except ValueError:
        fail("Raw provider response path escapes the video project")
    if not raw_audio.is_file():
        fail(f"Raw provider response is missing: {raw_relative}")

    supplied = transcript_words(load_json(args.transcript.resolve()))
    mapped_words, mapping_metadata = forced_locked_word_timings(expected_words, supplied)

    scene_words = []
    scene_atempo_factors = []
    cursor = 0
    filter_parts = ["[0:a]asplit=8" + "".join(f"[source{index}]" for index in range(8))]
    mix_inputs = []
    for index, (line, (target_start, target_end)) in enumerate(zip(lines, windows, strict=True)):
        count = len(spoken_words(line))
        raw_group = mapped_words[cursor : cursor + count]
        cursor += count
        raw_start = raw_group[0]["start"]
        raw_end = raw_group[-1]["end"]
        speech_duration = raw_end - raw_start
        available_speech_duration = target_end - target_start
        atempo_factor = max(1.0, speech_duration / available_speech_duration)
        if atempo_factor > 1.12 + 1e-9:
            fail(
                f"Scene {index + 1} narration needs {atempo_factor:.4f}x speed; "
                "the bounded offline fallback permits at most 1.12x"
            )
        preroll = min(0.08, raw_start, target_start - contract["scenes"][index]["start"])
        trim_start = raw_start - preroll
        trim_end = raw_end + 0.08
        delay = target_start - preroll / atempo_factor
        if delay < contract["scenes"][index]["start"] - 1e-6:
            fail(f"Scene {index + 1} preroll escapes its scene")
        if delay + (trim_end - trim_start) / atempo_factor > contract["scenes"][index]["end"] + 1e-6:
            fail(f"Scene {index + 1} bounded narration clip escapes its scene")
        adjusted = [
            {
                "id": f"w{sum(len(group) for group in scene_words) + word_index}",
                "text": expected_words[sum(len(group) for group in scene_words) + word_index],
                "start": round(target_start + (word["start"] - raw_start) / atempo_factor, 6),
                "end": round(target_start + (word["end"] - raw_start) / atempo_factor, 6),
            }
            for word_index, word in enumerate(raw_group)
        ]
        scene_words.append(adjusted)
        scene_atempo_factors.append(round(atempo_factor, 6))
        filter_parts.append(
            f"[source{index}]atrim=start={trim_start:.6f}:end={trim_end:.6f},"
            f"asetpts=PTS-STARTPTS,atempo={atempo_factor:.6f},"
            f"adelay={round(delay * 1000)}:all=1[scene{index}]"
        )
        mix_inputs.append(f"[scene{index}]")

    filter_parts.append("anullsrc=r=44100:cl=mono:d=90[silence]")
    filter_parts.append("".join(mix_inputs) + "[silence]amix=inputs=9:normalize=0:duration=longest,atrim=start=0:end=90[out]")
    master_relative = manifest["master"]["path"]
    alignment_relative = manifest["master"]["alignmentPath"]
    master_path = (PROJECT / master_relative).resolve()
    alignment_path = (PROJECT / alignment_relative).resolve()
    master_path.parent.mkdir(parents=True, exist_ok=True)
    if not args.overwrite and (master_path.exists() or alignment_path.exists()):
        fail("Timed master or alignment already exists; inspect it before using --overwrite")
    temporary_master = master_path.with_name(f"{master_path.stem}.tmp{master_path.suffix}")
    ffmpeg, ffprobe = media_tools()
    run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw_audio),
        "-filter_complex", ";".join(filter_parts), "-map", "[out]", "-ar", "44100", "-ac", "1",
        "-b:a", "128k", str(temporary_master),
    ], "Offline narration assembly")
    probe = json.loads(run([
        ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "json", str(temporary_master)
    ], "Timed-master probe"))
    duration = float(probe["format"]["duration"])
    if abs(duration - 90) > 0.08:
        temporary_master.unlink(missing_ok=True)
        fail(f"Timed master is {duration:.3f}s, not 90.000s")
    temporary_master.replace(master_path)

    master_bytes = master_path.read_bytes()
    master_sha = hashlib.sha256(master_bytes).hexdigest()
    alignment = {
        "schemaVersion": 3,
        "status": "approved-v3-alignment",
        "sourceBatchId": manifest["rawProviderResponse"]["batchId"],
        "sourceSha256": manifest["rawProviderResponse"]["sha256"],
        "scriptWordCount": 188,
        "durationSeconds": 90,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "timingMapping": mapping_metadata,
        "scenes": [
            {
                "scene": scene["scene"],
                "start": scene_words[index][0]["start"],
                "end": scene_words[index][-1]["end"],
                "text": scene["narration"],
                "atempoFactor": scene_atempo_factors[index],
                "words": scene_words[index],
            }
            for index, scene in enumerate(contract["scenes"])
        ],
    }
    atomic_json(alignment_path, alignment)
    generated_at = datetime.now(timezone.utc).isoformat()
    manifest["status"] = "approved-v3-single-batch"
    manifest["master"].update({
        "bytes": len(master_bytes), "sha256": master_sha, "durationSeconds": duration,
        "generatedAt": generated_at, "batchId": manifest["rawProviderResponse"]["batchId"],
    })
    ledger["status"] = "approved-v3-single-batch"
    ledger["selectedBatch"]["masterPath"] = master_relative
    ledger["selectedBatch"]["masterBytes"] = len(master_bytes)
    ledger["selectedBatch"]["masterSha256"] = master_sha
    ledger["selectedBatch"]["alignmentPath"] = alignment_relative
    atomic_json(manifest_path, manifest)
    atomic_json(ledger_path, ledger)
    release["v3Film"]["singleBatchNarrationComplete"] = True
    atomic_json(release_path, release)
    print(f"OFFLINE ALIGNMENT COMPLETE · 8 scenes · 188 exact words · {duration:.3f}s")


if __name__ == "__main__":
    main()
