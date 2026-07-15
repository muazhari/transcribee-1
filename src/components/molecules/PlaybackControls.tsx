import React from "react";
import Button from "../atoms/Button";

interface PlaybackControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  loadingAudio: boolean;
  hasAudioUrl: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onSkip: (seconds: number) => void;
  onTimelineChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPlaybackRateChange: (rate: number) => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
}

export default function PlaybackControls({
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  volume,
  isMuted,
  loadingAudio,
  hasAudioUrl,
  onPlayPause,
  onStop,
  onSkip,
  onTimelineChange,
  onPlaybackRateChange,
  onVolumeChange,
  onToggleMute,
}: PlaybackControlsProps) {
  const formatTime = (secs: number) => {
    if (isNaN(secs)) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (loadingAudio) {
    return (
      <div className="flex flex-col items-center justify-center py-6 gap-2">
        <div className="w-8 h-8 rounded-full border-2 border-t-violet-500 border-neutral-800 animate-spin" />
        <span className="text-xs text-neutral-400">
          Compiling session audio...
        </span>
      </div>
    );
  }

  if (!hasAudioUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-neutral-500">
        <span className="text-2xl mb-1">🔇</span>
        <span className="text-xs">No audio recorded for this session.</span>
      </div>
    );
  }

  return (
    <div className="bg-neutral-950/80 border border-white/10 p-4 sm:p-6 rounded-2xl flex flex-col gap-4 sm:gap-5 shadow-xl shadow-neutral-950/30">
      {/* Media Button Bar */}
      <div className="flex flex-wrap flex-col items-center justify-center gap-4 w-full">
        {/* Playback States */}
        <div className="flex flex-wrap items-center justify-center gap-4 shrink-0">
          <Button
            onClick={() => onSkip(-5)}
            variant="secondary"
            size="none"
            className="!px-3.5 !py-2.5 !rounded-full text-neutral-400 hover:text-white whitespace-nowrap text-xs font-semibold"
            title="Rewind 5s"
          >
            <span>⏪</span>
          </Button>
          <Button
            onClick={onPlayPause}
            variant="primary"
            size="none"
            className="w-14 h-14 !rounded-full text-white text-xl shadow-lg shadow-violet-950/30"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "⏸️" : "▶️"}
          </Button>
          <Button
            onClick={onStop}
            variant="secondary"
            size="none"
            className="!p-3 !rounded-full text-neutral-400 hover:text-white"
            title="Stop & Reset"
          >
            ⏹️
          </Button>
          <Button
            onClick={() => onSkip(5)}
            variant="secondary"
            size="none"
            className="!px-3.5 !py-2.5 !rounded-full text-neutral-400 hover:text-white whitespace-nowrap text-xs font-semibold"
            title="Forward 5s"
          >
            <span>⏩</span>
          </Button>
        </div>

        <div className="flex flex-row items-center justify-center gap-4 shrink-0 flex-wrap">
          {/* Speed Toggles */}
          <div className="flex flex-row flex-nowrap items-center justify-center gap-1 bg-neutral-900 border border-white/5 p-1 rounded-xl shrink-0">
            {([0.5, 1.0, 1.25, 1.5, 2.0] as const).map((rate) => (
              <button
                key={rate}
                onClick={() => onPlaybackRateChange(rate)}
                type="button"
                className={`px-2.5 py-1.5 rounded-lg text-[0.625rem] font-bold transition-all cursor-pointer ${
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
          <div className="flex items-center justify-center gap-3 min-w-[8.75rem] shrink-0">
            <Button
              onClick={onToggleMute}
              variant="secondary"
              size="none"
              className="!p-2 !rounded-lg hover:border-violet-500/20 text-neutral-400 hover:text-white"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0
                ? "🔇"
                : volume < 0.5
                  ? "🔉"
                  : "🔊"}
            </Button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-full max-w-[7.5rem] h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
              title="Volume slider"
            />
          </div>
        </div>
      </div>

      {/* Timeline Slider */}
      <div className="flex items-center gap-3">
        <span className="text-[0.625rem] font-mono text-neutral-400 w-10 text-right">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={onTimelineChange}
          className="flex-1 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <span className="text-[0.625rem] font-mono text-neutral-400 w-10 text-left">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
