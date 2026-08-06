import { Transcript } from "../services/db";

export interface WordTimestampRange {
  word: string;
  start: number;
  end: number;
}

/**
 * Formats milliseconds into standard M:SS time string.
 * Example: 65000 -> "1:05"
 */
export const formatMsToTime = (ms: number): string => {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Estimates character-weighted word timing ranges for a transcript segment.
 * Words with more characters receive proportionally longer time allocations.
 */
export const getWordTimestampRanges = (
  transcript: Transcript,
): WordTimestampRange[] => {
  const words = transcript.text.split(" ").filter(Boolean);
  if (words.length === 0) return [];

  const weights = words.map((w) => Math.max(1, w.length));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  const cumulativeWeights = weights.reduce<number[]>((acc, w) => {
    const prevSum = acc.length > 0 ? acc[acc.length - 1] : 0;
    acc.push(prevSum + w);
    return acc;
  }, []);

  return words.map((word, idx) => {
    const startWeight = idx === 0 ? 0 : cumulativeWeights[idx - 1];
    const endWeight = cumulativeWeights[idx];

    const start =
      totalWeight > 0 && transcript.duration > 0
        ? Math.round(
            transcript.startTimestamp +
              (startWeight / totalWeight) * transcript.duration,
          )
        : transcript.startTimestamp;

    const end =
      totalWeight > 0 && transcript.duration > 0
        ? Math.round(
            transcript.startTimestamp +
              (endWeight / totalWeight) * transcript.duration,
          )
        : transcript.endTimestamp;

    return { word, start, end };
  });
};
