import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Transcript } from "../../services/db";

export interface TranscriptionState {
  sessionId: string | null;
  transcripts: Transcript[];
  finalTranscripts: Transcript[];
  nonFinalTranscripts: Transcript[];
}

const initialState: TranscriptionState = {
  sessionId: null,
  transcripts: [],
  finalTranscripts: [],
  nonFinalTranscripts: [],
};

const splitSentences = (text: string): string[] => {
  return text
    .split(/(?<=[.?!])\s+|(?<=[。？！])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
};

export const transcriptionSlice = createSlice({
  name: "transcription",
  initialState,
  reducers: {
    setSessionId: (state, action: PayloadAction<string | null>) => {
      state.sessionId = action.payload;
      state.transcripts = [];
      state.finalTranscripts = [];
      state.nonFinalTranscripts = [];
    },
    setTranscripts: (state, action: PayloadAction<Transcript[]>) => {
      state.transcripts = action.payload;
      state.finalTranscripts = action.payload;
      state.nonFinalTranscripts = [];
    },
    clearTranscripts: (state) => {
      state.transcripts = [];
      state.finalTranscripts = [];
      state.nonFinalTranscripts = [];
    },
    updateTranscripts: (state, action: PayloadAction<Transcript[]>) => {
      const newTranscripts = action.payload;
      if (newTranscripts.length === 0) return;

      // 1. Separate final vs non-final transcripts
      const newFinal = newTranscripts.filter((t) => t.isFinal);
      const newNonFinal = newTranscripts.filter((t) => !t.isFinal);

      state.finalTranscripts.push(...newFinal);
      state.nonFinalTranscripts = newNonFinal;

      const transcripts = [...state.finalTranscripts, ...state.nonFinalTranscripts];

      // 2. Group transcripts by offsetTimestamp
      const groups: Record<number, Transcript[]> = {};
      for (const t of transcripts) {
        const offset = t.offsetTimestamp || 0;
        (groups[offset] = groups[offset] || []).push(t);
      }

      const sortedOffsets = Object.keys(groups)
        .map(Number)
        .sort((a, b) => a - b);

      const segmentTranscripts: Transcript[] = [];
      const cleanText = (text: string) => text.replace(/<end>/g, "");

      for (const offset of sortedOffsets) {
        const groupTranscripts = groups[offset];

        // 3. Separate original and translation tokens
        const originalTokens = groupTranscripts.filter(
          (t) => t.translationStatus !== "translation",
        );
        const translationTokens = groupTranscripts.filter(
          (t) => t.translationStatus === "translation",
        );

        // 4. Reconstruct original transcripts into segments by speaker & language
        const groupSegments: Transcript[] = [];
        let currentSegment: Transcript | null = null;

        for (const token of originalTokens) {
          const isEnd = token.text.includes("<end>");
          const text = cleanText(token.text);

          if (!currentSegment) {
            if (text.trim().length > 0 || !isEnd) {
              currentSegment = { ...token, text };
            }
          } else {
            const isBoundary =
              token.speakerId !== currentSegment.speakerId ||
              token.language !== currentSegment.language;

            if (isBoundary) {
              if (currentSegment.text.trim().length > 0) {
                groupSegments.push(currentSegment);
              }
              currentSegment = text.trim().length > 0 || !isEnd ? { ...token, text } : null;
            } else {
              currentSegment.text += text;
              currentSegment.endTimestamp = token.endTimestamp;
              currentSegment.duration = currentSegment.endTimestamp - currentSegment.startTimestamp;
              currentSegment.isFinal = token.isFinal;
            }
          }

          if (isEnd && currentSegment) {
            if (currentSegment.text.trim().length > 0) {
              groupSegments.push(currentSegment);
            }
            currentSegment = null;
          }
        }

        if (currentSegment && currentSegment.text.trim().length > 0) {
          groupSegments.push(currentSegment);
        }

        // 5. Group original segments and translation tokens by speaker
        const speakerOrigSegs: Record<string, Transcript[]> = {};
        for (const seg of groupSegments) {
          (speakerOrigSegs[seg.speakerId] = speakerOrigSegs[seg.speakerId] || []).push(seg);
        }

        const speakerTransTokens: Record<string, Transcript[]> = {};
        for (const trans of translationTokens) {
          (speakerTransTokens[trans.speakerId] = speakerTransTokens[trans.speakerId] || []).push(trans);
        }

        // 6. Map translation to segments speaker-by-speaker using timestamps
        for (const speakerId in speakerOrigSegs) {
          const origSegs = speakerOrigSegs[speakerId];
          const transTokens = speakerTransTokens[speakerId] || [];

          if (origSegs.length === 0 || transTokens.length === 0) {
            continue;
          }

          // Split original segments into sentences
          const allOrigSentences: { segIndex: number; text: string }[] = [];
          for (let segIndex = 0; segIndex < origSegs.length; segIndex++) {
            const sentences = splitSentences(origSegs[segIndex].text);
            if (sentences.length === 0) {
              allOrigSentences.push({ segIndex, text: origSegs[segIndex].text });
            } else {
              for (const s of sentences) {
                allOrigSentences.push({ segIndex, text: s });
              }
            }
          }

          // Join translation tokens and split into sentences
          const fullTranslationText = transTokens
            .map((t) => cleanText(t.text))
            .join("")
            .trim();
          const translationSentences = splitSentences(fullTranslationText);

          // Map translation sentences to original segment indexes
          const segmentTranslationParts: string[][] = origSegs.map(() => []);

          for (let i = 0; i < allOrigSentences.length; i++) {
            const origSent = allOrigSentences[i];
            if (i < translationSentences.length) {
              segmentTranslationParts[origSent.segIndex].push(translationSentences[i]);
            }
          }

          // If there are leftover translation sentences, append them to the last segment
          if (translationSentences.length > allOrigSentences.length) {
            const leftover = translationSentences.slice(allOrigSentences.length).join(" ");
            if (leftover && segmentTranslationParts.length > 0) {
              segmentTranslationParts[segmentTranslationParts.length - 1].push(leftover);
            }
          }

          // Assign joined translation to segments
          for (let i = 0; i < origSegs.length; i++) {
            const joined = segmentTranslationParts[i].join(" ").trim();
            origSegs[i].translation = joined || undefined;
          }
        }

        segmentTranscripts.push(...groupSegments);
      }

      state.transcripts = segmentTranscripts;
    },
    truncateOldTranscripts: (state, action: PayloadAction<number>) => {
      if (action.payload <= 0) return;
      const indexToKeep = action.payload;
      if (indexToKeep >= state.transcripts.length) {
        state.transcripts = [];
        state.finalTranscripts = [];
        state.nonFinalTranscripts = [];
        return;
      }

      const firstSegmentToKeep = state.transcripts[indexToKeep];
      const minTimestampToKeep = firstSegmentToKeep.startTimestamp;

      state.transcripts = state.transcripts.slice(indexToKeep);
      state.finalTranscripts = state.finalTranscripts.filter(
        (t) => t.startTimestamp >= minTimestampToKeep,
      );
      state.nonFinalTranscripts = state.nonFinalTranscripts.filter(
        (t) => t.startTimestamp >= minTimestampToKeep,
      );
    },
  },
});

export const {
  setSessionId,
  setTranscripts,
  clearTranscripts,
  updateTranscripts,
  truncateOldTranscripts,
} = transcriptionSlice.actions;
export default transcriptionSlice.reducer;
