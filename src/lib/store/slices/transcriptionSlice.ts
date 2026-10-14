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
  const segments: Transcript[] = [];
  const active: Record<string, Transcript> = {};
  const lastFinalized: Record<string, Transcript> = {};
  const pending: Record<string, string> = {};

  for (const token of [...finalTokens, ...nonFinalTokens]) {
    const speakerId = token.speakerId || "1";
    const isEnd = token.text.includes("<end>");
    const text = cleanText(token.text);

    if (token.translationStatus === "translation") {
      if (!text) continue;
      const target = active[speakerId] || lastFinalized[speakerId];
      if (target) target.translation = (target.translation || "") + text;
      else pending[speakerId] = (pending[speakerId] || "") + text;
      continue;
    }

    let current: Transcript | undefined = active[speakerId];

    // A language change closes the speaker's open segment.
    if (current && token.language !== current.language) {
      current.isFinal = true;
      lastFinalized[speakerId] = current;
      delete active[speakerId];
      current = undefined;
    }

    if (current) {
      current.text += text;
      current.endTimestamp = Math.max(current.endTimestamp, token.endTimestamp);
      current.duration = Math.max(0, current.endTimestamp - current.startTimestamp);
      current.isFinal = token.isFinal;
    } else if (text.trim() || !isEnd) {
      current = {
        ...token,
        id: `${token.sessionId}-${token.offsetTimestamp || 0}-${speakerId}-${token.startTimestamp}`,
        text: text.trimStart(),
        duration: Math.max(0, token.endTimestamp - token.startTimestamp),
        translation: pending[speakerId] || undefined,
      };
      delete pending[speakerId];
      active[speakerId] = current;
      segments.push(current);
    }

    if (isEnd && current) {
      current.isFinal = true;
      lastFinalized[speakerId] = current;
      delete active[speakerId];
    }
  }

  return segments
    .filter((s) => s.text.trim())
    .map((s) => ({ ...s, translation: s.translation?.trim() || undefined }));
};

const resetLive = (state: TranscriptionState) => {
  state.finalTranscripts = [];
  state.nonFinalTranscripts = [];
  state.currentOffset = null;
};

const commitLive = (state: TranscriptionState) => {
  state.savedTranscripts = state.transcripts.map((t) => ({
    ...t,
    isFinal: true,
  }));
  state.finalTranscripts = [];
  state.nonFinalTranscripts = [];
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
      state.transcripts = action.payload;
      state.savedTranscripts = action.payload;
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

      const tokenOffset = newTokens[0].offsetTimestamp ?? 0;
      if (state.currentOffset !== null && state.currentOffset !== tokenOffset) {
        commitLive(state);
      }
      state.currentOffset = tokenOffset;

      state.finalTranscripts.push(...newTokens.filter((t) => t.isFinal));
      state.nonFinalTranscripts = newTokens.filter((t) => !t.isFinal);

      state.transcripts = [
        ...state.savedTranscripts,
        ...buildSegments(state.finalTranscripts, state.nonFinalTranscripts),
      ];
    },
    commitLiveTranscripts: (state) => {
      commitLive(state);
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
