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

export class SonioxStreamClient {
  private ws: WebSocket | null = null;
  private onTokensCallback: ((tokens: any[]) => void) | null = null;
  private onErrorCallback: ((error: any) => void) | null = null;
  private onOpenCallback: (() => void) | null = null;
  private onCloseCallback: (() => void) | null = null;

  connect(
    config: SonioxConfig,
    callbacks: {
      onOpen?: () => void;
      onClose?: () => void;
      onTokens: (tokens: any[]) => void;
      onError?: (error: any) => void;
    },
  ): void {
    if (typeof window === "undefined") return;

    this.onTokensCallback = callbacks.onTokens;
    this.onErrorCallback = callbacks.onError || null;
    this.onOpenCallback = callbacks.onOpen || null;
    this.onCloseCallback = callbacks.onClose || null;

    // Soniox WebSocket STT endpoint
    const url = "wss://stt-rt.soniox.com/transcribe-websocket";
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      console.log("Soniox WebSocket onOpen");

      // Send initial JSON configuration message
      const initialConfig: any = {
        api_key: config.apiKey,
        model: config.model,
        audio_format: "pcm_s16le",
        sample_rate: 16000,
        num_channels: 1,
        enable_speaker_diarization: true,
        enable_endpoint_detection: config.enableEndpointDetection,
        enable_language_identification: config.enableLanguageIdentification,
        language_hints: config.languageHints,
      };

      // Add translation properties if enabled
      if (config.enableTranslation) {
        if (config.translationMode === "one-way") {
          initialConfig.translation = {
            type: "one_way",
            target_language: config.translationTargetLanguage || "id",
          };
        } else if (config.translationMode === "two-way") {
          initialConfig.translation = {
            type: "two_way",
            language_a: config.translationLanguageA || "en",
            language_b: config.translationLanguageB || "id",
          };
        }
      } else {
        delete initialConfig.translation;
      }

      this.ws?.send(JSON.stringify(initialConfig));
      if (this.onOpenCallback) {
        this.onOpenCallback();
      }
    };

    this.ws.onmessage = (event) => {
      console.log("Soniox WebSocket onMessage:", event);
      if (typeof event.data === "string") {
        try {
          const response = JSON.parse(event.data);
          if (response.tokens && this.onTokensCallback) {
            this.onTokensCallback(response.tokens);
          }
        } catch (e) {
          console.error("Failed to parse Soniox message:", e);
        }
      }
    };

    this.ws.onerror = (event) => {
      console.error("Soniox WebSocket onError:", event);
      if (this.onErrorCallback) {
        this.onErrorCallback(event);
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.warn("Soniox WebSocket onClose", event);
      if (this.onCloseCallback) {
        this.onCloseCallback();
      }
    };
  }

  sendAudio(data: Int16Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data.buffer);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onTokensCallback = null;
    this.onErrorCallback = null;
    this.onOpenCallback = null;
    this.onCloseCallback = null;
  }
}

export const sonioxStreamClient = new SonioxStreamClient();
