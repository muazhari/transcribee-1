import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../store/storeHooks";
import { store } from "../store/store";
import { db, Transcript } from "../services/db";
import { ConfigState } from "../store/slices/configSlice";
import {
  updateTranscripts,
  commitLiveTranscripts,
} from "../store/slices/transcriptionSlice";
import {
  startRecordingState,
  stopRecordingState,
  setStreamHealth,
  setStreamError,
  setIsReconnecting,
  setKeepAliveActive,
} from "../store/slices/mediaControlSlice";
import { audioCaptureManager } from "../services/audioCapture";
import { sonioxStreamClient } from "../services/soniox";
import { keepAliveManager } from "../services/keepAlive";

function hasSonioxConfigChanged(prev: ConfigState, next: ConfigState): boolean {
  return (
    prev.sonioxApiKey !== next.sonioxApiKey ||
    prev.transcriptionModel !== next.transcriptionModel ||
    prev.enableEndpointDetection !== next.enableEndpointDetection ||
    prev.enableLanguageIdentification !== next.enableLanguageIdentification ||
    prev.enableTranslation !== next.enableTranslation ||
    prev.translationMode !== next.translationMode ||
    prev.translationTargetLanguage !== next.translationTargetLanguage ||
    prev.translationLanguageA !== next.translationLanguageA ||
    prev.translationLanguageB !== next.translationLanguageB ||
    prev.languageHints.join(",") !== next.languageHints.join(",")
  );
}

