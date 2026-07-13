import { db } from "./db";

export class AudioCaptureManager {
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private speakerStream: MediaStream | null = null;
  private processorNode: AudioWorkletNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private speakerSource: MediaStreamAudioSourceNode | null = null;
  private sessionId: string | null = null;
  private recordedSamples: number = 0;
  private timestampOffsetMs: number = 0;
  private isPausedCallback: (() => boolean) | null = null;
  private onAudioDataCallback: ((data: Int16Array) => void) | null = null;

  async start(
    sessionId: string,
    routing: "mix" | "mic-only" | "speaker-only",
    onAudioData: (data: Int16Array) => void,
    isPaused: () => boolean,
    timestampOffsetMs: number = 0,
  ): Promise<void> {
    if (typeof window === "undefined") return;

    // Prevent multiple concurrent sessions/resource leaks
    this.stop();

    this.sessionId = sessionId;
    this.onAudioDataCallback = onAudioData;
    this.isPausedCallback = isPaused;
    this.recordedSamples = 0;
    this.timestampOffsetMs = timestampOffsetMs;

    // Create the AudioContext. Request 16kHz context if browser supports it.
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass({ sampleRate: 16000 });
    const contextSampleRate = this.audioContext.sampleRate;

    try {
      const getMic = routing === "mix" || routing === "mic-only";
      const getSpeaker = routing === "mix" || routing === "speaker-only";

      // 1. Initialize Microphone capture
      if (getMic) {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        if (!this.audioContext) {
          throw new Error(
            "AudioContext was closed during microphone initialization.",
          );
        }
        this.micSource = this.audioContext.createMediaStreamSource(
          this.micStream,
        );
      }

      // 2. Initialize System/Speaker loopback capture
      if (getSpeaker) {
        this.speakerStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: { width: 1, height: 1 },
        });
        if (this.speakerStream.getAudioTracks().length === 0) {
          throw new Error(
            "No audio track found in display media. Please check 'Share system audio' when sharing.",
          );
        }
        if (!this.audioContext) {
          throw new Error(
            "AudioContext was closed during speaker initialization.",
          );
        }
        this.speakerSource = this.audioContext.createMediaStreamSource(
          this.speakerStream,
        );
      }

      if (!this.audioContext) {
        throw new Error(
          "AudioContext was closed before audio worklet creation.",
        );
      }

      // 3. Build & load the AudioWorkletProcessor
      const processorCode = `
        class AudioProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.bufferSize = 4096;
            this.buffer = new Float32Array(this.bufferSize);
            this.bufferIndex = 0;
          }

          process(inputs) {
            const input = inputs[0];
            if (!input || input.length === 0) return true;

            const channelCount = input.length;
            const sampleCount = input[0].length;

            for (let i = 0; i < sampleCount; i++) {
              let sum = 0;
              for (let c = 0; c < channelCount; c++) {
                sum += input[c][i];
              }
              this.buffer[this.bufferIndex++] = sum / channelCount;

              if (this.bufferIndex >= this.bufferSize) {
                this.port.postMessage(this.buffer);
                this.buffer = new Float32Array(this.bufferSize);
                this.bufferIndex = 0;
              }
            }
            return true;
          }
        }
        registerProcessor('audio-processor', AudioProcessor);
      `;

      const blob = new Blob([processorCode], {
        type: "application/javascript",
      });
      const blobUrl = URL.createObjectURL(blob);
      await this.audioContext.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      this.processorNode = new AudioWorkletNode(
        this.audioContext,
        "audio-processor",
      );

      // Connect sources to the processor
      this.micSource?.connect(this.processorNode);
      this.speakerSource?.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      // Handle raw buffer messages from the processor
      this.processorNode.port.onmessage = (event) => {
        if (this.isPausedCallback?.()) return;

        const inputData = event.data as Float32Array;
        const downsampled = this.downsample(
          inputData,
          contextSampleRate,
          16000,
        );
        const pcm16 = this.floatTo16BitPCM(downsampled);

        this.onAudioDataCallback?.(pcm16);

        if (this.sessionId) {
          const chunkStartMs = (this.recordedSamples / 16000) * 1000 + this.timestampOffsetMs;
          this.recordedSamples += pcm16.length;

          db.saveAudioChunk({
            sessionId: this.sessionId,
            startTimestamp: chunkStartMs,
            data: pcm16,
          }).catch((err) => {
            console.error("Failed to save audio chunk to DB:", err);
          });
        }
      };
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop(): void {
    // 1. Clean up worklet node
    if (this.processorNode) {
      this.processorNode.port.onmessage = null;
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    // 2. Disconnect sources
    this.micSource?.disconnect();
    this.micSource = null;
    this.speakerSource?.disconnect();
    this.speakerSource = null;

    // 3. Stop hardware streams
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;
    this.speakerStream?.getTracks().forEach((track) => track.stop());
    this.speakerStream = null;

    // 4. Close audio context
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch((err) => {
        console.error("Failed to close AudioContext:", err);
      });
    }
    this.audioContext = null;

    // 5. Reset states
    this.sessionId = null;
    this.onAudioDataCallback = null;
    this.isPausedCallback = null;
    this.recordedSamples = 0;
    this.timestampOffsetMs = 0;
  }

