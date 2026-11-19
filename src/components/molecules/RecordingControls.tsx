import React from "react";
import Badge from "../atoms/Badge";
import Button from "../atoms/Button";

interface RecordingControlsProps {
  isRecording: boolean;
  onStartStop: () => void;
  streamHealth: "good" | "poor" | "none";
  isReconnecting: boolean;
  keepAliveActive: boolean;
}

export default function RecordingControls({
  isRecording,
  onStartStop,
  streamHealth,
  isReconnecting,
  keepAliveActive,
}: RecordingControlsProps) {
  return (
    <div className="p-6 border-t border-white/10 bg-neutral-950/80 flex flex-wrap items-center justify-center gap-3 sm:gap-4 shrink-0 w-full">
      {isRecording && (
        <>
          <Badge
            variant={
              isReconnecting
                ? "yellow"
                : streamHealth === "good"
                  ? "green"
                  : "red"
            }
            pulsing
          >
            {isReconnecting
              ? "Reconnecting..."
              : `${streamHealth.toUpperCase()}`}
          </Badge>
        </>
      )}
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
        <>
          {keepAliveActive && (
            <Badge
              variant="violet"
              className="hidden sm:flex"
              title="Background and sleep resilience active"
            >
              🛡️ Alive
            </Badge>
          )}
        </>
      )}
    </div>
  );
}
