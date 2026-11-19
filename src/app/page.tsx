"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../lib/store/storeHooks";
import { db, Transcript } from "../lib/services/db";
import {
  setSessions,
  setActiveSession,
  addSessionToList,
} from "../lib/store/slices/persistenceSlice";
import {
  setSessionId,
  updateTranscripts,
  commitLiveTranscripts,
} from "../lib/store/slices/transcriptionSlice";
import {
  startRecordingState,
  stopRecordingState,
  setStreamHealth,
  setIsReconnecting,
  setKeepAliveActive,
} from "../lib/store/slices/mediaControlSlice";
import { clearChatHistory } from "../lib/store/slices/chatContextSlice";
import { audioCaptureManager } from "../lib/services/audioCapture";
import { sonioxStreamClient } from "../lib/services/soniox";
import { keepAliveManager } from "../lib/services/keepAlive";

import SessionPanel from "../components/SessionPanel";
import SettingsDrawer from "../components/SettingsDrawer";
import TranscriptPanel from "../components/TranscriptPanel";
import ChatPanel from "../components/ChatPanel";
import PlaybackPanel from "../components/PlaybackPanel";

const MOBILE_TABS = [
  { id: "sessions", label: "🏠 Home" },
  { id: "transcription", label: "🎙️ Live Session" },
  { id: "playback", label: "🔊 Playback Session" },
  { id: "chat", label: "🤖 AI Chat" },
] as const;

const DEFAULT_LEFT_WIDTH = 320;
const DEFAULT_RIGHT_WIDTH = 384;
const MIN_LEFT_WIDTH = 220;
const MIN_RIGHT_WIDTH = 260;
const MIN_MAIN_WIDTH = 320;
const KEYBOARD_RESIZE_STEP = 16;

function clampPanelWidth(
  value: number,
  minWidth: number,
  otherPanelWidth: number,
  containerWidth: number,
) {
  const maxWidth =
    containerWidth > 0
      ? Math.max(minWidth, containerWidth - otherPanelWidth - MIN_MAIN_WIDTH)
      : value;
  return Math.round(Math.min(Math.max(value, minWidth), maxWidth));
}

interface ResizeHandleProps {
  label: string;
  value: number;
  min: number;
  active: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

function ResizeHandle({
  label,
  value,
  min,
  active,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
}: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onKeyDown={onKeyDown}
      className="hidden lg:flex w-1.5 -mx-[3px] z-10 h-full shrink-0 cursor-col-resize select-none touch-none items-center justify-center group focus:outline-none"
    >
      <div
        className={`w-0.5 h-full transition-colors ${
          active
            ? "bg-violet-500"
            : "bg-transparent group-hover:bg-violet-500/80 group-focus-visible:bg-violet-500"
        }`}
      />
    </div>
  );
}

