import React from "react";
import Button from "../atoms/Button";

interface RecordingControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  onStartStop: () => void;
  onPauseResume: () => void;
}

export default function RecordingControls({
  isRecording,
  isPaused,
  onStartStop,
  onPauseResume,
}: RecordingControlsProps) {
  return (
    <div className="p-6 border-t border-white/10 bg-neutral-950/80 flex items-center justify-center gap-4 shrink-0 w-full">
      <Button
        onClick={onStartStop}
        variant={isRecording ? "danger" : "primary"}
        size="none"
        className={`!px-8 !py-3.5 !rounded-full text-sm font-bold shadow-lg flex items-center gap-2 ${
          isRecording
            ? "!bg-red-600 hover:!bg-red-500 shadow-red-950/20 animate-pulse"
            : "shadow-violet-950/20"
        }`}
      >
        <span>{isRecording ? "⏹️" : "🎙️"}</span>
        <span>{isRecording ? "Stop Recording" : "Start Recording"}</span>
      </Button>

      {isRecording && (
        <Button
          onClick={onPauseResume}
          variant="secondary"
          size="none"
          className="!px-6 !py-3.5 !rounded-full text-sm font-bold bg-neutral-800 hover:bg-neutral-700 text-white border border-white/10 active:scale-95"
        >
          {isPaused ? "▶️ Resume" : "⏸️ Pause"}
        </Button>
      )}
    </div>
  );
}
