"use client";

import React, { useState } from "react";
import { useAppDispatch, useAppSelector } from "../lib/store/storeHooks";
import { Session, db } from "../lib/services/db";
import {
  setActiveSession,
  setQnAPairs,
  removeSessionFromList,
} from "../lib/store/slices/persistenceSlice";
import {
  setTranscripts,
  setSessionId,
} from "../lib/store/slices/transcriptionSlice";
import { clearChatHistory } from "@/lib/store/slices/chatContextSlice";

interface SessionPanelProps {
  onNewSession: () => void;
  openSettings: () => void;
  onSelectSession?: () => void;
}

export default function SessionPanel({
  onNewSession,
  openSettings,
  onSelectSession,
}: SessionPanelProps) {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((state) => state.persistence.sessions);
  const activeSession = useAppSelector(
    (state) => state.persistence.activeSession,
  );
  const isRecording = useAppSelector((state) => state.mediaControl.isRecording);

  const [search, setSearch] = useState("");

  const handleSelectSession = async (session: Session) => {
    if (isRecording) {
      alert("Please stop recording before switching sessions.");
      return;
    }
    dispatch(setActiveSession(session));
    dispatch(setSessionId(session.id));

    // Fetch transcripts and QnAs from DB
    try {
      const transcripts = await db.getTranscripts(session.id);
      dispatch(setTranscripts(transcripts));

      const qnas = await db.getQnAPairs(session.id);
      dispatch(setQnAPairs(qnas));

      if (onSelectSession) {
        onSelectSession();
      }
    } catch (e) {
      console.error("Failed to load session data:", e);
    }
  };

  const handleDeleteSession = async (
    e: React.MouseEvent,
    sessionId: string,
  ) => {
    e.stopPropagation();
    if (isRecording && activeSession?.id === sessionId) {
      alert("Cannot delete active session while recording.");
      return;
    }
    if (!confirm("Are you sure you want to delete this session?")) {
      return;
    }

    try {
      await db.deleteSession(sessionId);
      dispatch(removeSessionFromList(sessionId));
      dispatch(clearChatHistory());
      if (activeSession?.id === sessionId) {
        dispatch(setSessionId(null));
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  };

  const filteredSessions = sessions.filter((s) => {
    const title =
      s.title || `Session ${new Date(s.createdAt).toLocaleString()}`;
    return title.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="w-full md:w-80 h-full bg-neutral-950 md:border-r border-white/10 flex flex-col text-white">
      {/* Brand Logo & Action */}
      <div className="p-6 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center font-bold text-lg tracking-wider">
            T
          </div>
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
            Transcribee
          </span>
        </div>
        <button
          onClick={openSettings}
          className="p-2 rounded-lg bg-neutral-900 border border-white/10 hover:border-violet-500 hover:bg-neutral-800 transition"
          title="Open Settings"
        >
          ⚙️
        </button>
      </div>

      {/* Action CTA */}
      <div className="p-4 border-b border-white/5">
        <button
          onClick={onNewSession}
          disabled={isRecording}
          className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98]"
        >
          + New Session
        </button>
      </div>

      {/* Search Input */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-900 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
            placeholder="Search meetings..."
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">
            🔍
          </span>
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
          Meeting Logs
        </h3>

        {filteredSessions.length === 0 ? (
          <p className="text-xs text-neutral-500 text-center py-8">
            No sessions found
          </p>
        ) : (
          filteredSessions.map((session) => {
            const isActive = activeSession?.id === session.id;
            const dateStr = new Date(session.createdAt).toLocaleDateString(
              undefined,
              {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              },
            );
            const defaultTitle = `Session - ${dateStr}`;

            return (
              <div
                key={session.id}
                onClick={() => handleSelectSession(session)}
                className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer border transition-all ${
                  isActive
                    ? "bg-violet-950/40 border-violet-500/50 shadow-md shadow-violet-950/20"
                    : "bg-neutral-900/40 border-white/5 hover:bg-neutral-900/80 hover:border-white/10"
                }`}
              >
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="text-xs font-bold text-white truncate">
                    {session.title || defaultTitle}
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    {dateStr}
                  </span>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-red-400 transition"
                  title="Delete session"
                >
                  🗑️
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
