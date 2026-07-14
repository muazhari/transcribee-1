import React from "react";

interface TranscriptWordProps {
  word: string;
  start: number;
  end: number;
  isFinal: boolean;
  onClick: (start: number, end: number) => void;
  formatTime?: (ms: number) => string;
}

export default function TranscriptWord({
  word,
  start,
  end,
  isFinal,
  onClick,
  formatTime,
}: TranscriptWordProps) {
  const timeString = formatTime
    ? ` (${formatTime(start)} - ${formatTime(end)})`
    : "";

  if (!isFinal) {
    return (
      <span className="leading-relaxed text-neutral-400 italic select-none tracking-wide rounded transition duration-75 border-b border-transparent">
        {word}
      </span>
    );
  }

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick(start, end);
      }}
      className="cursor-pointer hover:bg-violet-500/20 hover:text-violet-300 rounded transition duration-75 border-b border-transparent hover:border-violet-500/40"
      title={formatTime ? `Play word${timeString}` : undefined}
    >
      {word}
    </span>
  );
}
