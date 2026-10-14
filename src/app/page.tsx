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
  setDeviceStatus,
  setStreamHealth,
} from "../lib/store/slices/mediaControlSlice";
import { clearChatHistory } from "../lib/store/slices/chatContextSlice";
import { audioCaptureManager } from "../lib/services/audioCapture";
import { sonioxStreamClient } from "../lib/services/soniox";

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

  // Load existing sessions on mount
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const list = await db.getSessions();
        dispatch(setSessions(list));

        // Check media devices status
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const hasMic = devices.some((d) => d.kind === "audioinput");
          const hasSpeaker = devices.some((d) => d.kind === "audiooutput");
          dispatch(
            setDeviceStatus({
              micConnected: hasMic,
              speakerConnected: hasSpeaker,
            }),
          );
        }
      } catch (e) {
        console.error("Failed to load initial data:", e);
      }
    };
    loadSessions();
  }, [dispatch]);

  // Sync transcripts to IndexedDB at most every 2s (rewriting the whole session on every token batch is O(n) each time)
  const pendingSave = useRef<Transcript[] | null>(null);
  const flushSave = useCallback(() => {
    const pending = pendingSave.current;
    if (!pending) return;
    pendingSave.current = null;
    db.saveTranscripts(pending).catch((err) => {
      console.error("Failed to sync transcripts to DB:", err);
    });
  }, []);

  useEffect(() => {
    // Pending transcripts of a previous session must not wait for the timer
    if (pendingSave.current?.[0]?.sessionId !== activeSession?.id) flushSave();
    if (activeSession && transcripts.length > 0) {
      pendingSave.current = transcripts;
    }
  }, [transcripts, activeSession, flushSave]);

  useEffect(() => {
    const timer = setInterval(flushSave, 2000);
    return () => {
      clearInterval(timer);
      flushSave();
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
      audioBlobPath: "",
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
    try {
      await db.saveSession(updated);
      dispatch(setActiveSession(updated));
      const list = await db.getSessions();
      dispatch(setSessions(list));
    } catch (e) {
      console.error("Failed to rename session:", e);
    }
  };

  const startRecordingConnection = useCallback((offsetTimestamp: number) => {
    if (!activeSession) return;

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
          audioCaptureManager
            .start(
              activeSession.id,
              config.audioRouting,
              (pcmData) => sonioxStreamClient.sendAudio(pcmData),
              offsetTimestamp,
            )
            .catch((err: unknown) => {
              console.error("Audio recording setup failed:", err);
              const errMsg = err instanceof Error ? err.message : String(err);
              alert(`Could not start recording: ${errMsg}`);
              sonioxStreamClient.disconnect();
              dispatch(stopRecordingState());
            });
        },
        onClose: async () => {
          await audioCaptureManager.stop();
          dispatch(stopRecordingState());
        },
        onError: (error) => {
          dispatch(setStreamHealth("poor"));
          if (typeof error === "string") alert(`Soniox error: ${error}`);
        },
        onTokens: (tokens) => {
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
              startTimestamp: start + offsetTimestamp,
              endTimestamp: end + offsetTimestamp,
              duration: end - start,
              isFinal: t.is_final,
              translationStatus: t.translation_status,
              language: t.language,
              offsetTimestamp,
            };
          });

          dispatch(updateTranscripts(mappedTokens));
        },
      },
    );
  }, [activeSession, config, dispatch]);

  const stopRecording = useCallback(async () => {
    await audioCaptureManager.stop();
    sonioxStreamClient.disconnect();
    dispatch(stopRecordingState());
    dispatch(commitLiveTranscripts());
    flushSave();
  }, [dispatch, flushSave]);

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

      startRecordingConnection(offsetTimestamp);
    } catch (err: unknown) {
      console.error("Audio recording setup failed:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(`Could not start recording: ${errMsg}`);
      await stopRecording();
    }
  }, [activeSession, config, startRecordingConnection, stopRecording]);

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
      <div className="flex-1 w-full flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* SessionPanel history */}
        <div
          className={`${activeTab === "sessions" ? "flex" : "max-lg:hidden"} lg:flex h-full shrink-0 w-full lg:w-auto`}
        >
          <SessionPanel
            onNewSession={handleNewSession}
            openSettings={() => setIsSettingsOpen(true)}
            onSelectSession={() => setActiveTab("transcription")}
          />
        </div>

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

        {/* Chat Assistant */}
        <div
          className={`${activeTab === "chat" ? "flex" : "max-lg:hidden"} lg:flex h-full shrink-0 w-full lg:w-auto`}
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
