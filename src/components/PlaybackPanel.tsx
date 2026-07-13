"use client";

import React, { useRef, useEffect, useState } from "react";
import { useAppSelector } from "../lib/store/storeHooks";
import { AudioCaptureManager } from "../lib/services/audioCapture";
import { Transcript } from "../lib/services/db";
import {
  generateTxtContent,
  generateSrtContent,
  downloadFile,
} from "../lib/utils/exportUtils";

export default function PlaybackPanel() {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const activeSession = useAppSelector(
    (state) => state.persistence.activeSession,
  );
  const transcripts = useAppSelector(
    (state) => state.transcription.transcripts,
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Compute active transcript ID during render to avoid render cascading via state
  const timeMs = currentTime * 1000;
  const activeTranscript = transcripts.find(
    (t) => timeMs >= t.startTimestamp && timeMs <= t.endTimestamp,
  );
  const activeTranscriptId = activeTranscript ? activeTranscript.id : null;

  const activeSessionId = activeSession?.id;

  // Compile WAV URL when activeSessionId changes
  useEffect(() => {
    let active = true;
    if (!activeSessionId) {
      // Defer state update to next microtask to avoid synchronous cascading renders
      Promise.resolve().then(() => {
        setAudioUrl(null);
        audioUrlRef.current = null;
      });
      return;
    }

    const loadAudio = async () => {
      setLoadingAudio(true);
      try {
        const url =
          await AudioCaptureManager.getSessionAudioWavUrl(activeSessionId);
        if (active) {
          setAudioUrl(url);
          audioUrlRef.current = url;
          // Reset player states
          setCurrentTime(0);
          setIsPlaying(false);
        }
      } catch (e) {
        console.error("Failed to compile session audio:", e);
      } finally {
        if (active) setLoadingAudio(false);
      }
    };

    loadAudio();

    return () => {
      active = false;
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, [activeSessionId]);

  // Sync state modifications to the actual HTMLAudioElement
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate, audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = isMuted;
  }, [volume, isMuted, audioUrl]);

  // Scroll active transcript segment to the top of the container
  useEffect(() => {
    if (activeTranscriptId && scrollContainerRef.current) {
      const card = document.getElementById(
        `transcript-card-${activeTranscriptId}`,
      );
      if (card) {
        const container = scrollContainerRef.current;
        const targetScrollTop = card.offsetTop - 12; // 12px breathing room offset at top
        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth",
        });
      }
    }
  }, [activeTranscriptId]);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((err) => console.error("Playback failed:", err));
    }
  };

  const handleStop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSkip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(
      0,
      Math.min(duration, audio.currentTime + seconds),
    );
  };

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const handleTranscriptClick = (startTimestampMs: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const seekTime = startTimestampMs / 1000;
    audio.currentTime = seekTime;
    setCurrentTime(seekTime);
    if (!isPlaying) {
      audio.play().catch((err) => console.error("Playback failed:", err));
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatMsToTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleExportSrt = () => {
    if (!activeSession) return;
    const title =
      activeSession.title ||
      `Session - ${new Date(activeSession.createdAt).toLocaleDateString()}`;
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-transcript.srt`;
    const content = generateSrtContent(transcripts);
    downloadFile(content, filename, "text/srt");
    setIsExportOpen(false);
  };

  const handleExportJson = () => {
    if (!activeSession) return;
    const title =
      activeSession.title ||
      `Session - ${new Date(activeSession.createdAt).toLocaleDateString()}`;
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-transcript.json`;
    const content = JSON.stringify(transcripts, null, 2);
    downloadFile(content, filename, "application/json");
    setIsExportOpen(false);
  };

  const handleExportAudio = () => {
    if (!audioUrl || !activeSession) return;
    const title =
      activeSession.title ||
      `Session - ${new Date(activeSession.createdAt).toLocaleDateString()}`;
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.wav`;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = filename;
    a.click();
    setIsExportOpen(false);
  };

  const renderFinalizedTranscriptText = (transcript: Transcript) => {
    const words = transcript.text.split(" ").filter(Boolean);
    const N = words.length;
    const durationPerWord = N > 0 ? transcript.duration / N : 0;
    return (
      <div className="flex flex-wrap gap-x-1 gap-y-1">
        {words.map((word, idx) => {
          const start = Math.round(
            transcript.startTimestamp + idx * durationPerWord,
          );
          return (
            <span
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                handleTranscriptClick(start);
              }}
              className="cursor-pointer hover:bg-violet-500/20 hover:text-violet-300 rounded transition duration-75 border-b border-transparent hover:border-violet-500/40"
            >
              {word}
            </span>
          );
        })}
      </div>
    );
  };

  if (!activeSession) {
    return (
      <div className="flex-1 h-full flex flex-col bg-neutral-900 text-white justify-center items-center p-8 text-neutral-500">
        <span className="text-4xl mb-3">🔊</span>
        <h3 className="font-bold text-lg text-neutral-400">Ready to play</h3>
        <p className="text-neutral-500 text-sm max-w-sm mt-1 text-center">
          Select a session from the session list to begin audio playback.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex flex-col bg-neutral-900 text-white min-w-0 overflow-hidden">
      {/* Hidden Audio Primitive */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          style={{ display: "none" }}
        />
      )}

      {/* Header Info */}
      <div className="px-6 py-2 border-b border-white/10 shrink-0 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">
          {activeSession.title ||
            `Session - ${new Date(activeSession.createdAt).toLocaleDateString()}`}
        </h2>
      </div>

      {/* Main Control Panel Card */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 shrink-0">
        <div className="bg-neutral-950/80 border border-white/10 p-4 sm:p-6 rounded-2xl flex flex-col gap-4 sm:gap-5 shadow-xl shadow-neutral-950/30">
          {loadingAudio ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-t-violet-500 border-neutral-800 animate-spin" />
              <span className="text-xs text-neutral-400">
                Compiling session audio...
              </span>
            </div>
          ) : !audioUrl ? (
            <div className="flex flex-col items-center justify-center py-6 text-neutral-500">
              <span className="text-2xl mb-1">🔇</span>
              <span className="text-xs">
                No audio recorded for this session.
              </span>
            </div>
          ) : (
            <>
              {/* Media Button Bar */}
              <div className="flex flex-wrap flex-col items-center justify-center gap-4 w-full">
                {/* Playback States */}
                <div className="flex flex-wrap items-center justify-center gap-4 shrink-0">
                  <button
                    onClick={() => handleSkip(-5)}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-full bg-neutral-900 border border-white/5 hover:bg-neutral-800 text-neutral-400 hover:text-white active:scale-90 transition whitespace-nowrap text-xs font-semibold cursor-pointer"
                    title="Rewind 5s"
                  >
                    <span>⏪</span>
                  </button>
                  <button
                    onClick={handlePlayPause}
                    className="w-14 h-14 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-violet-950/30 active:scale-95 transition cursor-pointer"
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? "⏸️" : "▶️"}
                  </button>
                  <button
                    onClick={handleStop}
                    className="p-3 rounded-full bg-neutral-900 border border-white/5 hover:bg-neutral-800 text-neutral-400 hover:text-white active:scale-90 transition cursor-pointer"
                    title="Stop & Reset"
                  >
                    ⏹️
                  </button>
                  <button
                    onClick={() => handleSkip(5)}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-full bg-neutral-900 border border-white/5 hover:bg-neutral-800 text-neutral-400 hover:text-white active:scale-90 transition whitespace-nowrap text-xs font-semibold cursor-pointer"
                    title="Forward 5s"
                  >
                    <span>⏩</span>
                  </button>
                </div>
                <div className="flex flex-row items-center justify-center gap-4 shrink-0 flex-wrap">
                  {/* Speed Toggles */}
                  <div className="flex flex-row flex-nowrap items-center justify-center gap-1 bg-neutral-900 border border-white/5 p-1 rounded-xl shrink-0">
                    {([0.5, 1.0, 1.25, 1.5, 2.0] as const).map((rate) => (
                      <button
                        key={rate}
                        onClick={() => setPlaybackRate(rate)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          playbackRate === rate
                            ? "bg-violet-600 text-white shadow-sm"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  {/* Volume Controls */}
                  <div className="flex items-center justify-center gap-3 min-w-[140px] shrink-0">
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className="p-2 rounded-lg bg-neutral-900 border border-white/5 hover:border-violet-500/20 hover:bg-neutral-800 text-neutral-400 hover:text-white transition cursor-pointer"
                      title={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted || volume === 0
                        ? "🔇"
                        : volume < 0.5
                          ? "🔉"
                          : "🔊"}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        setVolume(parseFloat(e.target.value));
                        setIsMuted(false);
                      }}
                      className="w-full max-w-[120px] h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                      title="Volume slider"
                    />
                  </div>
                </div>
              </div>

              {/* Timeline Slider */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-neutral-400 w-10 text-right">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleTimelineChange}
                  className="flex-1 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <span className="text-[10px] font-mono text-neutral-400 w-10 text-left">
                  {formatTime(duration)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Scrollable Transcript List */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 pt-2 pb-[60vh] flex flex-col gap-4 relative"
      >
        {transcripts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 text-center py-16">
            <span className="text-2xl mb-2">💬</span>
            <p className="text-sm max-w-xs">
              No transcripts available for this session.
            </p>
          </div>
        ) : (
          transcripts.map((transcript) => {
            const isActive = activeTranscriptId === transcript.id;
            const startStr = formatMsToTime(transcript.startTimestamp);
            const endStr = formatMsToTime(transcript.endTimestamp);

            return (
              <div
                key={transcript.id}
                id={`transcript-card-${transcript.id}`}
                onClick={() => handleTranscriptClick(transcript.startTimestamp)}
                className={`flex flex-col gap-2 p-4 rounded-xl border cursor-pointer transition-all duration-300 ${
                  isActive
                    ? "bg-violet-950/30 border-violet-500/50 shadow-md shadow-violet-950/20 scale-[1.01]"
                    : "bg-neutral-900/40 border-white/5 hover:bg-neutral-900/80 hover:border-white/10"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md border transition-colors ${
                      isActive
                        ? "bg-violet-500 text-white border-violet-400"
                        : "bg-neutral-950/40 border-white/5 text-violet-300"
                    }`}
                  >
                    Speaker {transcript.speakerId}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {startStr} - {endStr}
                  </span>
                </div>

                <div className="text-sm font-medium leading-relaxed text-neutral-200">
                  {renderFinalizedTranscriptText(transcript)}
                </div>

                {transcript.translation && (
                  <div className="mt-1 pt-1.5 border-t border-white/5 flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">
                      Translation
                    </span>
                    <p className="text-sm text-neutral-400">
                      {transcript.translation}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
