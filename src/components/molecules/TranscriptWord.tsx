import { formatMsToTime } from "@/lib/utils/transcriptUtils";
import React from "react";

export interface TranscriptWordProps {
  word: string;
  start: number;
  end: number;
  isFinal: boolean;
  onClick: (startMs: number, endMs: number) => void;
}

export default function TranscriptWord({
  word,
  start,
  end,
  isFinal,
  onClick,
}: TranscriptWordProps) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick(start, end);
      }}
      className="cursor-pointer hover:bg-violet-500/20 hover:text-violet-300 rounded transition duration-75 border-b border-transparent hover:border-violet-500/40"
      title={`Play word (${formatMsToTime(start)} - ${formatMsToTime(end)})`}
    >
      {word}
    </span>
  );
}
