/* global AudioWorkletProcessor, registerProcessor, sampleRate */

class FinalTabPcm16Processor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const requestedRate = Number(options.processorOptions?.targetSampleRate ?? 16000);
    const requestedMilliseconds = Number(options.processorOptions?.chunkMilliseconds ?? 50);
    this.targetSampleRate = Math.max(8000, Math.min(96000, Math.round(requestedRate)));
    this.chunkMilliseconds = Math.max(50, Math.min(1000, Math.round(requestedMilliseconds)));
    this.inputSamplesPerChunk = Math.max(1, Math.round(sampleRate * this.chunkMilliseconds / 1000));
    this.targetSamplesPerChunk = Math.max(1, Math.round(this.targetSampleRate * this.chunkMilliseconds / 1000));
    this.pending = new Float32Array(this.inputSamplesPerChunk);
    this.pendingLength = 0;
  }

  emitChunk() {
    const output = new Int16Array(this.targetSamplesPerChunk);
    const ratio = this.inputSamplesPerChunk / this.targetSamplesPerChunk;
    let sumSquares = 0;

    for (let inputIndex = 0; inputIndex < this.inputSamplesPerChunk; inputIndex += 1) {
      const sample = this.pending[inputIndex];
      sumSquares += sample * sample;
    }

    for (let outputIndex = 0; outputIndex < this.targetSamplesPerChunk; outputIndex += 1) {
      const start = Math.floor(outputIndex * ratio);
      const end = Math.max(start + 1, Math.min(this.inputSamplesPerChunk, Math.floor((outputIndex + 1) * ratio)));
      let average = 0;
      for (let inputIndex = start; inputIndex < end; inputIndex += 1) average += this.pending[inputIndex];
      average /= end - start;
      const clamped = Math.max(-1, Math.min(1, average));
      output[outputIndex] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    }

    const rms = Math.sqrt(sumSquares / this.inputSamplesPerChunk);
    const level = Math.max(0, Math.min(1, rms * 4.5));
    this.port.postMessage({ type: "chunk", audio: output.buffer, level }, [output.buffer]);
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let inputIndex = 0; inputIndex < channel.length; inputIndex += 1) {
      this.pending[this.pendingLength] = channel[inputIndex];
      this.pendingLength += 1;
      if (this.pendingLength === this.inputSamplesPerChunk) {
        this.emitChunk();
        this.pendingLength = 0;
      }
    }
    return true;
  }
}

registerProcessor("finaltab-pcm16", FinalTabPcm16Processor);