export default function Home() {
  const dispatch = useAppDispatch();
  const activeSession = useAppSelector(
    (state) => state.persistence.activeSession,
  );
  const transcripts = useAppSelector(
    (state) => state.transcription.transcripts,
  );

  const isRecording = useAppSelector((state) => state.mediaControl.isRecording);

  const config = useAppSelector((state) => state.config);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "sessions" | "transcription" | "playback" | "chat"
  >("transcription");

  const layoutRef = useRef<HTMLDivElement>(null);
  const [panelWidths, setPanelWidths] = useState({
    left: DEFAULT_LEFT_WIDTH,
    right: DEFAULT_RIGHT_WIDTH,
  });
  const [dragging, setDragging] = useState<"left" | "right" | null>(null);
  const dragRef = useRef<{
    side: "left" | "right";
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    const clampToViewport = () => {
      const width = layoutRef.current?.clientWidth ?? 0;
      if (width < 1024) return;
      setPanelWidths((prev) => {
        if (prev.left + prev.right <= width - MIN_MAIN_WIDTH) return prev;
        const left = clampPanelWidth(
          prev.left,
          MIN_LEFT_WIDTH,
          prev.right,
          width,
        );
        const right = clampPanelWidth(prev.right, MIN_RIGHT_WIDTH, left, width);
        return left === prev.left && right === prev.right
          ? prev
          : { left, right };
      });
    };
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, []);

  const startResize = (
    side: "left" | "right",
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      side,
      startX: e.clientX,
      startWidth: side === "left" ? panelWidths.left : panelWidths.right,
    };
    setDragging(side);
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const containerWidth = layoutRef.current?.clientWidth ?? 0;
    const delta =
      drag.side === "left" ? e.clientX - drag.startX : drag.startX - e.clientX;
    setPanelWidths((prev) =>
      drag.side === "left"
        ? {
            ...prev,
            left: clampPanelWidth(
              drag.startWidth + delta,
              MIN_LEFT_WIDTH,
              prev.right,
              containerWidth,
            ),
          }
        : {
            ...prev,
            right: clampPanelWidth(
              drag.startWidth + delta,
              MIN_RIGHT_WIDTH,
              prev.left,
              containerWidth,
            ),
          },
    );
  };

  const stopResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleResizeKeyDown = (
    side: "left" | "right",
    e: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const containerWidth = layoutRef.current?.clientWidth ?? 0;
    const sign = (e.key === "ArrowRight" ? 1 : -1) * (side === "left" ? 1 : -1);
    const delta = sign * KEYBOARD_RESIZE_STEP;
    setPanelWidths((prev) =>
      side === "left"
        ? {
            ...prev,
            left: clampPanelWidth(
              prev.left + delta,
              MIN_LEFT_WIDTH,
              prev.right,
              containerWidth,
            ),
          }
        : {
            ...prev,
            right: clampPanelWidth(
              prev.right + delta,
              MIN_RIGHT_WIDTH,
              prev.left,
              containerWidth,
            ),
          },
    );
  };

  // Load existing sessions on mount
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const list = await db.getSessions();
        dispatch(setSessions(list));
      } catch (e) {
        console.error("Failed to load initial data:", e);
      }
    };
    loadSessions();
  }, [dispatch]);

  const pendingSave = useRef<Transcript[] | null>(null);
  const isTranscriptsDirty = useRef(false);
  const currentStreamOffsetRef = useRef<number>(0);
  const flushSave = useCallback(() => {
    const pending = pendingSave.current;
    if (!pending) return;
    pendingSave.current = null;
    db.saveTranscripts(pending).catch((err) => {
      console.error("Failed to sync transcripts to DB:", err);
    });
  }, []);

  useEffect(() => {
    if (!isTranscriptsDirty.current) return;
    isTranscriptsDirty.current = false;
    if (activeSession && transcripts.length > 0) {
      pendingSave.current = transcripts;
      if (!isRecording) flushSave();
    }
  }, [transcripts, activeSession, isRecording, flushSave]);

  useEffect(() => {
    return () => {
      flushSave();
      keepAliveManager.stop();
    };
  }, [flushSave]);

  const handleNewSession = async () => {
    if (isRecording) {
      alert("Please stop recording before starting a new session.");
      return;
    }
    const session = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      title: "",
    };
    try {
      await db.saveSession(session);
      dispatch(addSessionToList(session));
      dispatch(setActiveSession(session));
      dispatch(setSessionId(session.id));
      dispatch(clearChatHistory());
      setActiveTab("transcription");
    } catch (e) {
      console.error("Failed to create new session:", e);
    }
  };

  const handleRenameSession = async (title: string) => {
    if (!activeSession) return;
    const updated = { ...activeSession, title };
    dispatch(setActiveSession(updated));
    try {
      await db.saveSession(updated);
    } catch (e) {
      console.error("Failed to rename session:", e);
    }
  };

  const stopRecording = useCallback(async () => {
    await audioCaptureManager.stop();
    sonioxStreamClient.disconnect();
    await keepAliveManager.stop();
    isTranscriptsDirty.current = true;
    dispatch(stopRecordingState());
    dispatch(commitLiveTranscripts());
    if (pendingSave.current) {
      pendingSave.current = pendingSave.current.map((t) =>
        t.isFinal ? t : { ...t, isFinal: true },
      );
      flushSave();
    }
  }, [dispatch, flushSave]);

  const startRecordingConnection = useCallback(
    (offsetTimestamp: number) => {
      if (!activeSession) return;

      currentStreamOffsetRef.current = offsetTimestamp;

      // Connect to Soniox STT WebSocket
      sonioxStreamClient.connect(
        {
          ...config,
          apiKey: config.sonioxApiKey,
          model: config.transcriptionModel,
        },
        {
          // Start capture only once the socket is open so no audio is saved without also being sent
          onOpen: () => {
            dispatch(startRecordingState());
            dispatch(setIsReconnecting(false));

            if (!audioCaptureManager.isRunning) {
              audioCaptureManager
                .start(
                  activeSession.id,
                  config.audioRouting,
                  (pcmData) => sonioxStreamClient.sendAudio(pcmData),
                  offsetTimestamp,
                )
                .catch((err: unknown) => {
                  console.error("Audio recording setup failed:", err);
                  const errMsg =
                    err instanceof Error ? err.message : String(err);
                  alert(`Could not start recording: ${errMsg}`);
                  sonioxStreamClient.disconnect();
                  keepAliveManager.stop();
                  dispatch(stopRecordingState());
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
            isTranscriptsDirty.current = true;
            dispatch(commitLiveTranscripts());
            // Align newly reconnected stream tokens with the start of audio sent to the new socket
            currentStreamOffsetRef.current = Math.max(
              0,
              audioCaptureManager.getRecordedDurationMs() - bufferedDurationMs,
            );
          },
          onClose: async () => {
            await audioCaptureManager.stop();
            await keepAliveManager.stop();
            dispatch(stopRecordingState());
          },
          onError: (error) => {
            dispatch(setStreamHealth("poor"));
            if (typeof error === "string") console.warn(`Soniox error: ${error}`);
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

            isTranscriptsDirty.current = true;
            dispatch(updateTranscripts(mappedTokens));
          },
        },
      );
    },
    [activeSession, config, dispatch],
  );

  const startRecording = useCallback(async () => {
    if (!activeSession) {
      alert("Please load or create a session first.");
      return;
    }
    if (!config.sonioxApiKey) {
      alert("Please configure your Soniox API Key in Settings first.");
      setIsSettingsOpen(true);
      return;
    }

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
          // Non-throttled heartbeat tick from Web Worker background thread
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
      await stopRecording();
    }
  }, [activeSession, config, startRecordingConnection, stopRecording, flushSave, dispatch]);

  return (
    <main className="h-dvh w-full flex flex-col bg-neutral-900 font-sans overflow-hidden">
      {/* Header for mobile only */}
      <div className="lg:hidden flex w-full bg-neutral-950 border-b border-white/10 overflow-x-auto scrollbar-none shrink-0">
        <div className="flex px-4 py-3 gap-2 min-w-max w-full justify-around">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-950/30"
                  : "text-neutral-400 hover:text-white bg-neutral-900/60 border border-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div
        ref={layoutRef}
        className={`flex-1 w-full flex flex-col lg:flex-row min-h-0 overflow-hidden ${
          dragging ? "select-none cursor-col-resize" : ""
        }`}
      >
        {/* SessionPanel history */}
        <div
          style={
            { "--panel-w": `${panelWidths.left}px` } as React.CSSProperties
          }
          className={`${activeTab === "sessions" ? "flex" : "max-lg:hidden"} lg:flex h-full shrink-0 w-full lg:w-[var(--panel-w)]`}
        >
          <SessionPanel
            onNewSession={handleNewSession}
            openSettings={() => setIsSettingsOpen(true)}
            onSelectSession={() => setActiveTab("transcription")}
          />
        </div>

        <ResizeHandle
          label="Resize sessions panel"
          value={panelWidths.left}
          min={MIN_LEFT_WIDTH}
          active={dragging === "left"}
          onPointerDown={(e) => startResize("left", e)}
          onPointerMove={handleResizeMove}
          onPointerUp={stopResize}
          onKeyDown={(e) => handleResizeKeyDown("left", e)}
        />

        {/* Main panel */}
        <div
          className={`${
            activeTab === "transcription" || activeTab === "playback"
              ? "flex"
              : "max-lg:hidden"
          } lg:flex flex-1 flex-col min-w-0 h-full relative`}
        >
          {/* Workspace Tabs (Desktop Only) */}
          <div className="hidden lg:flex bg-neutral-950 border-b border-white/10 px-6 py-2.5 gap-4 shrink-0">
            <button
              onClick={() => setActiveTab("transcription")}
              className={`pb-2 pt-1 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab !== "playback"
                  ? "border-violet-500 text-white"
                  : "border-transparent text-neutral-400 hover:text-white"
              }`}
            >
              🎙️ Live Session
            </button>
            <button
              onClick={() => setActiveTab("playback")}
              className={`pb-2 pt-1 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === "playback"
                  ? "border-violet-500 text-white"
                  : "border-transparent text-neutral-400 hover:text-white"
              }`}
            >
              🔊 Playback Session
            </button>
          </div>

          {activeTab === "playback" ? (
            <PlaybackPanel />
          ) : (
            <TranscriptPanel
              onRenameSession={handleRenameSession}
              startRecording={startRecording}
              stopRecording={stopRecording}
            />
          )}
        </div>

        <ResizeHandle
          label="Resize chat panel"
          value={panelWidths.right}
          min={MIN_RIGHT_WIDTH}
          active={dragging === "right"}
          onPointerDown={(e) => startResize("right", e)}
          onPointerMove={handleResizeMove}
          onPointerUp={stopResize}
          onKeyDown={(e) => handleResizeKeyDown("right", e)}
        />

        {/* Chat Assistant */}
        <div
          style={
            { "--panel-w": `${panelWidths.right}px` } as React.CSSProperties
          }
          className={`${activeTab === "chat" ? "flex" : "max-lg:hidden"} lg:flex h-full shrink-0 w-full lg:w-[var(--panel-w)]`}
        >
          <ChatPanel />
        </div>

        {/* Settings Dialog */}
        <SettingsDrawer
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </div>
    </main>
  );
}
