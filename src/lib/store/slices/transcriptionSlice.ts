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

      if (newTranscripts.length === 0) {
        return;
      }

      const newNonFinalTranscripts: Transcript[] = [];
      const newFinalTranscripts: Transcript[] = [];

      for (const transcript of newTranscripts) {
        if (transcript.isFinal) {
          newFinalTranscripts.push(transcript);
        } else {
          newNonFinalTranscripts.push(transcript);
        }
      }

      state.finalTranscripts.push(...newFinalTranscripts);
      state.nonFinalTranscripts = newNonFinalTranscripts;

      const transcripts: Transcript[] = [
        ...state.finalTranscripts,
        ...state.nonFinalTranscripts,
      ];

      // 1. Group transcripts (both final and non-final) by their offsetTimestamp
      const groups: Record<number, Transcript[]> = {};
      for (const t of transcripts) {
        const offset = t.offsetTimestamp || 0;
        if (!groups[offset]) {
          groups[offset] = [];
        }
        groups[offset].push(t);
      }

      const sortedOffsets = Object.keys(groups)
        .map(Number)
        .sort((a, b) => a - b);

      const segmentTranscripts: Transcript[] = [];

      // Clean up <end> token helper:
      const cleanText = (text: string) => text.replace(/<end>/g, "");

      for (const offset of sortedOffsets) {
        const groupTranscripts = groups[offset];

        // 2. Separate original and translation tokens in this group
        const originalTokens = groupTranscripts.filter(
          (t) => t.translationStatus !== "translation",
        );
        const translationTokens = groupTranscripts.filter(
          (t) => t.translationStatus === "translation",
        );

        const groupSegments: Transcript[] = [];

        // 3. Group the original transcripts into segments by speaker and language
        let currentSegment: Transcript | null = null;

        for (const transcript of originalTokens) {
          const isEnd = transcript.text.includes("<end>");
          const cleanedText = cleanText(transcript.text);

          if (!currentSegment) {
            if (cleanedText.trim().length > 0 || !isEnd) {
              currentSegment = {
                ...transcript,
                text: cleanedText,
              };
              if (isEnd) {
                if (currentSegment.text.trim().length > 0) {
                  groupSegments.push(currentSegment);
                }
                currentSegment = null;
              }
            }
          } else {
            const isNewSpeaker =
              transcript.speakerId !== currentSegment.speakerId;
            const isNewLanguage =
              transcript.language !== currentSegment.language;

            if (isNewSpeaker || isNewLanguage) {
              if (currentSegment.text.trim().length > 0) {
                groupSegments.push(currentSegment);
              }
              if (isEnd) {
                if (cleanedText.trim().length > 0) {
                  groupSegments.push({
                    ...transcript,
                    text: cleanedText,
                  });
                }
                currentSegment = null;
              } else {
                if (cleanedText.trim().length > 0) {
                  currentSegment = {
                    ...transcript,
                    text: cleanedText,
                  };
                } else {
                  currentSegment = null;
                }
              }
            } else if (isEnd) {
              if (cleanedText.trim().length > 0) {
                currentSegment.text += cleanedText;
              }
              currentSegment.endTimestamp = transcript.endTimestamp;
              currentSegment.duration =
                currentSegment.endTimestamp - currentSegment.startTimestamp;
              currentSegment.isFinal = transcript.isFinal;
              if (currentSegment.text.trim().length > 0) {
                groupSegments.push(currentSegment);
              }
              currentSegment = null;
            } else {
              if (cleanedText.trim().length > 0) {
                currentSegment.text += cleanedText;
              }
              currentSegment.endTimestamp = transcript.endTimestamp;
              currentSegment.duration =
                currentSegment.endTimestamp - currentSegment.startTimestamp;
              currentSegment.isFinal = transcript.isFinal;
            }
          }
        }

        if (currentSegment && currentSegment.text.trim().length > 0) {
          groupSegments.push(currentSegment);
        }

        // 4. Group original segments by speaker
        const speakerOrigSegs: Record<string, Transcript[]> = {};
        for (const seg of groupSegments) {
          if (!speakerOrigSegs[seg.speakerId]) {
            speakerOrigSegs[seg.speakerId] = [];
          }
          speakerOrigSegs[seg.speakerId].push(seg);
        }

        // 5. Group translation tokens by speaker
        const speakerTransTokens: Record<string, Transcript[]> = {};
        for (const trans of translationTokens) {
          if (!speakerTransTokens[trans.speakerId]) {
            speakerTransTokens[trans.speakerId] = [];
          }
          speakerTransTokens[trans.speakerId].push(trans);
        }

        // 6. Map translation to segments speaker-by-speaker
        for (const speakerId in speakerOrigSegs) {
          const origSegs = speakerOrigSegs[speakerId];
          const transTokens = speakerTransTokens[speakerId] || [];

          // Join translation tokens into full text
          const fullTranslationText = transTokens
            .map((t) => cleanText(t.text))
            .join("")
            .trim();

          if (fullTranslationText.length > 0) {
            const translationSentences = splitSentences(fullTranslationText);

            for (let i = 0; i < origSegs.length; i++) {
              if (i === origSegs.length - 1) {
                // Last segment gets all remaining translation sentences joined
                origSegs[i].translation = translationSentences
                  .slice(i)
                  .join(" ");
              } else if (i < translationSentences.length) {
                origSegs[i].translation = translationSentences[i];
              }
            }
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
