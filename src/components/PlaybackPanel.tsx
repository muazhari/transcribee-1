"use client";

import React, { useRef, useEffect, useState } from "react";
import { useAppSelector } from "../lib/store/storeHooks";
import { AudioCaptureManager } from "../lib/services/audioCapture";
import {
  generateTxtContent,
  generateSrtContent,
  downloadFile,
} from "../lib/utils/exportUtils";

import PlaybackControls from "./molecules/PlaybackControls";
import TranscriptBlock from "./molecules/TranscriptBlock";

export default function PlaybackPanel() {
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

  const formatMsToTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
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
    <div className="flex-1 min-h-0 flex flex-col bg-neutral-900 text-white min-w-0 overflow-hidden">
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
        <PlaybackControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          playbackRate={playbackRate}
          volume={volume}
          isMuted={isMuted}
          loadingAudio={loadingAudio}
          hasAudioUrl={!!audioUrl}
          onPlayPause={handlePlayPause}
          onStop={handleStop}
          onSkip={handleSkip}
          onTimelineChange={handleTimelineChange}
          onPlaybackRateChange={setPlaybackRate}
          onVolumeChange={(val) => {
            setVolume(val);
            setIsMuted(false);
          }}
          onToggleMute={() => setIsMuted(!isMuted)}
        />
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
          transcripts.map((transcript) => (
            <TranscriptBlock
              key={transcript.id}
              idPrefix="transcript-card-"
              transcript={transcript}
              isActive={activeTranscriptId === transcript.id}
              onClickBlock={handleTranscriptClick}
              onClickWord={handleTranscriptClick}
              formatTime={formatMsToTime}
            />
          ))
        )}
      </div>
    </div>
  );
}
