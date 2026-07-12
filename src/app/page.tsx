"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../lib/store/storeHooks";
import { db } from "../lib/services/db";
import {
  setSessions,
  setActiveSession,
  addSessionToList,
} from "../lib/store/slices/persistenceSlice";
import {
  setSessionId,
  updateTranscripts,
  clearTranscripts,
  truncateOldTranscripts,
} from "../lib/store/slices/transcriptionSlice";
import {
  startRecordingState,
  stopRecordingState,
  setDeviceStatus,
  setStreamHealth,
  togglePauseState,
} from "../lib/store/slices/mediaControlSlice";
import {
  recalculateTokens,
  setTokenLimitTruncatedFlag,
  clearChatHistory,
} from "../lib/store/slices/chatContextSlice";
import { audioCaptureManager } from "../lib/services/audioCapture";
import { sonioxStreamClient } from "../lib/services/soniox";

import SessionPanel from "../components/SessionPanel";
import SettingsDrawer from "../components/SettingsDrawer";
import TranscriptPanel from "../components/TranscriptPanel";
import QnAPanel from "../components/QnAPanel";

export default function Home() {
  const dispatch = useAppDispatch();
  const activeSession = useAppSelector(
    (state) => state.persistence.activeSession,
  );
  const transcripts = useAppSelector(
    (state) => state.transcription.transcripts,
  );

  const isRecording = useAppSelector((state) => state.mediaControl.isRecording);
  const isPaused = useAppSelector((state) => state.mediaControl.isPaused);

  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const config = useAppSelector((state) => state.config);

  const { tokenLimitTruncated, tokenLimit } = useAppSelector(
    (state) => state.chatContext,
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "sessions" | "transcription" | "qna"
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

  // Sync transcripts change to IndexedDB
  useEffect(() => {
    if (activeSession && transcripts.length > 0) {
      db.saveTranscripts(transcripts).catch((err) => {
        console.error("Failed to sync transcripts to DB:", err);
      });
    }
  }, [transcripts, activeSession]);

  // Recalculate Gemini token count and trigger alerts
  useEffect(() => {
    if (transcripts.length > 0) {
      const text = transcripts.map((t) => t.text).join(" ");
      dispatch(recalculateTokens({ transcriptsText: text }));
    } else {
      dispatch(recalculateTokens({ transcriptsText: "" }));
    }
  }, [transcripts, dispatch]);

  // Handle Smart FIFO Context Window Truncation (100% capacity)
  useEffect(() => {
    if (tokenLimitTruncated && transcripts.length > 0) {
      let sliceIndex = 0;
      const tempText = transcripts.map((t) => t.text).join(" ");
      let tempTokens = Math.ceil(tempText.length / 4);

      // Slicing complete transcripts until token usage falls back below the limit
      while (tempTokens >= tokenLimit && sliceIndex < transcripts.length) {
        sliceIndex++;
        const slicedText = transcripts
          .slice(sliceIndex)
          .map((t) => t.text)
          .join(" ");
        tempTokens = Math.ceil(slicedText.length / 4);
      }

      if (sliceIndex > 0) {
        dispatch(truncateOldTranscripts(sliceIndex));
        // Reset the truncation alert trigger
        dispatch(setTokenLimitTruncatedFlag(false));
      }
    }
  }, [tokenLimitTruncated, transcripts, tokenLimit, dispatch]);

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

  const startRecording = async () => {
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
      // Connect to Soniox STT WebSocket
      sonioxStreamClient.connect(
        {
          apiKey: config.sonioxApiKey,
          model: config.transcriptionModel,
          languageHints: config.languageHints,
          enableEndpointDetection: config.enableEndpointDetection,
          enableLanguageIdentification: config.enableLanguageIdentification,
          translationMode: config.translationMode,
          translationTargetLanguage: config.translationTargetLanguage,
          translationLanguageA: config.translationLanguageA,
          translationLanguageB: config.translationLanguageB,
        },
        {
          onOpen: () => {
            dispatch(startRecordingState());
          },
          onClose: () => {
            audioCaptureManager.stop();
            dispatch(stopRecordingState());
            dispatch(clearTranscripts());
          },
          onError: (e) => {
            dispatch(setStreamHealth("poor"));
          },
          onTokens: (tokens) => {
            dispatch(
              updateTranscripts(
                tokens.map((t: any) => ({
                  id: crypto.randomUUID(),
                  sessionId: activeSession.id,
                  text: t.text,
                  speakerId: t.speaker,
                  startTimestamp: t.start_ms,
                  endTimestamp: t.end_ms ?? t.start_ms + (t.duration_ms ?? 0),
                  duration: t.duration_ms ?? t.end_ms - t.start_ms,
                  isFinal: t.is_final,
                  translationStatus: t.translation_status,
                  language: t.language,
                })),
              ),
            );
          },
        },
      );

      // Start capture loop
      await audioCaptureManager.start(
        activeSession.id,
        config.audioRouting,
        (pcmData) => {
          // Skip pushing raw frames to Soniox if recording is paused
          if (!isPausedRef.current) {
            sonioxStreamClient.sendAudio(pcmData);
          }
        },
        () => isPausedRef.current,
      );
    } catch (err: any) {
      console.error("Audio recording setup failed:", err);
      alert(`Could not start recording: ${err.message || err}`);
      stopRecording();
    }
  };

  const stopRecording = () => {
    audioCaptureManager.stop();
    sonioxStreamClient.disconnect();
    dispatch(stopRecordingState());
  };

  return (
    <main className="h-screen w-full flex flex-col bg-neutral-900 font-sans overflow-hidden">
      {/* Header for mobile only */}
      <div className="md:hidden flex w-full bg-neutral-950 border-b border-white/10 overflow-x-auto scrollbar-none shrink-0">
        <div className="flex px-4 py-3 gap-2 min-w-max w-full justify-around">
          <button
            onClick={() => setActiveTab("sessions")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
              activeTab === "sessions"
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-950/30"
                : "text-neutral-400 hover:text-white bg-neutral-900/60 border border-white/5"
            }`}
          >
            📁 Session List
          </button>
          <button
            onClick={() => setActiveTab("transcription")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
              activeTab === "transcription"
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-950/30"
                : "text-neutral-400 hover:text-white bg-neutral-900/60 border border-white/5"
            }`}
          >
            🎙️ Live Session
          </button>
          <button
            onClick={() => setActiveTab("qna")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
              activeTab === "qna"
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-950/30"
                : "text-neutral-400 hover:text-white bg-neutral-900/60 border border-white/5"
            }`}
          >
            🤖 Q&A Chatting
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 w-full flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* SessionPanel history */}
        <div
          className={`${activeTab === "sessions" ? "flex" : "max-md:hidden"} md:flex h-full shrink-0 w-full md:w-auto`}
        >
          <SessionPanel
            onNewSession={handleNewSession}
            openSettings={() => setIsSettingsOpen(true)}
            onSelectSession={() => setActiveTab("transcription")}
          />
        </div>

        {/* Main panel */}
        <div
          className={`${activeTab === "transcription" ? "flex" : "max-md:hidden"} md:flex flex-1 flex-col min-w-0 h-full relative`}
        >
          <TranscriptPanel
            onRenameSession={handleRenameSession}
            startRecording={startRecording}
            stopRecording={stopRecording}
          />
        </div>

        {/* QnA Assistant */}
        <div
          className={`${activeTab === "qna" ? "flex" : "max-md:hidden"} md:flex h-full shrink-0 w-full md:w-auto`}
        >
          <QnAPanel />
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
