"use client";

import React, { useRef, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../lib/store/storeHooks";
import { AudioCaptureManager } from "../lib/services/audioCapture";
import { togglePauseState } from "@/lib/store/slices/mediaControlSlice";
import {
  generateTxtContent,
  generateSrtContent,
  downloadFile,
} from "../lib/utils/exportUtils";

import Badge from "./atoms/Badge";
import ExportDropdown from "./molecules/ExportDropdown";
import TranscriptBlock from "./molecules/TranscriptBlock";
import RecordingControls from "./molecules/RecordingControls";

interface TranscriptPanelProps {
  onRenameSession: (title: string) => void;
  startRecording: () => void;
  stopRecording: () => void;
}

export default function TranscriptPanel({
  onRenameSession,
  startRecording,
  stopRecording,
}: TranscriptPanelProps) {
  const dispatch = useAppDispatch();
  const activeSession = useAppSelector(
    (state) => state.persistence.activeSession,
  );
  const transcripts = useAppSelector(
    (state) => state.transcription.transcripts,
  );
  const isRecording = useAppSelector((state) => state.mediaControl.isRecording);
  const isPaused = useAppSelector((state) => state.mediaControl.isPaused);
  const streamHealth = useAppSelector(
    (state) => state.mediaControl.streamHealth,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [exportingAudio, setExportingAudio] = useState(false);
  const isAutoScrollLocked = useRef(true);

  // Auto-scroll when new transcripts or tokens arrive, unless user has scrolled up
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isAutoScrollLocked.current) return;
    el.scrollTop = el.scrollHeight;
  }, [transcripts]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    // If user is within 60px of the bottom, lock scroll. Otherwise unlock.
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    isAutoScrollLocked.current = isAtBottom;
  };

  const handleTranscriptClick = (
    startTimestamp: number,
    endTimestamp: number,
  ) => {
    if (!activeSession) return;
    AudioCaptureManager.playTokenAudio(
      activeSession.id,
      startTimestamp,
      endTimestamp,
    );
  };

  const formatTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleExportTxt = () => {
    if (!activeSession) return;
    const title =
      activeSession.title ||
      `Session - ${new Date(activeSession.createdAt).toLocaleDateString()}`;
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-transcript.txt`;
    const content = generateTxtContent(transcripts, title);
    downloadFile(content, filename, "text/plain");
  };

  const handleExportSrt = () => {
    if (!activeSession) return;
    const title =
      activeSession.title ||
      `Session - ${new Date(activeSession.createdAt).toLocaleDateString()}`;
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-transcript.srt`;
    const content = generateSrtContent(transcripts);
    downloadFile(content, filename, "text/srt");
  };

  const handleExportJson = () => {
    if (!activeSession) return;
    const title =
      activeSession.title ||
      `Session - ${new Date(activeSession.createdAt).toLocaleDateString()}`;
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-transcript.json`;
    const content = JSON.stringify(transcripts, null, 2);
    downloadFile(content, filename, "application/json");
  };

  const handleExportAudio = async () => {
    if (!activeSession) return;
    setExportingAudio(true);
    try {
      const url = await AudioCaptureManager.getSessionAudioWavUrl(
        activeSession.id,
      );
      if (url) {
        const title =
          activeSession.title ||
          `Session - ${new Date(activeSession.createdAt).toLocaleDateString()}`;
        const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.wav`;
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert("No audio recorded for this session yet.");
      }
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
      <div className="px-6 pt-5 pb-4 border-b border-white/10 flex flex-col gap-3">
        {/* Title + status row */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <input
              type="text"
              value={activeSession.title || ""}
              onChange={(e) => onRenameSession(e.target.value)}
              placeholder={`Session - ${new Date(
                activeSession.createdAt,
              ).toLocaleDateString()}`}
              className="text-lg font-bold bg-transparent border-b border-transparent hover:border-white/20 focus:border-violet-500 focus:outline-none py-0.5 w-full text-white placeholder-neutral-500 transition-colors truncate"
            />
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-3 shrink-0">
            {isRecording && (
              <Badge variant="red" pulsing>
                REC
              </Badge>
            )}
            {isPaused && <Badge variant="yellow">Paused</Badge>}
            {isRecording && (
              <Badge variant={streamHealth === "good" ? "green" : "red"}>
                Health: {streamHealth.toUpperCase()}
              </Badge>
            )}
          </div>

          {/* Export Dropdown */}
          <ExportDropdown
            onExportAudio={handleExportAudio}
            onExportSrt={handleExportSrt}
            onExportJson={handleExportJson}
            exportingAudio={exportingAudio}
            hasTranscripts={transcripts.length > 0}
          />
        </div>

      </div>

      {/* Live Transcript Content Panel */}
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
              onClickWord={handleTranscriptClick}
              formatTime={formatTime}
            />
          ))
        )}
      </div>

      {/* Dashboard Recording controls */}
      <RecordingControls
        isRecording={isRecording}
        isPaused={isPaused}
        onStartStop={isRecording ? stopRecording : startRecording}
        onPauseResume={() => dispatch(togglePauseState())}
      />
    </div>
  );
}
