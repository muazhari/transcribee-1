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

const buildSegments = (
  finalTokens: Transcript[],
  nonFinalTokens: Transcript[],
): Transcript[] => {
  const allTokens = [...finalTokens, ...nonFinalTokens];
  if (allTokens.length === 0) return [];

  const segments: Transcript[] = [];
  const activeSegBySpeaker: Record<string, Transcript> = {};
  const lastFinalizedSegBySpeaker: Record<string, Transcript> = {};
  const pendingTransBySpeaker: Record<string, string> = {};

  for (const token of allTokens) {
    const isTranslation = token.translationStatus === "translation";
    const speakerId = token.speakerId || "1";
    const isEnd = token.text.includes("<end>");
    const text = cleanText(token.text);

    if (isTranslation) {
      if (!text) continue;
      const targetSeg =
        activeSegBySpeaker[speakerId] || lastFinalizedSegBySpeaker[speakerId];

      if (targetSeg) {
        targetSeg.translation = (targetSeg.translation || "") + text;
      } else {
        pendingTransBySpeaker[speakerId] =
          (pendingTransBySpeaker[speakerId] || "") + text;
      }
    } else {
      // Original speech token
      let current: Transcript | null | undefined = activeSegBySpeaker[speakerId];

      if (!current) {
        if (text.trim().length > 0 || !isEnd) {
          const pending = pendingTransBySpeaker[speakerId];
          delete pendingTransBySpeaker[speakerId];

          current = {
            ...token,
            id: `${token.sessionId}-${token.offsetTimestamp || 0}-${speakerId}-${token.startTimestamp}`,
            text: text.replace(/^\s+/, ""),
            duration: Math.max(0, token.endTimestamp - token.startTimestamp),
            isFinal: token.isFinal,
            translation: pending || undefined,
          };
          activeSegBySpeaker[speakerId] = current;
          segments.push(current);
        }
      } else {
        const isBoundary =
          token.speakerId !== current.speakerId ||
          token.language !== current.language;

        if (isBoundary) {
          current.isFinal = true;
          lastFinalizedSegBySpeaker[speakerId] = current;

          const pending = pendingTransBySpeaker[speakerId];
          delete pendingTransBySpeaker[speakerId];

          current =
            text.trim().length > 0 || !isEnd
              ? {
                  ...token,
                  id: `${token.sessionId}-${token.offsetTimestamp || 0}-${speakerId}-${token.startTimestamp}`,
                  text: text.replace(/^\s+/, ""),
                  duration: Math.max(
                    0,
                    token.endTimestamp - token.startTimestamp,
                  ),
                  isFinal: token.isFinal,
                  translation: pending || undefined,
                }
              : null;

          if (current) {
            activeSegBySpeaker[speakerId] = current;
            segments.push(current);
          } else {
            delete activeSegBySpeaker[speakerId];
          }
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
        current.isFinal = true;
        lastFinalizedSegBySpeaker[speakerId] = current;
        delete activeSegBySpeaker[speakerId];
      }
    }
  }

  return segments
    .filter((s) => s.text.trim().length > 0)
    .map((s) => ({
      ...s,
      translation: s.translation?.trim() || undefined,
    }));
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
  },
});

export const {
  setSessionId,
  setTranscripts,
  clearTranscripts,
  updateTranscripts,
  commitLiveTranscripts,
} = transcriptionSlice.actions;

export default transcriptionSlice.reducer;
