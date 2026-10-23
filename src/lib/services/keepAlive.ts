import { AudioCaptureManager } from "./audioCapture";

export interface KeepAliveOptions {
  enableWakeLock?: boolean;
  onSleepWake?: (suspendedDurationMs: number) => void;
  onHeartbeat?: () => void;
  onStopRequested?: () => void;
  onSaveRequested?: () => void;
  onAudioContextResumeRequested?: () => void;
  onNetworkRestored?: () => void;
}

export class KeepAliveManager {
  private isActive = false;
  private options: KeepAliveOptions = {};

  // Wake Lock API
  private wakeLockSentinel: WakeLockSentinel | null = null;
  private isRequestingWakeLock = false;

  // Background Audio Keep-Alive
  private audioElement: HTMLAudioElement | null = null;
  private audioObjectUrl: string | null = null;

  // Background Web Worker Ticker (immune to main-thread background throttling)
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private fallbackInterval: ReturnType<typeof setInterval> | null = null;
  private lastTickTime: number = Date.now();

  // Bound event listeners
  private boundVisibilityChange = this.handleVisibilityChange.bind(this);
  private boundWindowFocus = this.handleWindowFocus.bind(this);
  private boundOnline = this.handleOnline.bind(this);
  private boundPageHide = this.handlePageHide.bind(this);
  private boundFreeze = this.handleFreeze.bind(this);
  private boundResume = this.handleResume.bind(this);

  async start(options: KeepAliveOptions = {}): Promise<void> {
    if (typeof window === "undefined") return;
    this.isActive = true;
    this.options = options;
    this.lastTickTime = Date.now();

    // 1. Setup Media Session API (shows on lock screen & media controls)
    this.setupMediaSession();

    // 2. Start HTML5 inaudible audio loop (elevates browser tab priority)
    this.startAudioLoop();

    // 3. Request Screen Wake Lock if enabled
    if (options.enableWakeLock !== false) {
      await this.requestWakeLock();
    }

    // 4. Start non-throttled background worker ticker
    this.startWorkerTicker();

    // 5. Register global lifecycle event listeners
    this.registerEventListeners();
  }

  async stop(): Promise<void> {
    this.isActive = false;

    // 1. Release wake lock
    await this.releaseWakeLock();

    // 2. Stop audio loop
    this.stopAudioLoop();

    // 3. Stop background worker ticker
    this.stopWorkerTicker();

    // 4. Clear Media Session
    this.clearMediaSession();

    // 5. Unregister lifecycle event listeners
    this.unregisterEventListeners();

    this.options = {};
  }

  get isRunning(): boolean {
    return this.isActive;
  }

  // --- Screen Wake Lock API ---

  async requestWakeLock(): Promise<void> {
    if (
      typeof navigator === "undefined" ||
      !("wakeLock" in navigator) ||
      !this.isActive ||
      this.isRequestingWakeLock
    ) {
      return;
    }

    // Only request wake lock if the document is visible, per W3C specification
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }

    try {
      this.isRequestingWakeLock = true;
      this.wakeLockSentinel = await navigator.wakeLock.request("screen");
      this.wakeLockSentinel.addEventListener("release", () => {
        this.wakeLockSentinel = null;
        // If still active and document is visible, attempt to re-acquire
        if (
          this.isActive &&
          this.options.enableWakeLock !== false &&
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          this.requestWakeLock().catch(() => {});
        }
      });
    } catch (err) {
      console.warn("Screen Wake Lock request failed:", err);
    } finally {
      this.isRequestingWakeLock = false;
    }
  }

  async releaseWakeLock(): Promise<void> {
    if (this.wakeLockSentinel) {
      try {
        await this.wakeLockSentinel.release();
      } catch (err) {
        console.warn("Error releasing wake lock:", err);
      }
      this.wakeLockSentinel = null;
    }
  }

  // --- HTML5 Inaudible Looping Audio Element ---
  // Signals the browser & OS that this tab has active media playback,
  // preventing background freezing, thread suspension, and process discarding.

  private startAudioLoop(): void {
    if (typeof window === "undefined") return;

    try {
      if (!this.audioElement) {
        this.audioElement = new Audio();
        this.audioElement.setAttribute("playsinline", "true");
        this.audioElement.setAttribute("webkit-playsinline", "true");
        this.audioElement.loop = true;
        this.audioElement.volume = 0.01; // Minimal non-zero volume so OS audio daemon does not prune it

        this.audioObjectUrl = this.generateInaudibleWavUrl();
        this.audioElement.src = this.audioObjectUrl;
      }

      const playPromise = this.audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // May be prevented if not triggered directly by user gesture, but will retry on focus/click
          console.warn("Keep-alive background audio play pending gesture:", err);
        });
      }
    } catch (err) {
      console.warn("Failed to initialize background audio keep-alive:", err);
    }
  }

  private stopAudioLoop(): void {
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.removeAttribute("src");
        this.audioElement.load();
      } catch (e) {
        console.warn("Error pausing keep-alive audio element:", e);
      }
      this.audioElement = null;
    }

    if (this.audioObjectUrl) {
      URL.revokeObjectURL(this.audioObjectUrl);
      this.audioObjectUrl = null;
    }
  }

  // Generate an inaudible 8000Hz mono 16-bit PCM WAV (duration 1 second)
  // Values are alternating +1 and -1 (amplitude ~ -90dB, completely inaudible to human ear,
  // but treated as non-silent PCM signal by iOS/Android/Windows/macOS audio mixers)
  private generateInaudibleWavUrl(): string {
    const samples = new Int16Array(8000);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = i % 2 === 0 ? 1 : -1;
    }
    return URL.createObjectURL(AudioCaptureManager.encodeWav(samples, 8000));
  }

  // --- Media Session API ---

  private setupMediaSession(): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Transcribing Live...",
        artist: "Transcribee",
        album: "Real-time AI Transcription",
        artwork: [
          { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
        ],
      });

      navigator.mediaSession.playbackState = "playing";

      const handleStop = () => {
        if (this.options.onStopRequested) {
          this.options.onStopRequested();
        }
      };

      try {
        navigator.mediaSession.setActionHandler("stop", handleStop);
        navigator.mediaSession.setActionHandler("pause", handleStop);
        navigator.mediaSession.setActionHandler("play", () => {
          this.startAudioLoop();
          this.options.onAudioContextResumeRequested?.();
        });
      } catch (err) {
        console.warn("Some MediaSession action handlers not supported:", err);
      }
    } catch (err) {
      console.warn("MediaSession initialization error:", err);
    }
  }

  private clearMediaSession(): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.setActionHandler("stop", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("play", null);
    } catch (err) {
      console.warn("MediaSession cleanup warning:", err);
    }
  }

  // --- Background Worker Ticker & Sleep-Wake Detection ---

  private startWorkerTicker(): void {
    this.stopWorkerTicker();
    this.lastTickTime = Date.now();

    if (typeof window === "undefined") return;

    // Use Web Worker if available to bypass main-thread background timer throttling
    if (typeof Worker !== "undefined") {
      try {
        const workerScript = `
          var timer = null;
          self.onmessage = function(e) {
            if (e.data === 'start') {
              if (timer) clearInterval(timer);
              timer = setInterval(function() {
                self.postMessage({ type: 'tick', timestamp: Date.now() });
              }, 1000);
            } else if (e.data === 'stop') {
              if (timer) clearInterval(timer);
              timer = null;
            }
          };
        `;
        const blob = new Blob([workerScript], { type: "application/javascript" });
        this.workerUrl = URL.createObjectURL(blob);
        this.worker = new Worker(this.workerUrl);

        this.worker.onmessage = (event) => {
          if (event.data?.type === "tick") {
            this.handleTick();
          }
        };

        this.worker.postMessage("start");
        return;
      } catch (err) {
        console.warn("Failed to create background worker, falling back to setInterval:", err);
      }
    }

    // Fallback interval
    this.fallbackInterval = setInterval(() => {
      this.handleTick();
    }, 1000);
  }

  private stopWorkerTicker(): void {
    if (this.worker) {
      try {
        this.worker.postMessage("stop");
        this.worker.terminate();
      } catch (e) {
        console.warn("Error terminating background worker:", e);
      }
      this.worker = null;
    }

    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }

    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
  }

  private handleTick(): void {
    if (!this.isActive) return;

    const now = Date.now();
    const elapsed = now - this.lastTickTime;
    this.lastTickTime = now;

    // A gap > 3500ms on a 1000ms ticker indicates the CPU was suspended / device slept
    if (elapsed > 3500) {
      console.info(`[KeepAlive] Detected system sleep wake. Suspended for ~${elapsed}ms`);
      this.handleSleepWake(elapsed);
    }

    this.options.onHeartbeat?.();
  }

  private handleSleepWake(suspendedDurationMs: number): void {
    // 1. Resume audio context
    this.options.onAudioContextResumeRequested?.();

    // 2. Ensure inaudible loop is playing
    if (this.audioElement && this.audioElement.paused) {
      this.audioElement.play().catch(() => {});
    }

    // 3. Re-acquire wake lock if visible
    if (
      this.options.enableWakeLock !== false &&
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
    ) {
      this.requestWakeLock().catch(() => {});
    }

    // 4. Trigger sleep wake callback
    this.options.onSleepWake?.(suspendedDurationMs);
  }

  // --- Lifecycle Event Handlers ---

  private registerEventListeners(): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    document.addEventListener("visibilitychange", this.boundVisibilityChange);
    window.addEventListener("focus", this.boundWindowFocus);
    window.addEventListener("online", this.boundOnline);
    window.addEventListener("pagehide", this.boundPageHide);
    window.addEventListener("beforeunload", this.boundPageHide);

    // Page Lifecycle API (freeze & resume events)
    document.addEventListener("freeze" as unknown as keyof DocumentEventMap, this.boundFreeze);
    document.addEventListener("resume" as unknown as keyof DocumentEventMap, this.boundResume);
  }

  private unregisterEventListeners(): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    document.removeEventListener("visibilitychange", this.boundVisibilityChange);
    window.removeEventListener("focus", this.boundWindowFocus);
    window.removeEventListener("online", this.boundOnline);
    window.removeEventListener("pagehide", this.boundPageHide);
    window.removeEventListener("beforeunload", this.boundPageHide);

    document.removeEventListener("freeze" as unknown as keyof DocumentEventMap, this.boundFreeze);
    document.removeEventListener("resume" as unknown as keyof DocumentEventMap, this.boundResume);
  }

  private handleVisibilityChange(): void {
    if (!this.isActive || typeof document === "undefined") return;

    if (document.visibilityState === "hidden") {
      // Background tab / minimized / screen off
      // Save pending state immediately to prevent data loss if browser discards tab
      this.options.onSaveRequested?.();

      // Ensure audio loop stays playing to protect the tab process
      if (this.audioElement && this.audioElement.paused) {
        this.audioElement.play().catch(() => {});
      }
    } else if (document.visibilityState === "visible") {
      // Returned to foreground
      if (this.options.enableWakeLock !== false) {
        this.requestWakeLock().catch(() => {});
      }
      this.options.onAudioContextResumeRequested?.();
    }
  }

  private handleWindowFocus(): void {
    if (!this.isActive) return;
    this.options.onAudioContextResumeRequested?.();
  }

  private handleOnline(): void {
    if (!this.isActive) return;
    console.info("[KeepAlive] Network connection restored.");
    this.options.onNetworkRestored?.();
  }

  private handlePageHide(): void {
    if (!this.isActive) return;
    this.options.onSaveRequested?.();
  }

  private handleFreeze(): void {
    if (!this.isActive) return;
    this.options.onSaveRequested?.();
  }

  private handleResume(): void {
    if (!this.isActive) return;
    this.handleSleepWake(1000);
  }
}

export const keepAliveManager = new KeepAliveManager();
