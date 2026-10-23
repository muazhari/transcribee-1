export interface SonioxConfig {
  apiKey: string;
  model: string;
  languageHints: string[];
  enableEndpointDetection: boolean;
  enableLanguageIdentification: boolean;
  enableTranslation: boolean;
  translationMode: "one-way" | "two-way";
  translationTargetLanguage?: string;
  translationLanguageA?: string;
  translationLanguageB?: string;
}

export interface SonioxToken {
  text: string;
  speaker: string;
  start_ms?: number;
  end_ms?: number;
  duration_ms?: number;
  is_final: boolean;
  translation_status?: "original" | "translation";
  language: string;
}

export interface SonioxCallbacks {
  onOpen?: () => void;
  onClose?: () => void;
  onTokens: (tokens: SonioxToken[]) => void;
  onError?: (error: Event | string) => void;
  onReconnecting?: (attempt: number) => void;
  onReconnected?: (bufferedDurationMs: number) => void;
}

export class SonioxStreamClient {
  private ws: WebSocket | null = null;
  private callbacks: SonioxCallbacks | null = null;
  private currentConfig: SonioxConfig | null = null;
  private isIntentionallyClosed: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 8;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private audioBufferQueue: Int16Array[] = [];
  private readonly maxBufferQueueSize: number = 300; // ~30 seconds of audio buffer

  connect(config: SonioxConfig, callbacks: SonioxCallbacks): void {
    if (typeof window === "undefined") return;

    this.isIntentionallyClosed = false;
    this.currentConfig = config;
    this.callbacks = callbacks;
    this.reconnectAttempts = 0;
    this.audioBufferQueue = [];

    this.attemptConnect();
  }

  private attemptConnect(): void {
    if (this.isIntentionallyClosed || !this.currentConfig) return;

    try {
      if (this.ws) {
        try {
          this.ws.onopen = null;
          this.ws.onmessage = null;
          this.ws.onerror = null;
          this.ws.onclose = null;
          this.ws.close();
        } catch (e) {
          console.warn("[Soniox] Error closing previous socket:", e);
        }
        this.ws = null;
      }

      this.ws = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        if (!this.currentConfig || !this.ws) return;

        const isReconnect = this.reconnectAttempts > 0;
        this.reconnectAttempts = 0;

        const translation = this.currentConfig.enableTranslation
          ? this.currentConfig.translationMode === "one-way"
            ? {
                type: "one_way",
                target_language:
                  this.currentConfig.translationTargetLanguage || "id",
              }
            : {
                type: "two_way",
                language_a: this.currentConfig.translationLanguageA || "en",
                language_b: this.currentConfig.translationLanguageB || "id",
              }
          : undefined;

        const initialConfig: Record<string, unknown> = {
          api_key: this.currentConfig.apiKey,
          model: this.currentConfig.model,
          audio_format: "pcm_s16le",
          sample_rate: 16000,
          num_channels: 1,
          enable_speaker_diarization: true,
          enable_endpoint_detection: this.currentConfig.enableEndpointDetection,
          enable_language_identification:
            this.currentConfig.enableLanguageIdentification,
          language_hints: this.currentConfig.languageHints,
          ...(translation && { translation }),
        };

        this.ws.send(JSON.stringify(initialConfig));

        if (isReconnect) {
          console.info("[Soniox] Successfully reconnected STT WebSocket stream.");
          const bufferedSamples = this.audioBufferQueue.reduce(
            (sum, chunk) => sum + chunk.length,
            0,
          );
          this.callbacks?.onReconnected?.((bufferedSamples / 16000) * 1000);
        } else {
          this.callbacks?.onOpen?.();
        }

        // Flush buffered audio chunks recorded while reconnecting
        if (this.audioBufferQueue.length > 0) {
          console.info(
            `[Soniox] Flushing ${this.audioBufferQueue.length} buffered audio chunks after reconnect.`,
          );
          const queue = [...this.audioBufferQueue];
          this.audioBufferQueue = [];
          for (const chunk of queue) {
            this.sendAudio(chunk);
          }
        }
      };

      this.ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const response = JSON.parse(event.data);
            if (response.error_code) {
              this.callbacks?.onError?.(
                `${response.error_code}: ${response.error_message ?? "Unknown Soniox error"}`,
              );
            }
            if (response.tokens && this.callbacks?.onTokens) {
              this.callbacks.onTokens(response.tokens);
            }
          } catch (e) {
            console.error("Failed to parse Soniox message:", e);
          }
        }
      };

      this.ws.onerror = (event) => {
        console.error("Soniox WebSocket onError:", event);
        this.callbacks?.onError?.(event);
      };

      this.ws.onclose = (event: CloseEvent) => {
        console.warn("Soniox WebSocket onClose", event);

        if (this.isIntentionallyClosed) {
          this.callbacks?.onClose?.();
          return;
        }

        // Unexpected disconnect (screen off, sleep wake, network blip) -> auto-reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delayMs = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts - 1), 6000);
          console.warn(
            `[Soniox] Connection lost. Reconnecting attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delayMs}ms...`,
          );
          this.callbacks?.onReconnecting?.(this.reconnectAttempts);

          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            this.attemptConnect();
          }, delayMs);
        } else {
          console.error(
            "[Soniox] Maximum reconnection attempts reached. Terminating stream.",
          );
          this.callbacks?.onError?.(
            "Soniox connection lost and could not be recovered.",
          );
          this.callbacks?.onClose?.();
        }
      };
    } catch (err) {
      console.error("[Soniox] Failed to initiate WebSocket connection:", err);
    }
  }

  sendAudio(data: Int16Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data as unknown as BufferSource);
    } else if (!this.isIntentionallyClosed) {
      // Buffer incoming audio if socket is temporarily reconnecting
      if (this.audioBufferQueue.length < this.maxBufferQueueSize) {
        this.audioBufferQueue.push(data);
      }
    }
  }

  reconnectNow(): void {
    if (this.isIntentionallyClosed || !this.currentConfig) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    console.info("[Soniox] Forcing immediate reconnection (sleep wake / network restored)...");
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.attemptConnect();
  }

  updateConfig(config: SonioxConfig): void {
    this.currentConfig = config;
    if (!this.isIntentionallyClosed && this.ws) {
      this.reconnectAttempts = 1;
      this.attemptConnect();
    }
  }

  disconnect(): void {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.audioBufferQueue = [];

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks = null;
    this.currentConfig = null;
    this.reconnectAttempts = 0;
  }
}

export const sonioxStreamClient = new SonioxStreamClient();
