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
  tokenOwner?: Map<Transcript, string>,
): Transcript[] => {
  const segments: Transcript[] = [];
  let current: Transcript | undefined;
  const bySpeaker: Record<string, Transcript[]> = {};
  const lastTranslationTarget: Record<string, Transcript | undefined> = {};
  const pending: Record<string, Transcript[]> = {};

  for (const token of tokens) {
    const speakerId = token.speakerId || "1";
    const isEnd = token.text.includes("<end>");
    const text = cleanText(token.text);

    if (token.translationStatus === "translation") {
      if (!text) continue;
      const list = bySpeaker[speakerId] ?? [];
      const valid = list.filter(
        (s) => !token.language || !s.language || s.language !== token.language,
      );
      const candidates = valid.length > 0 ? valid : list;
      const byTime =
        token.duration > 0
          ? candidates.find(
              (s) =>
                token.startTimestamp >= s.startTimestamp &&
                token.startTimestamp <= s.endTimestamp,
            )
          : undefined;
      const target =
        byTime ||
        (lastTranslationTarget[speakerId] &&
          candidates.includes(lastTranslationTarget[speakerId]!) &&
          lastTranslationTarget[speakerId]) ||
        candidates.find((s) => !s.translation) ||
        candidates[candidates.length - 1];
      if (target) {
        target.translation = (target.translation || "") + text;
        lastTranslationTarget[speakerId] = target;
        tokenOwner?.set(token, target.id);
      } else {
        (pending[speakerId] ??= []).push(token);
      }
      continue;
    }

    lastTranslationTarget[speakerId] = undefined;

    if (!text) {
      if (isEnd && current) {
        current.isFinal = token.isFinal;
        tokenOwner?.set(token, current.id);
        current = undefined;
      } else {
        tokenOwner?.set(token, "drop");
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
      tokenOwner?.set(token, current.id);
    } else if (text.trim()) {
      const pendingTokens = pending[speakerId];
      const pendingText = pendingTokens
        ?.map((t) => cleanText(t.text))
        .join("");
      current = {
        ...token,
        id: `${token.sessionId}-${baseIndex + segments.length}`,
        speakerId,
        text: text.trimStart(),
        duration: Math.max(0, token.endTimestamp - token.startTimestamp),
        translation: pendingText || undefined,
      };
      if (pendingTokens) {
        for (const pt of pendingTokens) tokenOwner?.set(pt, current.id);
        delete pending[speakerId];
      }
      (bySpeaker[speakerId] ??= []).push(current);
      segments.push(current);
      tokenOwner?.set(token, current.id);
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

      if (state.finalTranscripts.length > 64) {
        const owner = new Map<Transcript, string>();
        const finalSegs = buildSegments(
          state.finalTranscripts,
          state.savedTranscripts.length,
          owner,
        );
        if (finalSegs.length > 2) {
          const archived = finalizeAll(finalSegs.slice(0, -2));
          const dropIds = new Set([...archived.map((s) => s.id), "drop"]);
          state.savedTranscripts.push(...archived);
          state.finalTranscripts = state.finalTranscripts.filter(
            (t) => !dropIds.has(owner.get(t) ?? ""),
          );
        }
      }

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
  updateTranscripts,
  commitLiveTranscripts,
} = transcriptionSlice.actions;

export default transcriptionSlice.reducer;
