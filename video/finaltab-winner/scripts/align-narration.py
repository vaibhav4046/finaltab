#!/usr/bin/env python3
"""Create caption-compatible character timing from an existing narration MP3.

This is intentionally provider-free. It reads the selected line from SCRIPT.md,
validates the audio with an unbiased local ASR pass, then uses a transcript prefix
for a second, constrained timing pass. The output is accepted by
build-captions.mjs without pretending that provider-native alignment exists.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio


PROJECT_DIR = Path(__file__).resolve().parents[1]
SCRIPT_PATH = PROJECT_DIR / "SCRIPT.md"
SCENE_STARTS = (0.65, 6.2, 16.4, 31.4, 44.2, 56.35, 66.25, 73.15, 91.05)
SCENE_ENDS = (6.0, 16.0, 31.0, 44.0, 56.0, 66.0, 73.0, 91.0, 96.0)
MAX_INDEPENDENT_CER = 0.20
SAMPLE_RATE = 16_000
PINNED_BASE_EN_REVISION = "3d3d5dee26484f91867d81cb899cfcf72b96be6c"


class AlignmentError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Offline transcript-constrained narration alignment. The exact text is "
            "always read from SCRIPT.md for the selected scene."
        )
    )
    parser.add_argument("--scene", required=True, type=int, choices=range(1, 10))
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--model",
        default="base.en",
        help="Cached faster-whisper model ID or local model directory (default: base.en).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace an existing output file. Without this flag, existing files are protected.",
    )
    return parser.parse_args()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AlignmentError(message)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalized_characters(value: str) -> str:
    return "".join(character.casefold() for character in value if character.isalnum())


def levenshtein_distance(left: str, right: str) -> int:
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for left_index, left_character in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_character in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1] + (left_character != right_character),
                )
            )
        previous = current
    return previous[-1]


def ffprobe_duration(audio_path: Path) -> float:
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(audio_path),
        ],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    require(completed.returncode == 0, f"ffprobe failed: {completed.stderr.strip()}")
    try:
        duration = float(completed.stdout.strip())
    except ValueError as error:
        raise AlignmentError("ffprobe returned no usable duration") from error
    require(math.isfinite(duration) and duration > 0.25, "Audio duration is not usable")
    return duration


def speech_bounds(audio_path: Path, audio_duration: float) -> tuple[float, float]:
    samples = decode_audio(str(audio_path), sampling_rate=SAMPLE_RATE)
    require(samples.size > 0, "Decoded audio is empty")
    frame_size = int(SAMPLE_RATE * 0.02)
    rms_values: list[float] = []
    for offset in range(0, samples.size, frame_size):
        frame = samples[offset : offset + frame_size]
        rms_values.append(float(np.sqrt(np.mean(np.square(frame), dtype=np.float64))))
    peak_rms = max(rms_values, default=0.0)
    threshold = max(10 ** (-45 / 20), peak_rms * 10 ** (-38 / 20))
    active = [index for index, rms in enumerate(rms_values) if rms >= threshold]
    require(active, "No speech-like signal was found in the audio")
    start = max(0.0, active[0] * frame_size / SAMPLE_RATE - 0.04)
    end = min(audio_duration, (active[-1] + 1) * frame_size / SAMPLE_RATE + 0.04)
    require(end > start, "Detected speech bounds are not usable")
    return start, end


def run_transcription(
    model: WhisperModel, audio_path: Path, *, prefix: str | None
) -> tuple[str, list[dict[str, float | str]]]:
    options: dict[str, Any] = {
        "language": "en",
        "task": "transcribe",
        "beam_size": 5,
        "temperature": 0.0,
        "word_timestamps": True,
        "condition_on_previous_text": False,
        "vad_filter": False,
    }
    if prefix is not None:
        options["prefix"] = prefix
    segment_iterator, _ = model.transcribe(str(audio_path), **options)
    segments = list(segment_iterator)
    transcript = "".join(segment.text for segment in segments).strip()
    words: list[dict[str, float | str]] = []
    for segment in segments:
        for word in segment.words or []:
            if word.start is None or word.end is None:
                continue
            start = float(word.start)
            end = float(word.end)
            probability = float(word.probability or 0.0)
            require(
                all(math.isfinite(value) for value in (start, end, probability)),
                "ASR returned a non-finite word timing",
            )
            words.append(
                {
                    "text": word.word,
                    "start": start,
                    "end": end,
                    "probability": probability,
                }
            )
    require(transcript and words, "ASR returned no speech words")
    return transcript, words


def normalize_forced_words(
    words: list[dict[str, float | str]], speech_end: float, audio_duration: float
) -> list[dict[str, float | str]]:
    normalized: list[dict[str, float | str]] = []
    previous_end = 0.0
    for word in words:
        token = normalized_characters(str(word["text"]))
        if not token:
            continue
        start = max(0.0, float(word["start"]), previous_end)
        end = max(start, float(word["end"]))
        require(start <= audio_duration + 0.05, "Forced word starts outside the audio")
        end = min(end, audio_duration)
        require(end > start, "Forced word timing is empty or not monotonic")
        normalized.append(
            {
                "text": str(word["text"]),
                "normalized": token,
                "start": start,
                "end": end,
                "probability": float(word["probability"]),
            }
        )
        previous_end = end
    require(normalized, "Forced pass returned no alphanumeric words")
    normalized[-1]["end"] = max(float(normalized[-1]["end"]), speech_end)
    return normalized


def build_character_alignment(
    text: str,
    forced_words: list[dict[str, float | str]],
    speech_end: float,
    audio_duration: float,
) -> dict[str, list[str] | list[float]]:
    script_positions = [index for index, character in enumerate(text) if character.isalnum()]
    script_normalized = "".join(text[index].casefold() for index in script_positions)
    forced_normalized = "".join(str(word["normalized"]) for word in forced_words)
    require(
        forced_normalized == script_normalized,
        "Forced transcript does not reproduce the SCRIPT.md line exactly after normalization",
    )

    anchors: dict[int, float] = {}
    cursor = 0
    for word in forced_words:
        token = str(word["normalized"])
        start = float(word["start"])
        end = float(word["end"])
        span = max(0.0, end - start)
        for token_index in range(len(token)):
            script_position = script_positions[cursor + token_index]
            character_start = start + span * token_index / len(token)
            character_end = start + span * (token_index + 1) / len(token)
            anchors[script_position] = character_start
            anchors[script_position + 1] = character_end
        cursor += len(token)
    require(cursor == len(script_positions), "Forced transcript character mapping is incomplete")

    if 0 not in anchors:
        anchors[0] = min(anchors.values())
    anchors[len(text)] = max(anchors.get(len(text), 0.0), speech_end)

    sorted_anchor_positions = sorted(anchors)
    previous_value = 0.0
    for position in sorted_anchor_positions:
        value = min(audio_duration, max(previous_value, anchors[position]))
        anchors[position] = value
        previous_value = value

    boundaries: list[float | None] = [None] * (len(text) + 1)
    for position, value in anchors.items():
        boundaries[position] = value
    for left_position, right_position in zip(
        sorted_anchor_positions, sorted_anchor_positions[1:]
    ):
        left_value = float(boundaries[left_position])
        right_value = float(boundaries[right_position])
        width = right_position - left_position
        for offset in range(1, width):
            boundaries[left_position + offset] = (
                left_value + (right_value - left_value) * offset / width
            )
    require(all(value is not None for value in boundaries), "Character timing interpolation failed")

    monotonic: list[float] = []
    for value in boundaries:
        numeric = min(audio_duration, max(monotonic[-1] if monotonic else 0.0, float(value)))
        monotonic.append(numeric)
    rounded = [round(value, 3) for value in monotonic]
    starts = rounded[:-1]
    ends = rounded[1:]
    require(len(starts) == len(text) == len(ends), "Character timing lengths do not match text")
    require(all(end >= start for start, end in zip(starts, ends)), "Character timing is negative")
    require(
        all(starts[index] <= starts[index + 1] for index in range(len(starts) - 1)),
        "Character starts are not monotonic",
    )
    require(
        all(ends[index] <= ends[index + 1] for index in range(len(ends) - 1)),
        "Character ends are not monotonic",
    )
    require(ends[-1] <= audio_duration + 0.002, "Character timing exceeds the audio")
    return {
        "characters": list(text),
        "character_start_times_seconds": starts,
        "character_end_times_seconds": ends,
    }


def main() -> int:
    args = parse_args()
    audio_path = args.audio.resolve()
    output_path = args.output.resolve()
    require(audio_path.is_file(), f"Audio file does not exist: {audio_path}")
    require(audio_path.suffix.casefold() == ".mp3", "Input audio must be an MP3")
    require(output_path.suffix.casefold() == ".json", "Output must be a JSON file")
    require(args.overwrite or not output_path.exists(), f"Output already exists: {output_path}")

    script_source = SCRIPT_PATH.read_text(encoding="utf-8")
    script_lines = [line.strip() for line in re.findall(r"^ {4}(.+)$", script_source, re.MULTILINE)]
    require(len(script_lines) == 9 and all(script_lines), "SCRIPT.md must contain nine narration lines")
    text = script_lines[args.scene - 1]
    audio_bytes = audio_path.read_bytes()
    audio_duration = ffprobe_duration(audio_path)
    scene_budget = SCENE_ENDS[args.scene - 1] - SCENE_STARTS[args.scene - 1]
    require(
        audio_duration <= scene_budget + 0.015,
        (
            f"Scene {args.scene} audio is {audio_duration:.3f}s, outside its "
            f"{scene_budget:.3f}s frame budget"
        ),
    )
    detected_speech_start, detected_speech_end = speech_bounds(audio_path, audio_duration)

    try:
        model = WhisperModel(
            args.model,
            device="cpu",
            compute_type="int8",
            num_workers=1,
            local_files_only=True,
            revision=PINNED_BASE_EN_REVISION if args.model == "base.en" else None,
        )
    except Exception as error:
        raise AlignmentError(
            f"Local faster-whisper model '{args.model}' is unavailable; no download was attempted"
        ) from error

    independent_text, independent_words = run_transcription(model, audio_path, prefix=None)
    expected_normalized = normalized_characters(text)
    independent_normalized = normalized_characters(independent_text)
    edit_distance = levenshtein_distance(expected_normalized, independent_normalized)
    character_error_rate = edit_distance / max(1, len(expected_normalized))
    require(
        character_error_rate <= MAX_INDEPENDENT_CER,
        (
            f"Independent transcript CER {character_error_rate:.3f} exceeds "
            f"the {MAX_INDEPENDENT_CER:.2f} safety gate; audio/text pairing rejected"
        ),
    )

    forced_text, raw_forced_words = run_transcription(model, audio_path, prefix=text)
    forced_words = normalize_forced_words(
        raw_forced_words, detected_speech_end, audio_duration
    )
    require(
        normalized_characters(forced_text) == expected_normalized,
        "Prefix-constrained transcript did not reproduce the SCRIPT.md line",
    )
    alignment = build_character_alignment(
        text, forced_words, detected_speech_end, audio_duration
    )
    require("".join(alignment["characters"]) == text, "Alignment text reconstruction failed")

    probabilities = [float(word["probability"]) for word in forced_words]
    payload = {
        "text": text,
        "alignment": alignment,
        "originalAlignment": None,
        "metadata": {
            "schemaVersion": 1,
            "source": "offline-faster-whisper-transcript-constrained",
            "providerAlignmentAvailable": False,
            "scene": args.scene,
            "model": args.model,
            "modelRevision": PINNED_BASE_EN_REVISION if args.model == "base.en" else None,
            "language": "en",
            "fasterWhisperVersion": importlib.metadata.version("faster-whisper"),
            "ctranslate2Version": importlib.metadata.version("ctranslate2"),
            "audioSha256": sha256_bytes(audio_bytes),
            "audioBytes": len(audio_bytes),
            "audioDurationSeconds": round(audio_duration, 6),
            "sceneBudgetSeconds": round(scene_budget, 3),
            "speechStartSeconds": round(detected_speech_start, 3),
            "speechEndSeconds": round(detected_speech_end, 3),
            "scriptSha256": sha256_bytes(script_source.encode("utf-8")),
            "textSha256": sha256_bytes(text.encode("utf-8")),
            "independentTranscript": independent_text,
            "independentCharacterErrorRate": round(character_error_rate, 6),
            "independentWordCount": len(independent_words),
            "forcedTranscript": forced_text,
            "forcedWordCount": len(forced_words),
            "forcedMeanWordProbability": round(sum(probabilities) / len(probabilities), 6),
            "qualityGate": "passed",
            "maxIndependentCharacterErrorRate": MAX_INDEPENDENT_CER,
        },
    }
    serialized = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_name(f".{output_path.name}.tmp")
    temporary_path.write_text(serialized, encoding="utf-8", newline="\n")
    temporary_path.replace(output_path)
    print(
        json.dumps(
            {
                "ok": True,
                "scene": args.scene,
                "output": str(output_path),
                "audioDurationSeconds": round(audio_duration, 6),
                "speechEndSeconds": round(detected_speech_end, 3),
                "independentCharacterErrorRate": round(character_error_rate, 6),
                "audioSha256": payload["metadata"]["audioSha256"],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AlignmentError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
