import React from "react";
import { Transcript } from "../../lib/services/db";
import Badge from "../atoms/Badge";
import TranscriptWord from "./TranscriptWord";

interface TranscriptBlockProps {
  transcript: Transcript;
  isActive?: boolean;
  onClickBlock?: (startTimestamp: number) => void;
  onClickWord: (startTimestamp: number, endTimestamp: number) => void;
  formatTime: (ms: number) => string;
  idPrefix?: string;
}

export default function TranscriptBlock({
  transcript,
  isActive = false,
  onClickBlock,
  onClickWord,
  formatTime,
  idPrefix,
}: TranscriptBlockProps) {
  const startStr = formatTime(transcript.startTimestamp);
  const endStr = formatTime(transcript.endTimestamp);

  const words = transcript.text.split(" ").filter(Boolean);
  const N = words.length;
  const durationPerWord = N > 0 ? transcript.duration / N : 0;

  const handleBlockClick = () => {
    if (onClickBlock) {
      onClickBlock(transcript.startTimestamp);
    }
  };

  return (
    <div
      id={idPrefix ? `${idPrefix}${transcript.id}` : undefined}
      onClick={handleBlockClick}
      className={`flex flex-col gap-1.5 p-4 rounded-xl border transition-all duration-300 ${
        onClickBlock ? "cursor-pointer" : ""
      } ${
        isActive
          ? "bg-violet-950/30 border-violet-500/50 shadow-md shadow-violet-950/20 scale-[1.01]"
          : transcript.isFinal
            ? "border-white/10 bg-neutral-900/40 hover:border-violet-500/20"
            : "border-dashed border-amber-500/20 bg-amber-950/5 animate-[pulse_3s_infinite]"
      }`}
    >
      <div className="flex items-center justify-between">
        <Badge
          variant={isActive ? "violet-filled" : "violet"}
          className={isActive ? "" : ""}
        >
          Speaker {transcript.speakerId}
        </Badge>
        <span
          className={`font-mono text-[10px] ${
            !onClickBlock
              ? "cursor-pointer text-neutral-500 hover:text-violet-300 p-1 hover:bg-violet-500/20 rounded transition border-b border-transparent hover:border-violet-500/40"
              : "text-neutral-400"
          }`}
          onClick={(e) => {
            if (!onClickBlock) {
              e.stopPropagation();
              onClickWord(transcript.startTimestamp, transcript.endTimestamp);
            }
          }}
        >
          {startStr} - {endStr}
        </span>
      </div>

      {/* Words block */}
      <div className="text-sm font-medium leading-relaxed text-neutral-200 flex flex-wrap gap-x-1 gap-y-1">
        {words.map((word, idx) => {
          const start = Math.round(
            transcript.startTimestamp + idx * durationPerWord,
          );
          const end = Math.round(
            transcript.startTimestamp + (idx + 1) * durationPerWord,
          );
          return (
            <TranscriptWord
              key={idx}
              word={word}
              start={start}
              end={end}
              isFinal={transcript.isFinal}
              onClick={onClickWord}
              formatTime={!onClickBlock ? formatTime : undefined}
            />
          );
        })}
      </div>

      {/* Translation block if present */}
      {transcript.translation && (
        <div className="mt-2 pt-2 border-t border-white/5 flex flex-col gap-1">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
            Translation
          </span>
          <p className="text-sm text-neutral-400">
            {transcript.translation}
          </p>
        </div>
      )}
    </div>
  );
}
