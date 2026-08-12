from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from faster_whisper import WhisperModel


def atomic_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Independently transcribe the audio decoded from the final rendered MP4."
    )
    parser.add_argument("--media", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    media = args.media.resolve()
    output = args.output.resolve()
    if not media.is_file():
        raise SystemExit(f"Rendered media is missing: {media}")

    model = WhisperModel(
        "base.en",
        device="cpu",
        compute_type="int8",
        local_files_only=True,
    )
    segments, info = model.transcribe(
        str(media),
        language="en",
        beam_size=5,
        word_timestamps=True,
        vad_filter=False,
        condition_on_previous_text=True,
    )
    words: list[dict[str, object]] = []
    for segment in segments:
        for word in segment.words or []:
            text = word.word.strip()
            if text and word.start is not None and word.end is not None and word.end > word.start:
                words.append({
                    "text": text,
                    "start": round(float(word.start), 6),
                    "end": round(float(word.end), 6),
                    "probability": round(float(word.probability), 6),
                })

    if not words:
        raise SystemExit("Rendered master produced no audible transcription")

    media_bytes = media.read_bytes()
    atomic_json(output, {
        "schemaVersion": 1,
        "status": "rendered-master-asr",
        "engine": "faster-whisper",
        "model": "base.en",
        "language": info.language,
        "languageProbability": round(float(info.language_probability), 6),
        "sourceMediaPath": str(media),
        "sourceMediaBytes": len(media_bytes),
        "sourceMediaSha256": hashlib.sha256(media_bytes).hexdigest(),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "words": words,
    })
    print(f"RENDERED AUDIO ASR COMPLETE · {len(words)} observed words · {output}")


if __name__ == "__main__":
    main()