  // Linear box-filter downsampling
  private downsample(
    buffer: Float32Array,
    inputSampleRate: number,
    outputSampleRate: number,
  ): Float32Array {
    if (inputSampleRate === outputSampleRate) return buffer;

    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(buffer.length, Math.floor((i + 1) * ratio));

      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += buffer[j];
      }
      result[i] = sum / (end - start || 1);
    }
    return result;
  }

  // Convert Float32Array [-1.0, 1.0] to Int16Array PCM
  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return output;
  }

  // Play exact token slice from DB
  static async playTokenAudio(
    sessionId: string,
    startTimestampMs: number,
    endTimestampMs: number,
  ): Promise<void> {
    if (typeof window === "undefined") return;

    // Add padding so playback doesn't cut off abruptly at the token boundaries
    const paddedStartMs = startTimestampMs - 800;
    const paddedEndMs = endTimestampMs + 800;

    // Get overlapping audio chunks
    const chunks = await db.getAudioChunksForRange(
      sessionId,
      paddedStartMs,
      paddedEndMs,
    );
    if (chunks.length === 0) {
      console.warn(
        "No audio chunks found for playback in range",
        paddedStartMs,
        endTimestampMs,
      );
      return;
    }

    // Concatenate all matching chunks
    const totalLength = chunks.reduce((acc, c) => acc + c.data.length, 0);
    const combinedInt16 = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combinedInt16.set(chunk.data, offset);
      offset += chunk.data.length;
    }

    // Convert back to Float32 range [-1.0, 1.0]
    const combinedFloat32 = new Float32Array(totalLength);
    for (let i = 0; i < totalLength; i++) {
      combinedFloat32[i] = combinedInt16[i] / 32768.0;
    }

    // Determine sample rate and offsets
    const SAMPLE_RATE = 16000;
    const firstChunkStartMs = chunks[0].startTimestamp;

    // Calculate crop positions in samples
    const startOffsetMs = paddedStartMs - firstChunkStartMs;
    const endOffsetMs = paddedEndMs - firstChunkStartMs;

    const cropStartSample = Math.max(
      0,
      Math.round(startOffsetMs * (SAMPLE_RATE / 1000)),
    );
    const cropEndSample = Math.min(
      totalLength,
      Math.round(endOffsetMs * (SAMPLE_RATE / 1000)),
    );

    if (cropStartSample >= cropEndSample) {
      console.warn(
        "Crop range is empty or invalid",
        cropStartSample,
        cropEndSample,
      );
      return;
    }

    const snippet = combinedFloat32.subarray(cropStartSample, cropEndSample);

    // Play snippet using a short-lived AudioContext
    const playCtx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    try {
      const buffer = playCtx.createBuffer(1, snippet.length, SAMPLE_RATE);
      buffer.copyToChannel(snippet, 0);

      const source = playCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(playCtx.destination);

      source.onended = () => {
        playCtx.close().catch((err) => {
          console.error(
            "Failed to close AudioContext after playback ended:",
            err,
          );
        });
      };

      source.start(0);
    } catch (e) {
      playCtx.close().catch(() => {});
      throw e;
    }
  }

  static async getSessionAudioWavUrl(sessionId: string): Promise<string | null> {
    const chunks = await db.getSessionAudioChunks(sessionId);
    if (chunks.length === 0) return null;

    // Concatenate PCM data
    const totalLength = chunks.reduce((acc, c) => acc + c.data.length, 0);
    const combinedInt16 = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combinedInt16.set(chunk.data, offset);
      offset += chunk.data.length;
    }

    // Encode to WAV (sample rate is 16000Hz mono 16-bit PCM)
    const wavBuffer = this.encodeWav(combinedInt16, 16000);
    const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
    return URL.createObjectURL(wavBlob);
  }

  private static encodeWav(samples: Int16Array, sampleRate: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    this.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    this.writeString(view, 8, "WAVE");
    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // Raw PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); // Block align (1 channel * 2 bytes)
    view.setUint16(34, 16, true); // 16-bit
    this.writeString(view, 36, "data");
    view.setUint32(40, samples.length * 2, true);

    const offset = 44;
    for (let i = 0; i < samples.length; i++) {
      view.setInt16(offset + i * 2, samples[i], true);
    }
    return buffer;
  }

  private static writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

export const audioCaptureManager = new AudioCaptureManager();
