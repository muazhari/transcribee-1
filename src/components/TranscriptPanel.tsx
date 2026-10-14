"use client";

import React, { useRef, useEffect, useState } from "react";
import { useAppSelector } from "../lib/store/storeHooks";
import { AudioCaptureManager } from "../lib/services/audioCapture";
import { generateSrtContent, downloadFile } from "../lib/utils/exportUtils";

import Badge from "./atoms/Badge";
import ExportDropdown from "./molecules/ExportDropdown";
import TranscriptBlock from "./molecules/TranscriptBlock";
import RecordingControls from "./molecules/RecordingControls";

interface TranscriptPanelProps {
  onRenameSession: (title: string) => void;
  startRecording: () => void;
  stopRecording: () => void;
}

const SCROLL_BOTTOM_THRESHOLD = 60; // px from bottom

export default function TranscriptPanel({
  onRenameSession,
  startRecording,
  stopRecording,
}: TranscriptPanelProps) {
  const activeSession = useAppSelector(
    (state) => state.persistence.activeSession,
  );
  const transcripts = useAppSelector(
    (state) => state.transcription.transcripts,
  );
  const isRecording = useAppSelector((state) => state.mediaControl.isRecording);
  const streamHealth = useAppSelector(
    (state) => state.mediaControl.streamHealth,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [exportingAudio, setExportingAudio] = useState(false);
  const isAutoScrollLocked = useRef(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollToBottom = () => {
    const el = containerRef.current;
    if (!el) return;
    isAutoScrollLocked.current = true;
    setShowScrollBottom(false);
    el.scrollTop = el.scrollHeight;
  };

  // Auto-scroll when new transcripts or tokens arrive, unless user has scrolled up
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isAutoScrollLocked.current) return;
    el.scrollTop = el.scrollHeight;
  }, [transcripts]);

  // Re-pin scroll to bottom when recording starts
  useEffect(() => {
    if (isRecording) {
      scrollToBottom();
    }
  }, [isRecording]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const isAtBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
    isAutoScrollLocked.current = isAtBottom;
    setShowScrollBottom(!isAtBottom && transcripts.length > 0);
  };

  const handleTranscriptClick = (startTimestamp: number, endTimestamp: number) => {
    if (activeSession) {
      AudioCaptureManager.playTokenAudio(
        activeSession.id,
        startTimestamp,
        endTimestamp,
      );
    }
  };

  const baseFilename = (
    activeSession?.title ||
    `Session - ${new Date(activeSession?.createdAt ?? 0).toLocaleString()}`
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  const handleExportSrt = () =>
    downloadFile(
      generateSrtContent(transcripts),
      `${baseFilename}-transcript.srt`,
      "text/srt",
    );

  const handleExportJson = () =>
    downloadFile(
      JSON.stringify(transcripts, null, 2),
      `${baseFilename}-transcript.json`,
      "application/json",
    );

  const handleExportAudio = async () => {
    if (!activeSession) return;
    setExportingAudio(true);
    try {
      const url = await AudioCaptureManager.getSessionAudioWavUrl(
        activeSession.id,
      );
      if (!url) {
        alert("No audio recorded for this session yet.");
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseFilename}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to compile audio for export:", e);
      alert("Failed to export audio.");
    } finally {
      setExportingAudio(false);
    }
  };

  if (!activeSession) {
    return (
      <div className="flex-1 h-full flex flex-col bg-neutral-900 text-white justify-center items-center p-8 text-neutral-500">
        <span className="text-4xl mb-3">🎙️</span>
        <h3 className="font-bold text-lg text-neutral-400">
          Ready to transcribe
        </h3>
        <p className="text-neutral-500 text-sm max-w-sm mt-1 text-center">
          Select an existing session from the session panel or click &quot;New
          Session&quot; to start recording and transcribing in real-time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-neutral-900 text-white min-w-0 overflow-hidden">
      {/* Session Title Header */}
      <div className="px-6 pt-5 pb-4 border-b border-white/10 flex items-center gap-3 min-w-0">
        <input
          type="text"
          value={activeSession.title || ""}
          onChange={(e) => onRenameSession(e.target.value)}
          placeholder={`Session - ${new Date(
            activeSession.createdAt,
          ).toLocaleString()}`}
          className="text-lg font-bold bg-transparent border-b border-transparent hover:border-white/20 focus:border-violet-500 focus:outline-none py-0.5 min-w-0 flex-1 text-white placeholder-neutral-500 transition-colors truncate"
        />
        {isRecording && (
          <Badge variant={streamHealth === "good" ? "green" : "red"} pulsing>
            Health: {streamHealth.toUpperCase()}
          </Badge>
        )}
        <ExportDropdown
          onExportAudio={handleExportAudio}
          onExportSrt={handleExportSrt}
          onExportJson={handleExportJson}
          exportingAudio={exportingAudio}
          hasTranscripts={transcripts.length > 0}
        />
      </div>

      {/* Live Transcript Content Panel */}
      <div className="flex-1 min-h-0 relative flex flex-col">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-6 flex flex-col gap-6"
        >
          {transcripts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 text-center py-16">
              <span className="text-2xl animate-bounce mb-3">💬</span>
              <p className="text-sm max-w-xs">
                Listening for transcription... Start speaking or turn on system
                audio output.
              </p>
            </div>
          ) : (
            transcripts.map((transcript) => (
              <TranscriptBlock
                key={transcript.id}
                transcript={transcript}
                onPlaySegment={handleTranscriptClick}
              />
            ))
          )}
        </div>

        {/* Floating jump to latest button */}
        {showScrollBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-6 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg shadow-violet-950/40 flex items-center gap-1.5 transition-all z-10 cursor-pointer"
          >
            <span>↓ Jump to latest</span>
          </button>
        )}
      </div>

      {/* Dashboard Recording controls */}
      <RecordingControls
        isRecording={isRecording}
        onStartStop={isRecording ? stopRecording : startRecording}
      />
    </div>
  );
}