export function useRecordingSession(openSettings: () => void) {
  const dispatch = useAppDispatch();
  const activeSession = useAppSelector(
    (state) => state.persistence.activeSession,
  );
  const config = useAppSelector((state) => state.config);

  const pendingSave = useRef<Transcript[] | null>(null);
  const currentStreamOffsetRef = useRef<number>(0);
  const isStartingRef = useRef(false);

  const flushSave = useCallback(() => {
    const pending = pendingSave.current;
    if (!pending) return;
    pendingSave.current = null;
    db.saveTranscripts(pending).catch((err) => {
      console.error("Failed to sync transcripts to DB:", err);
    });
  }, []);

  const finalizeAndFlush = useCallback(() => {
    dispatch(commitLiveTranscripts());
    const latest = store.getState().transcription.transcripts;
    if (latest.length > 0) {
      pendingSave.current = latest;
      flushSave();
    }
  }, [dispatch, flushSave]);

  useEffect(() => {
    return () => {
      flushSave();
      keepAliveManager.stop();
    };
  }, [flushSave]);

  const stopRecordingWithError = useCallback(
    async (errorMessage?: string) => {
      isStartingRef.current = false;
      await audioCaptureManager.stop();
      sonioxStreamClient.disconnect();
      await keepAliveManager.stop();
      finalizeAndFlush();
      dispatch(stopRecordingState(errorMessage));
    },
    [dispatch, finalizeAndFlush],
  );

  const stopRecording = useCallback(
    () => stopRecordingWithError(),
    [stopRecordingWithError],
  );

  const handleTrackEnded = useCallback(() => {
    void stopRecordingWithError(
      "Audio source disconnected (microphone unplugged or screen share stopped).",
    );
  }, [stopRecordingWithError]);

  const startRecordingConnection = useCallback(
    (offsetTimestamp: number) => {
      if (!activeSession) return;

      currentStreamOffsetRef.current = offsetTimestamp;

      sonioxStreamClient.connect(
        {
          ...config,
          apiKey: config.sonioxApiKey,
          model: config.transcriptionModel,
        },
        {
          // Start capture only once the socket is open so no audio is saved without also being sent
          onOpen: () => {
            isStartingRef.current = false;
            dispatch(startRecordingState());
            dispatch(setIsReconnecting(false));

            if (!audioCaptureManager.isRunning) {
              audioCaptureManager
                .start(
                  activeSession.id,
                  config.audioRouting,
                  (pcmData) => sonioxStreamClient.sendAudio(pcmData),
                  offsetTimestamp,
                  handleTrackEnded,
                )
                .catch((err: unknown) => {
                  console.error("Audio recording setup failed:", err);
                  const errMsg =
                    err instanceof Error ? err.message : String(err);
                  alert(`Could not start recording: ${errMsg}`);
                  sonioxStreamClient.disconnect();
                  keepAliveManager.stop();
                  dispatch(stopRecordingState(errMsg));
                });
            }
          },
          onReconnecting: (attempt) => {
            console.warn(
              `[Transcribee] Background STT reconnecting attempt #${attempt}...`,
            );
            dispatch(setIsReconnecting(true));
          },
          onReconnected: (bufferedDurationMs = 0) => {
            console.info(
              "[Transcribee] STT WebSocket reconnected successfully! Resuming stream with updated offset.",
            );
            dispatch(setIsReconnecting(false));
            dispatch(setStreamHealth("good"));
            dispatch(commitLiveTranscripts());
            const latest = store.getState().transcription.transcripts;
            if (latest.length > 0) pendingSave.current = latest;
            // Align newly reconnected stream tokens with the start of audio sent to the new socket
            currentStreamOffsetRef.current = Math.max(
              0,
              audioCaptureManager.getRecordedDurationMs() - bufferedDurationMs,
            );
          },
          onClose: async () => {
            isStartingRef.current = false;
            await audioCaptureManager.stop();
            await keepAliveManager.stop();
            finalizeAndFlush();
            const existingError =
              store.getState().mediaControl.streamError ?? undefined;
            dispatch(stopRecordingState(existingError));
          },
          onError: (error) => {
            if (typeof error === "string") {
              console.warn(`Soniox error: ${error}`);
              dispatch(setStreamError(error));
            } else {
              dispatch(setStreamHealth("poor"));
            }
          },
          onTokens: (tokens) => {
            const streamOffset = currentStreamOffsetRef.current;
            const mappedTokens = tokens.map((t) => {
              const start = t.start_ms ?? 0;
              const end =
                t.end_ms ??
                (t.duration_ms !== undefined ? start + t.duration_ms : start);

              return {
                id: crypto.randomUUID(),
                sessionId: activeSession.id,
                text: t.text,
                speakerId: t.speaker,
                startTimestamp: start + streamOffset,
                endTimestamp: end + streamOffset,
                duration: end - start,
                isFinal: t.is_final,
                translationStatus: t.translation_status,
                language: t.language,
                offsetTimestamp: streamOffset,
              };
            });

            dispatch(updateTranscripts(mappedTokens));
            const latest = store.getState().transcription.transcripts;
            if (latest.length > 0) pendingSave.current = latest;
          },
        },
      );
    },
    [activeSession, config, dispatch, finalizeAndFlush, handleTrackEnded],
  );

  const startRecording = useCallback(async () => {
    if (isStartingRef.current) return;
    if (!activeSession) {
      alert("Please load or create a session first.");
      return;
    }
    if (!config.sonioxApiKey) {
      alert("Please configure your Soniox API Key in Settings first.");
      openSettings();
      return;
    }

    isStartingRef.current = true;
    try {
      // Calculate timestamp offset if there is existing recording data
      let offsetTimestamp = 0;
      const lastChunk = await db.getLastAudioChunk(activeSession.id);
      if (lastChunk) {
        const lastChunkDurationMs = lastChunk.data.length / 16;
        offsetTimestamp = lastChunk.startTimestamp + lastChunkDurationMs;
      }

      // Initialize background resilience & keep-awake features
      await keepAliveManager.start({
        enableWakeLock: config.enableKeepAwake,
        onHeartbeat: () => {
          flushSave();
        },
        onSleepWake: (suspendedDurationMs) => {
          console.info(
            `[Transcribee] Resumed from sleep/standby (suspended for ${suspendedDurationMs}ms). Recovering streams...`,
          );
          audioCaptureManager.resumeIfSuspended();
          sonioxStreamClient.reconnectNow();
          flushSave();
        },
        onStopRequested: () => {
          stopRecording();
        },
        onSaveRequested: () => {
          flushSave();
        },
        onAudioContextResumeRequested: () => {
          audioCaptureManager.resumeIfSuspended();
        },
        onNetworkRestored: () => {
          sonioxStreamClient.reconnectNow();
        },
      });
      dispatch(setKeepAliveActive(true));

      startRecordingConnection(offsetTimestamp);
    } catch (err: unknown) {
      console.error("Audio recording setup failed:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(`Could not start recording: ${errMsg}`);
      await stopRecordingWithError(errMsg);
    }
  }, [
    activeSession,
    config,
    openSettings,
    startRecordingConnection,
    stopRecording,
    stopRecordingWithError,
    flushSave,
    dispatch,
  ]);

  const applyLiveConfig = useCallback(
    async (prev: ConfigState, next: ConfigState) => {
      if (
        audioCaptureManager.isRunning &&
        activeSession &&
        next.audioRouting !== prev.audioRouting
      ) {
        const resumeOffset = audioCaptureManager.getRecordedDurationMs();
        try {
          await audioCaptureManager.start(
            activeSession.id,
            next.audioRouting,
            (pcmData) => sonioxStreamClient.sendAudio(pcmData),
            resumeOffset,
            handleTrackEnded,
          );
        } catch (err: unknown) {
          console.error("Audio rerouting failed:", err);
          const errMsg = err instanceof Error ? err.message : String(err);
          alert(`Audio rerouting failed: ${errMsg}`);
          await stopRecordingWithError(`Audio rerouting failed: ${errMsg}`);
          return;
        }
      }

      if (hasSonioxConfigChanged(prev, next)) {
        sonioxStreamClient.updateConfig({
          ...next,
          apiKey: next.sonioxApiKey,
          model: next.transcriptionModel,
        });
      }
    },
    [activeSession, handleTrackEnded, stopRecordingWithError],
  );

  return {
    startRecording,
    stopRecording,
    applyLiveConfig,
  };
}
