import { db } from "./db";

export class AudioCaptureManager {
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private speakerStream: MediaStream | null = null;
  private processorNode: AudioWorkletNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private speakerSource: MediaStreamAudioSourceNode | null = null;
  private sessionId: string | null = null;
  private sessionStartTime: number = 0;
  private recordedSamples: number = 0;
  private isPausedCallback: (() => boolean) | null = null;

  // Callback when mixed 16kHz PCM data is ready
  private onAudioDataCallback: ((data: Int16Array) => void) | null = null;

  async start(
    sessionId: string,
    routing: "mix" | "mic-only" | "speaker-only",
    onAudioData: (data: Int16Array) => void,
    isPaused: () => boolean,
  ): Promise<void> {
    if (typeof window === "undefined") return;

    this.sessionId = sessionId;
    this.sessionStartTime = Date.now();
    this.onAudioDataCallback = onAudioData;
    this.isPausedCallback = isPaused;
    this.recordedSamples = 0;

    this.audioContext = new (
      window.AudioContext || (window as any).webkitAudioContext
    )({
      sampleRate: 16000, // Request 16kHz context if browser supports it
    });

    const contextSampleRate = this.audioContext.sampleRate;

    try {
      const getMic = routing === "mix" || routing === "mic-only";
      const getSpeaker = routing === "mix" || routing === "speaker-only";

      if (getMic) {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
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

      if (getSpeaker) {
        // Capture screen/tab audio loopback
        this.speakerStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: { width: 1, height: 1 },
        });
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

      // Inline the AudioWorkletProcessor script
      const processorCode = `
        class AudioProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.bufferSize = 4096;
            this.buffer = new Float32Array(this.bufferSize);
            this.bufferIndex = 0;
          }

          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input && input.length > 0) {
              const channelData = input[0];
              if (channelData && channelData.length > 0) {
                for (let i = 0; i < channelData.length; i++) {
                  this.buffer[this.bufferIndex] = channelData[i];
                  this.bufferIndex++;
                  if (this.bufferIndex >= this.bufferSize) {
                    this.port.postMessage(this.buffer);
                    this.buffer = new Float32Array(this.bufferSize);
                    this.bufferIndex = 0;
                  }
                }
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

      // Connect nodes
      if (this.micSource) {
        this.micSource.connect(this.processorNode);
      }
      if (this.speakerSource) {
        this.speakerSource.connect(this.processorNode);
      }

      if (!this.audioContext) {
        throw new Error(
          "AudioContext was closed before connecting audio worklet destination.",
        );
      }
      this.processorNode.connect(this.audioContext.destination);

      this.processorNode.port.onmessage = (event) => {
        if (this.isPausedCallback && this.isPausedCallback()) {
          return;
        }

        const inputData = event.data as Float32Array;

        // Downsample input from native sample rate to 16kHz (in case contextSampleRate isn't 16000)
        const downsampled = this.downsample(
          inputData,
          contextSampleRate,
          16000,
        );
        const pcm16 = this.floatTo16BitPCM(downsampled);

        // Send to WebSocket callback
        if (this.onAudioDataCallback) {
          this.onAudioDataCallback(pcm16);
        }

        // Save chunk to IndexedDB
        if (this.sessionId) {
          const chunkStartMs = (this.recordedSamples / 16000) * 1000;
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
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.port.onmessage = null;
      this.processorNode = null;
    }

    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }

    if (this.speakerSource) {
      this.speakerSource.disconnect();
      this.speakerSource = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.speakerStream) {
      this.speakerStream.getTracks().forEach((track) => track.stop());
      this.speakerStream = null;
    }

    if (this.audioContext) {
      if (this.audioContext.state !== "closed") {
        this.audioContext.close();
      }
      this.audioContext = null;
    }

    this.sessionId = null;
    this.onAudioDataCallback = null;
    this.isPausedCallback = null;
    this.recordedSamples = 0;
  }

  // Linear box-filter downsampling
  private downsample(
    buffer: Float32Array,
    inputSampleRate: number,
    outputSampleRate: number,
  ): Float32Array {
    if (inputSampleRate === outputSampleRate) {
      return buffer;
    }
    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (
        let i = offsetBuffer;
        i < nextOffsetBuffer && i < buffer.length;
        i++
      ) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  // Convert Float32Array [-1.0, 1.0] to Int16Array PCM
  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
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

    // Add trailing padding so playback doesn't cut off abruptly at the last
    // token's acoustic boundary. Soniox duration_ms only covers the word
    // pronunciation; the extra pad captures natural trailing silence/decay.
    const paddedEndMs = endTimestampMs * 1.3 + 1000;

    // Get overlapping audio chunks (use the padded end to fetch enough data)
    const chunks = await db.getAudioChunksForRange(
      sessionId,
      startTimestampMs,
      paddedEndMs,
    );
    if (chunks.length === 0) {
      console.warn(
        "No audio chunks found for playback in range",
        startTimestampMs,
        endTimestampMs,
      );
      return;
    }

    // Concatenate all matching chunks
    let totalLength = 0;
    chunks.forEach((c) => {
      totalLength += c.data.length;
    });

    const combinedInt16 = new Int16Array(totalLength);
    let offset = 0;
    chunks.forEach((c) => {
      combinedInt16.set(c.data, offset);
      offset += c.data.length;
    });

    // Convert back to Float32 range [-1.0, 1.0]
    const combinedFloat32 = new Float32Array(totalLength);
    for (let i = 0; i < totalLength; i++) {
      combinedFloat32[i] = combinedInt16[i] / 32768.0;
    }

    // Determine sample rate and offsets
    const sampleRate = 16000;
    const samplesPerMs = sampleRate / 1000; // 16 samples/ms

    // Find the offset of the first chunk
    const firstChunkStart = chunks[0].startTimestamp;

    // Calculate crop positions in samples (use paddedEndMs for the end)
    const cropStartSample = Math.max(
      0,
      Math.round((startTimestampMs - firstChunkStart) * samplesPerMs),
    );
    const cropEndSample = Math.min(
      totalLength,
      Math.round((paddedEndMs - firstChunkStart) * samplesPerMs),
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

    // Play snippet
    const playCtx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const buffer = playCtx.createBuffer(1, snippet.length, 16000);
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
  }
}

export const audioCaptureManager = new AudioCaptureManager();
