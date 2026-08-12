from __future__ import annotations

import sys

MESSAGE = (
    "The rejected per-scene aligner is retired for V3. "
    "No file was read or written. Align the single approved George multilingual-v2 master "
    "to all eight exact SCRIPT.md lines and write "
    "assets/audio/voice-v3/finaltab-v3-george-alignment.json with schemaVersion 3, "
    "status approved-v3-alignment, and absolute word times contained in the locked scene windows."
)

print(MESSAGE, file=sys.stderr)
raise SystemExit(1)
