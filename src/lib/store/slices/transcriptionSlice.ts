import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Transcript } from "../../services/db";

export interface TranscriptionState {
  sessionId: string | null;
  transcripts: Transcript[];
  savedTranscripts: Transcript[];
  finalTranscripts: Transcript[];
  nonFinalTranscripts: Transcript[];
  currentOffset: number | null;
}

const initialState: TranscriptionState = {
  sessionId: null,
  transcripts: [],
  savedTranscripts: [],
  finalTranscripts: [],
  nonFinalTranscripts: [],
  currentOffset: null,
};

const cleanText = (text: string): string => text.replace(/<end>/g, "");

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.?!])\s+|(?<=[。？！])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

const buildSegments = (
  finalTokens: Transcript[],
  nonFinalTokens: Transcript[],
): Transcript[] => {
  const allTokens = [...finalTokens, ...nonFinalTokens];
  if (allTokens.length === 0) return [];

  const originalTokens = allTokens.filter(
    (t) => t.translationStatus !== "translation",
  );
  const translationTokens = allTokens.filter(
    (t) => t.translationStatus === "translation",
  );

  const segments: Transcript[] = [];
  let current: Transcript | null = null;

  for (const token of originalTokens) {
    const isEnd = token.text.includes("<end>");
    const text = cleanText(token.text);

    if (!current) {
      if (text.trim().length > 0 || !isEnd) {
        current = {
          ...token,
          id: `${token.sessionId}-${token.offsetTimestamp || 0}-${token.speakerId}-${token.startTimestamp}`,
          text: text.replace(/^\s+/, ""),
          duration: Math.max(0, token.endTimestamp - token.startTimestamp),
          isFinal: token.isFinal,
        };
      }
    } else {
      const isBoundary =
        token.speakerId !== current.speakerId ||
        token.language !== current.language;

      if (isBoundary) {
        if (current.text.trim().length > 0) {
          segments.push(current);
        }
        current =
          text.trim().length > 0 || !isEnd
            ? {
                ...token,
                id: `${token.sessionId}-${token.offsetTimestamp || 0}-${token.speakerId}-${token.startTimestamp}`,
                text: text.replace(/^\s+/, ""),
                duration: Math.max(0, token.endTimestamp - token.startTimestamp),
                isFinal: token.isFinal,
              }
            : null;
      } else {
        current.text += text;
        current.endTimestamp = Math.max(
          current.endTimestamp,
          token.endTimestamp,
        );
        current.duration = Math.max(
          0,
          current.endTimestamp - current.startTimestamp,
        );
        current.isFinal = token.isFinal;
      }
    }

    if (isEnd && current) {
      if (current.text.trim().length > 0) {
        current.isFinal = true;
        segments.push(current);
      }
      current = null;
    }
  }

  if (current && current.text.trim().length > 0) {
    segments.push(current);
  }

  // Attach translations by speaker
  if (translationTokens.length > 0) {
    const speakerTrans: Record<string, string> = {};
    for (const t of translationTokens) {
      const text = cleanText(t.text);
      if (!text) continue;
      speakerTrans[t.speakerId] = (speakerTrans[t.speakerId] || "") + text;
    }

    for (const speakerId in speakerTrans) {
      const origSegs = segments.filter((s) => s.speakerId === speakerId);
      const transText = speakerTrans[speakerId].trim();
      if (origSegs.length === 0 || !transText) continue;

      if (origSegs.length === 1) {
        origSegs[0].translation = transText;
      } else {
        const allOrigSentences: { segIndex: number; text: string }[] = [];
        for (let sIdx = 0; sIdx < origSegs.length; sIdx++) {
          const sentences = splitSentences(origSegs[sIdx].text);
          if (sentences.length === 0) {
            allOrigSentences.push({ segIndex: sIdx, text: origSegs[sIdx].text });
          } else {
            for (const s of sentences) {
              allOrigSentences.push({ segIndex: sIdx, text: s });
            }
          }
        }

        const transSentences = splitSentences(transText);
        const segmentTranslations: string[][] = origSegs.map(() => []);

        for (let i = 0; i < allOrigSentences.length; i++) {
          const origSent = allOrigSentences[i];
          if (i < transSentences.length) {
            segmentTranslations[origSent.segIndex].push(transSentences[i]);
          }
        }

        if (transSentences.length > allOrigSentences.length) {
          const leftover = transSentences.slice(allOrigSentences.length).join(" ");
          if (leftover && segmentTranslations.length > 0) {
            segmentTranslations[segmentTranslations.length - 1].push(leftover);
          }
        }

        for (let i = 0; i < origSegs.length; i++) {
          const joined = segmentTranslations[i].join(" ").trim();
          if (joined) {
            origSegs[i].translation = joined;
          }
        }
      }
    }
  }

  return segments;
};

export const transcriptionSlice = createSlice({
  name: "transcription",
  initialState,
  reducers: {
    setSessionId: (state, action: PayloadAction<string | null>) => {
      state.sessionId = action.payload;
      state.transcripts = [];
      state.savedTranscripts = [];
      state.finalTranscripts = [];
      state.nonFinalTranscripts = [];
      state.currentOffset = null;
    },
    setTranscripts: (state, action: PayloadAction<Transcript[]>) => {
      state.transcripts = action.payload;
      state.savedTranscripts = action.payload;
      state.finalTranscripts = [];
      state.nonFinalTranscripts = [];
      state.currentOffset = null;
    },
    clearTranscripts: (state) => {
      state.transcripts = [];
      state.savedTranscripts = [];
      state.finalTranscripts = [];
      state.nonFinalTranscripts = [];
      state.currentOffset = null;
    },
    updateTranscripts: (state, action: PayloadAction<Transcript[]>) => {
      const newTokens = action.payload;
      if (newTokens.length === 0) return;

      const tokenOffset = newTokens[0].offsetTimestamp ?? 0;
      const isNewStream =
        state.currentOffset !== null && state.currentOffset !== tokenOffset;

      if (isNewStream) {
        state.savedTranscripts = state.transcripts.map((t) => ({
          ...t,
          isFinal: true,
        }));
        state.finalTranscripts = [];
        state.nonFinalTranscripts = [];
      }
      state.currentOffset = tokenOffset;

      const newFinal = newTokens.filter((t) => t.isFinal);
      const newNonFinal = newTokens.filter((t) => !t.isFinal);

      state.finalTranscripts.push(...newFinal);
      state.nonFinalTranscripts = newNonFinal;

      const liveSegments = buildSegments(
        state.finalTranscripts,
        state.nonFinalTranscripts,
      );

      state.transcripts = [...state.savedTranscripts, ...liveSegments];
    },
    commitLiveTranscripts: (state) => {
      state.savedTranscripts = state.transcripts.map((t) => ({
        ...t,
        isFinal: true,
      }));
      state.finalTranscripts = [];
      state.nonFinalTranscripts = [];
      state.currentOffset = null;
    },
    truncateOldTranscripts: (state, action: PayloadAction<number>) => {
      const count = action.payload;
      if (count <= 0) return;
      if (count >= state.transcripts.length) {
        state.transcripts = [];
        state.savedTranscripts = [];
        state.finalTranscripts = [];
        state.nonFinalTranscripts = [];
        return;
      }
      state.transcripts = state.transcripts.slice(count);
      state.savedTranscripts = state.savedTranscripts.slice(count);
    },
  },
});

export const {
  setSessionId,
  setTranscripts,
  clearTranscripts,
  updateTranscripts,
  commitLiveTranscripts,
  truncateOldTranscripts,
} = transcriptionSlice.actions;

export default transcriptionSlice.reducer;
