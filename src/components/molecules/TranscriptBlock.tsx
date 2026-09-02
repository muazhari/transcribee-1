import React from "react";
import { Transcript } from "../../lib/services/db";
import {
  formatMsToTime,
  getWordTimestampRanges,
} from "../../lib/utils/transcriptUtils";
import Badge from "../atoms/Badge";
import TranscriptWord from "./TranscriptWord";

export interface TranscriptBlockProps {
  transcript: Transcript;
  isActive?: boolean;

  /**
   * Callback fired when seeking playback to a specific timestamp in milliseconds.
   * Triggered when clicking the block container or an individual word.
   */
  onSeekToTimestamp?: (timestampMs: number) => void;

  /**
   * Callback fired when playing an audio segment slice [startMs, endMs].
   * Triggered when clicking an individual word or the header timestamp range.
   */
  onPlaySegment?: (startTimestampMs: number, endTimestampMs: number) => void;

  /**
   * Legacy alias for onSeekToTimestamp.
   */
  onClickBlock?: (startTimestamp: number) => void;

  /**
   * Legacy alias for onPlaySegment.
   */
  onClickWord?: (startTimestamp: number, endTimestamp: number) => void;
}

export default function TranscriptBlock({
  transcript,
  isActive = false,
  onSeekToTimestamp,
  onPlaySegment,
  onClickBlock,
  onClickWord,
}: TranscriptBlockProps) {
  // Resolve unified interaction handlers (preferring new explicit props over legacy aliases)
  const handleSeek = onSeekToTimestamp || onClickBlock;
  const handlePlaySegment = onPlaySegment || onClickWord;

  const wordRanges = getWordTimestampRanges(transcript);

  const startStr = formatMsToTime(transcript.startTimestamp);
  const endStr = formatMsToTime(transcript.endTimestamp);

  const handleContainerClick = () => {
    if (handleSeek) {
      handleSeek(transcript.startTimestamp);
    }
  };

  const handleHeaderTimeClick = (e: React.MouseEvent) => {
    if (!handleSeek && handlePlaySegment) {
      e.stopPropagation();
      handlePlaySegment(transcript.startTimestamp, transcript.endTimestamp);
    }
  };

  const handleWordClick = (wordStart: number, wordEnd: number) => {
    if (handleSeek) {
      handleSeek(wordStart);
    } else if (handlePlaySegment) {
      handlePlaySegment(wordStart, wordEnd);
    }
  };

  return (
    <div
      id={`transcript-card-${transcript.id}`}
      onClick={handleContainerClick}
      className={`flex flex-col gap-1.5 p-4 rounded-xl border transition-all duration-300 ${
        handleSeek ? "cursor-pointer" : ""
      } ${
        isActive
          ? "bg-violet-950/30 border-violet-500/50 shadow-md shadow-violet-950/20 scale-[1.01]"
          : transcript.isFinal
            ? "border-white/10 bg-neutral-900/40 hover:border-violet-500/20"
            : "border-dashed border-amber-500/20 bg-amber-950/5 animate-[pulse_3s_infinite]"
      }`}
    >
      {/* Header: Speaker identity & timestamp range */}
      <div className="flex items-center justify-between">
        <Badge variant={isActive ? "violet-filled" : "violet"}>
          Speaker {transcript.speakerId}
        </Badge>
        <span
          className={`font-mono text-[0.625rem] ${
            !handleSeek && handlePlaySegment
              ? "cursor-pointer text-neutral-500 hover:text-violet-300 p-1 hover:bg-violet-500/20 rounded transition border-b border-transparent hover:border-violet-500/40"
              : "text-neutral-400"
          }`}
          onClick={handleHeaderTimeClick}
        >
          {startStr} - {endStr}
        </span>
      </div>

      {/* Body: Rendered words */}
      <div className="text-sm font-medium leading-relaxed text-neutral-200 flex flex-wrap gap-x-1 gap-y-1">
        {wordRanges.map(({ word, start, end }, idx) => (
          <TranscriptWord
            key={idx}
            word={word}
            start={start}
            end={end}
            isFinal={transcript.isFinal}
            onClick={handleWordClick}
          />
        ))}
      </div>

      {/* Footer: Translation block (if present) */}
      {transcript.translation && (
        <div className="mt-2 pt-2 border-t border-white/5 flex flex-col gap-1">
          <span className="text-[0.625rem] font-bold text-neutral-500 uppercase tracking-widest">
            Translation
          </span>
          <p className="text-sm text-neutral-400">{transcript.translation}</p>
        </div>
      )}
    </div>
  );
}
