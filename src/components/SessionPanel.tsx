"use client";

import React, { useState } from "react";
import { useAppDispatch, useAppSelector } from "../lib/store/storeHooks";
import { Session, db } from "../lib/services/db";
import {
  setActiveSession,
  setChatPairs,
  removeSessionFromList,
} from "../lib/store/slices/persistenceSlice";
import {
  setTranscripts,
  setSessionId,
} from "../lib/store/slices/transcriptionSlice";
import { clearChatHistory } from "@/lib/store/slices/chatContextSlice";

import Button from "./atoms/Button";
import SearchBar from "./molecules/SearchBar";
import SessionItem from "./molecules/SessionItem";

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

    // Fetch transcripts and Chats from DB
    try {
      const transcripts = await db.getTranscripts(session.id);
      dispatch(setTranscripts(transcripts));

      const chats = await db.getChatPairs(session.id);
      dispatch(setChatPairs(chats));

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
    <div className="w-full lg:w-80 h-full bg-neutral-950 lg:border-r border-white/10 flex flex-col text-white">
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
        <Button
          onClick={openSettings}
          variant="secondary"
          size="none"
          className="!p-2 !rounded-lg"
          title="Open Settings"
        >
          ⚙️
        </Button>
      </div>

      {/* Action CTA */}
      <div className="p-4 border-b border-white/5">
        <Button
          onClick={onNewSession}
          disabled={isRecording}
          variant="primary"
          size="none"
          fullWidth
          className="!py-3 !rounded-xl text-sm"
        >
          + New Session
        </Button>
      </div>

      {/* Search Input */}
      <div className="px-4 py-3 border-b border-white/5">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
          Session Logs
        </h3>

        {filteredSessions.length === 0 ? (
          <p className="text-xs text-neutral-500 text-center py-8">
            No sessions found
          </p>
        ) : (
          filteredSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={activeSession?.id === session.id}
              onSelect={() => handleSelectSession(session)}
              onDelete={(e) => handleDeleteSession(e, session.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
