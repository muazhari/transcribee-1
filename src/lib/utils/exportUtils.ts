import { Transcript } from "../services/db";

// Helper to format ms to SRT timestamp (HH:MM:SS,mmm)
export const formatMsToSrtTime = (ms: number): string => {
  const totalSecs = Math.floor(ms / 1000);
  const msecs = ms % 1000;
  const secs = totalSecs % 60;
  const mins = Math.floor(totalSecs / 60) % 60;
  const hours = Math.floor(totalSecs / 3600);

  const hh = hours.toString().padStart(2, "0");
  const mm = mins.toString().padStart(2, "0");
  const ss = secs.toString().padStart(2, "0");
  const mmm = msecs.toString().padStart(3, "0");

  return `${hh}:${mm}:${ss},${mmm}`;
};

// Helper to format seconds/ms to normal standard time (MM:SS)
export const formatMsToTime = (ms: number): string => {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// Generate TXT content
export const generateTxtContent = (transcripts: Transcript[], title: string): string => {
  const header = `Transcribee Session Transcript: ${title}\n========================================\n\n`;
  const body = transcripts
    .map((t) => {
      const start = formatMsToTime(t.startTimestamp);
      const end = formatMsToTime(t.endTimestamp);
      let block = `[${start} - ${end}] Speaker ${t.speakerId}: ${t.text}`;
      if (t.translation) {
        block += `\nTranslation: ${t.translation}`;
      }
      return block;
    })
    .join("\n\n");
  return header + body;
};

// Generate SRT content
export const generateSrtContent = (transcripts: Transcript[]): string => {
  return transcripts
    .map((t, idx) => {
      const seq = idx + 1;
      const start = formatMsToSrtTime(t.startTimestamp);
      const end = formatMsToSrtTime(t.endTimestamp);
      const text = `Speaker ${t.speakerId}: ${t.text}${t.translation ? `\n(Translation: ${t.translation})` : ""}`;
      return `${seq}\n${start} --> ${end}\n${text}\n`;
    })
    .join("\n");
};

// Trigger download in browser
export const downloadFile = (content: string, filename: string, contentType: string) => {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
