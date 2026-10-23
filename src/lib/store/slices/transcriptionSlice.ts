import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Transcript } from "../../services/db";

export interface TranscriptionState {
  sessionId: string | null;
  transcripts: Transcript[];
  savedTranscripts: Transcript[];
  finalTranscripts: Transcript[];
  currentOffset: number | null;
}

const initialState: TranscriptionState = {
  sessionId: null,
  transcripts: [],
  savedTranscripts: [],
  finalTranscripts: [],
  currentOffset: null,
};

const cleanText = (text: string): string => text.replace(/<end>/g, "");

const finalizeAll = (transcripts: Transcript[]): Transcript[] =>
  transcripts.map((t) => (t.isFinal ? t : { ...t, isFinal: true }));

const buildSegments = (
  tokens: Transcript[],
  baseIndex: number,
): Transcript[] => {
  const segments: Transcript[] = [];
  let current: Transcript | undefined;
  const lastBySpeaker: Record<string, Transcript> = {};
  const pending: Record<string, string> = {};

  for (const token of tokens) {
    const speakerId = token.speakerId || "1";
    const isEnd = token.text.includes("<end>");
    const text = cleanText(token.text);

    if (token.translationStatus === "translation") {
      if (!text) continue;
      const target = lastBySpeaker[speakerId];
      if (target) target.translation = (target.translation || "") + text;
      else pending[speakerId] = (pending[speakerId] || "") + text;
      continue;
    }

    if (!text) {
      if (isEnd && current) {
        current.isFinal = token.isFinal;
        current = undefined;
      }
      continue;
    }

    // Close active segment on speaker or language change
    if (
      current &&
      (current.speakerId !== speakerId ||
        Boolean(
          current.language &&
            token.language &&
            current.language !== token.language,
        ))
    ) {
      current = undefined;
    }

    if (current) {
      current.text += text;
      current.endTimestamp = Math.max(current.endTimestamp, token.endTimestamp);
      current.duration = Math.max(
        0,
        current.endTimestamp - current.startTimestamp,
      );
      current.isFinal = token.isFinal;
      current.language ||= token.language;
    } else if (text.trim()) {
      current = {
        ...token,
        id: `${token.sessionId}-${baseIndex + segments.length}`,
        speakerId,
        text: text.trimStart(),
        duration: Math.max(0, token.endTimestamp - token.startTimestamp),
        translation: pending[speakerId] || undefined,
      };
      delete pending[speakerId];
      lastBySpeaker[speakerId] = current;
      segments.push(current);
    }

    if (isEnd) {
      current = undefined;
    }
  }

  return segments.map((s) => ({
    ...s,
    text: s.text.trim(),
    translation: s.translation?.trim() || undefined,
  }));
};

const resetLive = (state: TranscriptionState) => {
  state.finalTranscripts = [];
  state.currentOffset = null;
};

const commitLive = (state: TranscriptionState) => {
  state.transcripts = finalizeAll(state.transcripts);
  state.savedTranscripts = state.transcripts;
  resetLive(state);
};

export const transcriptionSlice = createSlice({
  name: "transcription",
  initialState,
  reducers: {
    setSessionId: (state, action: PayloadAction<string | null>) => {
      state.sessionId = action.payload;
      state.transcripts = [];
      state.savedTranscripts = [];
      resetLive(state);
    },
    setTranscripts: (state, action: PayloadAction<Transcript[]>) => {
      const finalized = finalizeAll(action.payload);
      state.transcripts = finalized;
      state.savedTranscripts = finalized;
      resetLive(state);
    },
    clearTranscripts: (state) => {
      state.transcripts = [];
      state.savedTranscripts = [];
      resetLive(state);
    },
    updateTranscripts: (state, action: PayloadAction<Transcript[]>) => {
      const newTokens = action.payload;
      if (newTokens.length === 0) return;
      if (state.sessionId && newTokens[0].sessionId !== state.sessionId) return;

      const tokenOffset = newTokens[0].offsetTimestamp ?? 0;
      if (state.currentOffset !== null && state.currentOffset !== tokenOffset) {
        commitLive(state);
      }
      state.currentOffset = tokenOffset;

      state.finalTranscripts.push(...newTokens.filter((t) => t.isFinal));
      const nonFinal = newTokens.filter((t) => !t.isFinal);

      state.transcripts = [
        ...state.savedTranscripts,
        ...buildSegments(
          [...state.finalTranscripts, ...nonFinal],
          state.savedTranscripts.length,
        ),
      ];
    },
    commitLiveTranscripts: commitLive,
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
