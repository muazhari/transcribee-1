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
  onError?: (error: Event) => void;
}

export class SonioxStreamClient {
  private ws: WebSocket | null = null;
  private callbacks: SonioxCallbacks | null = null;

  connect(config: SonioxConfig, callbacks: SonioxCallbacks): void {
    if (typeof window === "undefined") return;

    this.callbacks = callbacks;
    this.ws = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      console.log("Soniox WebSocket onOpen");

      const translation = config.enableTranslation
        ? config.translationMode === "one-way"
          ? { type: "one_way", target_language: config.translationTargetLanguage || "id" }
          : { type: "two_way", language_a: config.translationLanguageA || "en", language_b: config.translationLanguageB || "id" }
        : undefined;

      const initialConfig: Record<string, unknown> = {
        api_key: config.apiKey,
        model: config.model,
        audio_format: "pcm_s16le",
        sample_rate: 16000,
        num_channels: 1,
        enable_speaker_diarization: true,
        enable_endpoint_detection: config.enableEndpointDetection,
        enable_language_identification: config.enableLanguageIdentification,
        language_hints: config.languageHints,
        ...(translation && { translation }),
      };

      this.ws?.send(JSON.stringify(initialConfig));
      this.callbacks?.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      console.log("Soniox WebSocket onMessage:", event);
      if (typeof event.data === "string") {
        try {
          const response = JSON.parse(event.data);
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
      this.callbacks?.onClose?.();
    };
  }

  sendAudio(data: Int16Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data.buffer);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks = null;
  }
}

export const sonioxStreamClient = new SonioxStreamClient();
