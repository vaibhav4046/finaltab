const message = [
  "V3 narration generation is intentionally fail-closed in this video project.",
  "No provider request was made.",
  "When generation is explicitly authorized, create one new ElevenLabs George (JBFqnCBsd6RMkjVDRZzb) eleven_multilingual_v2 response for the complete 188-word SCRIPT.md narration.",
  "Do not reuse any existing scene MP3. Record the selected batch, bytes, SHA-256, and offline alignment in the V3 manifests before running captions.",
].join(" ");

process.stderr.write(`${message}\n`);
process.exitCode = 1;
