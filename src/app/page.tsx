"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "../lib/store/storeHooks";
import { db } from "../lib/services/db";
import {
  setSessions,
  setActiveSession,
  addSessionToList,
} from "../lib/store/slices/persistenceSlice";
import { setSessionId } from "../lib/store/slices/transcriptionSlice";
import { clearChatHistory } from "../lib/store/slices/chatContextSlice";
import {
  useResizablePanels,
  MIN_LEFT_WIDTH,
  MIN_RIGHT_WIDTH,
} from "../lib/hooks/useResizablePanels";
import { useRecordingSession } from "../lib/hooks/useRecordingSession";

import SessionPanel from "../components/SessionPanel";
import SettingsDrawer from "../components/SettingsDrawer";
import TranscriptPanel from "../components/TranscriptPanel";
import ChatPanel from "../components/ChatPanel";
import PlaybackPanel from "../components/PlaybackPanel";

const MOBILE_TABS = [
  { id: "sessions", label: "🏠 Home" },
  { id: "transcription", label: "🎙️ Live" },
  { id: "playback", label: "🔊 Playback" },
  { id: "chat", label: "🤖 Chat" },
] as const;

const DESKTOP_TABS = MOBILE_TABS.filter(
  (tab) => tab.id === "transcription" || tab.id === "playback",
);

const getTabButtonClass = (isActive: boolean) =>
  `px-4 py-2 rounded-xl w-full whitespace-nowrap text-xs font-bold transition-all duration-200 cursor-pointer ${
    isActive
      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-950/30"
      : "text-neutral-400 hover:text-white bg-neutral-900/60 border border-white/5"
  }`;

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
  const isRecording = useAppSelector((state) => state.mediaControl.isRecording);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "sessions" | "transcription" | "playback" | "chat"
  >("transcription");

  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const { startRecording, stopRecording, applyLiveConfig } =
    useRecordingSession(openSettings);

  const {
    layoutRef,
    panelWidths,
    dragging,
    startResize,
    handleResizeMove,
    stopResize,
    handleResizeKeyDown,
  } = useResizablePanels();

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

  return (
    <main className="h-dvh w-full flex flex-col bg-neutral-900 font-sans overflow-hidden">
      {/* Header for mobile only */}
      <div className="lg:hidden flex w-full bg-neutral-950 border-b border-white/10 overflow-x-auto scrollbar-none shrink-0">
        <div className="flex px-4 py-3 gap-2 min-w-max w-full justify-around">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={getTabButtonClass(activeTab === tab.id)}
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
            openSettings={openSettings}
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
          <div className="hidden lg:flex w-full bg-neutral-950 border-b border-white/10 overflow-x-auto scrollbar-none shrink-0">
            <div className="flex px-4 py-3 gap-2 min-w-max w-full justify-around">
              {DESKTOP_TABS.map((tab) => {
                const isActive =
                  tab.id === "playback"
                    ? activeTab === "playback"
                    : activeTab !== "playback";
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={getTabButtonClass(isActive)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
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
          onApplyLiveConfig={applyLiveConfig}
        />
      </div>
    </main>
  );
}
