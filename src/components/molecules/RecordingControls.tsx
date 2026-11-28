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
    <div className="px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6 border-t border-white/10 bg-neutral-950/80 flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-2.5 sm:gap-4 shrink-0 w-full">
      {isRecording && (
        <div className="flex items-center justify-center gap-2 flex-wrap sm:contents">
          <Badge
            variant={
              isReconnecting
                ? "yellow"
                : streamHealth === "good"
                  ? "green"
                  : "red"
            }
            pulsing
            className="sm:order-1"
          >
            {isReconnecting
              ? "Reconnecting..."
              : `${streamHealth.toUpperCase()}`}
          </Badge>
          {keepAliveActive && (
            <Badge
              variant="violet"
              className="sm:order-3"
              title="Background and sleep resilience active"
            >
              🛡️ Alive
            </Badge>
          )}
        </div>
      )}
      <Button
        onClick={onStartStop}
        variant={isRecording ? "danger" : "primary"}
        size="none"
        className={`w-full max-w-xs sm:w-auto sm:max-w-none sm:order-2 px-6 sm:px-8 py-3 sm:py-3.5 rounded-full text-sm font-bold shadow-lg flex items-center justify-center gap-2 whitespace-nowrap ${
          isRecording
            ? "shadow-red-950/20 animate-pulse"
            : "shadow-violet-950/20"
        }`}
      >
        <span>{isRecording ? "⏹️" : "🎙️"}</span>
        <span>{isRecording ? "Stop Recording" : "Start Recording"}</span>
      </Button>
    </div>
  );
}
