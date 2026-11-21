import { Transcript } from "../services/db";

// Helper to format ms to SRT timestamp (HH:MM:SS,mmm)
export const formatMsToSrtTime = (ms: number): string => {
  const totalMs = Math.max(0, Math.round(ms));
  const s = Math.floor(totalMs / 1000);
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)},${pad(totalMs % 1000, 3)}`;
};

// Exact character length of generateSrtContent(transcripts) without allocating the string
export const estimateSrtLength = (transcripts: Transcript[]): number => {
  if (transcripts.length === 0) return 0;
  let total = transcripts.length - 1; // "\n" separators
  for (let i = 0; i < transcripts.length; i++) {
    const t = transcripts[i];
    total +=
      String(i + 1).length +
      42 +
      t.speakerId.length +
      t.text.length +
      (t.translation ? t.translation.length + 3 : 0);
  }
  return total;
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

// Trigger download of an existing blob URL and revoke after the browser starts reading it
export const triggerBlobDownload = (url: string, filename: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Trigger download in browser
export const downloadFile = (
  content: string,
  filename: string,
  contentType: string,
) => {
  const blob = new Blob([content], { type: contentType });
  triggerBlobDownload(URL.createObjectURL(blob), filename);
};
