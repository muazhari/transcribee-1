"use client";

import React, { useRef, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../lib/store/storeHooks";
import { AudioCaptureManager } from "../lib/services/audioCapture";
import { Transcript } from "../lib/services/db";
import { togglePauseState } from "@/lib/store/slices/mediaControlSlice";

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

  const { tokenCount, tokenLimit, tokenLimitExceeded, tokenLimitTruncated } =
    useAppSelector((state) => state.chatContext);

  const containerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollLocked = useRef(true);

  // Auto-scroll when new transcripts or tokens arrive, unless user has scrolled up
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isAutoScrollLocked.current) return;
    el.scrollTop = el.scrollHeight;
  }, [transcripts, transcripts]);

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

  const renderFinalizedTranscript = (transcript: Transcript) => {
    const words = transcript.text.split(" ").filter(Boolean);
    const N = words.length;
    const durationPerWord = N > 0 ? transcript.duration / N : 0;
    return (
      <div className="flex flex-wrap gap-x-1.5 gap-y-1">
        {words.map((word, idx) => {
          const start = Math.round(
            transcript.startTimestamp + idx * durationPerWord,
          );
          const end = Math.round(
            transcript.startTimestamp + (idx + 1) * durationPerWord,
          );
          return (
            <span
              key={idx}
              onClick={() => handleTranscriptClick(start, end)}
              className={
                transcript.isFinal
                  ? "cursor-pointer hover:bg-violet-500/20 hover:text-violet-300 rounded transition duration-75 border-b border-transparent hover:border-violet-500/40"
                  : "leading-relaxed text-neutral-400 italic select-none tracking-wide rounded transition duration-75 border-b border-transparent "
              }
              title={`Play word (${formatTime(start)} - ${formatTime(end)})`}
            >
              {word}
            </span>
          );
        })}
      </div>
    );
  };

  const tokenPercentage = Math.min(100, (tokenCount / tokenLimit) * 100);

  return (
    <div className="flex-1 h-full flex flex-col bg-neutral-900 text-white min-w-0 overflow-hidden">
      {/* Session Title Header */}
      <div className="px-6 pt-5 pb-4 border-b border-white/10 flex flex-col gap-3">
        {/* Title + status row */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            {activeSession ? (
              <input
                type="text"
                value={activeSession.title || ""}
                onChange={(e) => onRenameSession(e.target.value)}
                placeholder={`Session - ${new Date(activeSession.createdAt).toLocaleDateString()}`}
                className="text-lg font-bold bg-transparent border-b border-transparent hover:border-white/20 focus:border-violet-500 focus:outline-none py-0.5 w-full text-white placeholder-neutral-500 transition-colors truncate"
              />
            ) : (
              <span className="text-lg font-bold text-neutral-400">
                No session loaded
              </span>
            )}
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-3 text-xs text-neutral-400 shrink-0">
            {isRecording && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span className="text-red-400 font-semibold">REC</span>
              </span>
            )}
            {isPaused && (
              <span className="text-yellow-400 font-semibold">Paused</span>
            )}
            {isRecording && (
              <span className="flex items-center gap-1">
                Health:
                <span
                  className={`font-semibold ${
                    streamHealth === "good" ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {streamHealth.toUpperCase()}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Token capacity meter — full width, always below title */}
        {activeSession && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px] text-neutral-400 font-semibold">
              <span>Token Load</span>
              <span>
                {tokenCount.toLocaleString()} / {tokenLimit.toLocaleString()}
              </span>
            </div>
            <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden border border-white/5">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  tokenPercentage >= 85
                    ? "bg-gradient-to-r from-orange-500 to-red-500"
                    : "bg-gradient-to-r from-violet-500 to-indigo-500"
                }`}
                style={{ width: `${tokenPercentage}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Warnings & Notices */}
      {tokenLimitTruncated && (
        <div className="bg-red-950/60 border-b border-red-500/20 text-red-300 px-6 py-2.5 text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>
            <strong>Context Window Full:</strong> Exceeded 100% capacity. FIFO
            truncation was executed to preserve latest speaker turns.
          </span>
        </div>
      )}
      {!tokenLimitTruncated && tokenLimitExceeded && (
        <div className="bg-orange-950/60 border-b border-orange-500/20 text-orange-300 px-6 py-2.5 text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>
            <strong>Warning:</strong> Active token volume has passed 85%
            threshold constraints. Truncation is imminent.
          </span>
        </div>
      )}

      {/* Live Transcript Content Panel */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-6 flex flex-col gap-6"
      >
        {!activeSession ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-neutral-500">
            <span className="text-4xl mb-3">🎙️</span>
            <h3 className="font-bold text-lg text-neutral-400">
              Ready to transcribe
            </h3>
            <p className="text-sm max-w-sm mt-1">
              Select an existing session from the session panel or click
              &quot;New Session&quot; to start recording and transcribing in
              real-time.
            </p>
          </div>
        ) : transcripts.length === 0 && transcripts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 text-center py-16">
            <span className="text-2xl animate-bounce mb-3">💬</span>
            <p className="text-sm max-w-xs">
              Listening for transcription... Start speaking or turn on system
              audio output.
            </p>
          </div>
        ) : (
          <>
            {/* Transcript blocks */}
            {transcripts.map((transcript) => {
              const start = formatTime(transcript.startTimestamp);
              const end = formatTime(transcript.endTimestamp);

              return (
                <div
                  key={transcript.id}
                  className={`flex flex-col gap-1.5 p-4 rounded-xl border transition-all duration-300 ${
                    transcript.isFinal
                      ? "border-white/10 bg-neutral-900/40 hover:border-violet-500/20"
                      : "border-dashed border-amber-500/20 bg-amber-950/5 animate-[pulse_3s_infinite]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-300 px-2.5 py-0.5 rounded-md bg-violet-950/40 border border-violet-500/20">
                      Speaker {transcript.speakerId}
                    </span>
                    <span
                      className="cursor-pointer text-[10px] text-neutral-500 hover:text-violet-300 p-1 hover:bg-violet-500/20 rounded transition duration-75 border-b border-transparent hover:border-violet-500/40"
                      onClick={() =>
                        handleTranscriptClick(
                          transcript.startTimestamp,
                          transcript.endTimestamp,
                        )
                      }
                    >
                      {start} - {end}
                    </span>
                  </div>

                  {/* Original text styled by finality */}
                  <div className="text-sm font-medium leading-relaxed text-neutral-200">
                    {renderFinalizedTranscript(transcript)}
                  </div>

                  {/* Translation block if present */}
                  {(transcript.translation ||
                    transcript.translationStatus === "translation") && (
                    <div className="mt-2 pt-2 border-t border-white/5 flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                        Translation
                      </span>
                      <p className="text-sm text-neutral-400 italic">
                        {transcript.translation || transcript.text}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Dashboard Recording controls */}
      {activeSession && (
        <div className="p-6 border-t border-white/10 bg-neutral-950/80 flex items-center justify-center gap-4 shrink-0">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`px-8 py-3.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-2 active:scale-95 transition-all ${
              isRecording
                ? "bg-red-600 hover:bg-red-500 shadow-red-950/20 text-white animate-pulse"
                : "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-950/20"
            }`}
          >
            <span>{isRecording ? "⏹️" : "🎙️"}</span>
            <span>{isRecording ? "Stop Recording" : "Start Recording"}</span>
          </button>

          {isRecording && (
            <button
              onClick={() => dispatch(togglePauseState())}
              className="px-6 py-3.5 rounded-full font-bold text-sm bg-neutral-800 hover:bg-neutral-700 text-white border border-white/10 active:scale-95 transition-all"
            >
              {isPaused ? "▶️ Resume" : "⏸️ Pause"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
