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
      const segmentTranscripts: Transcript[] = [];

      // 1. Separate original and translation transcripts
      const originalTranscripts = transcripts.filter(
        (t) => t.translationStatus === "original",
      );
      const translationTranscripts = transcripts.filter(
        (t) => t.translationStatus === "translation",
      );

      // 2. Group the original transcripts into segments by speaker and language
      let currentSegment: Transcript | null = null;

      for (const transcript of originalTranscripts) {
        const isEnd = transcript.text.includes("<end>");
        const cleanText = transcript.text.replace("<end>", "");

        if (!currentSegment) {
          if (cleanText.trim().length > 0 || !isEnd) {
            currentSegment = {
              ...transcript,
              text: cleanText,
            };
          }
        } else {
          const isNewSpeaker =
            transcript.speakerId !== currentSegment.speakerId;
          const isNewLanguage = transcript.language !== currentSegment.language;

          if (isNewSpeaker || isNewLanguage || isEnd) {
            if (cleanText.length > 0) {
              currentSegment.text += cleanText;
              currentSegment.endTimestamp = transcript.endTimestamp;
              currentSegment.duration =
                currentSegment.endTimestamp - currentSegment.startTimestamp;
              currentSegment.isFinal = transcript.isFinal;
            }
            segmentTranscripts.push(currentSegment);

            if (isEnd) {
              currentSegment = null;
            } else {
              currentSegment = {
                ...transcript,
                text: cleanText,
              };
            }
          } else {
            currentSegment.text += cleanText;
            currentSegment.endTimestamp = transcript.endTimestamp;
            currentSegment.duration =
              currentSegment.endTimestamp - currentSegment.startTimestamp;
            currentSegment.isFinal = transcript.isFinal;
          }
        }
      }

      if (currentSegment) {
        segmentTranscripts.push(currentSegment);
      }

      // 3. Attach translation transcripts to the matching original segments
      for (const translation of translationTranscripts) {
        const cleanTranslationText = translation.text.replace("<end>", "");
        const matchingSegment = segmentTranscripts.find(
          (seg) =>
            seg.speakerId === translation.speakerId &&
            seg.startTimestamp <= translation.endTimestamp &&
            seg.endTimestamp >= translation.startTimestamp,
        );
        if (matchingSegment) {
          if (!matchingSegment.translation) {
            matchingSegment.translation = cleanTranslationText;
          } else {
            matchingSegment.translation += " " + cleanTranslationText.trim();
          }
        }
      }

      state.transcripts = segmentTranscripts;
    },
    truncateOldTranscripts: (state, action: PayloadAction<number>) => {
      // Truncate from the start (FIFO) until the count matches the requested index
      state.transcripts = state.transcripts.slice(action.payload);
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
