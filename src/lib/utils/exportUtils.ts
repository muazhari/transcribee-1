import { Transcript } from "../services/db";

export { formatMsToTime } from "./transcriptUtils";

// Helper to format ms to SRT timestamp (HH:MM:SS,mmm)
export const formatMsToSrtTime = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)},${pad(ms % 1000, 3)}`;
};

// Generate SRT content
export const generateSrtContent = (transcripts: Transcript[]): string => {
  return transcripts
    .map((t, idx) => {
      const seq = idx + 1;
      const start = formatMsToSrtTime(t.startTimestamp);
      const end = formatMsToSrtTime(t.endTimestamp);
      const text = `Speaker ${t.speakerId}: ${t.text}${t.translation ? `\n(${t.translation})` : ""}`;
      return `${seq}\n${start} --> ${end}\n${text}\n`;
    })
    .join("\n");
};

// Trigger download in browser
export const downloadFile = (
  content: string,
  filename: string,
  contentType: string,
) => {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
