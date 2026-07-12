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

      // Clean up <end> token helper:
      const cleanText = (text: string) => text.replace(/<end>/g, "");

      let currentSegment: Transcript | null = null;

      for (const transcript of transcripts) {
        const isEnd = transcript.text.includes("<end>");
        const cleanedText = cleanText(transcript.text);

        if (transcript.translationStatus === "translation") {
          // It's a translation token. Find the matching segment.
          let matchingSegment: Transcript | null = null;
          const hasTimestamps =
            typeof transcript.startTimestamp === "number" &&
            !isNaN(transcript.startTimestamp) &&
            typeof transcript.endTimestamp === "number" &&
            !isNaN(transcript.endTimestamp);

          if (
            currentSegment &&
            currentSegment.speakerId === transcript.speakerId &&
            (!hasTimestamps ||
              (currentSegment.startTimestamp <= transcript.endTimestamp &&
                currentSegment.endTimestamp >= transcript.startTimestamp))
          ) {
            matchingSegment = currentSegment;
          } else {
            // Find in already completed segmentTranscripts (reverse order to find the latest/best match)
            for (let i = segmentTranscripts.length - 1; i >= 0; i--) {
              const seg = segmentTranscripts[i];
              if (
                seg.speakerId === transcript.speakerId &&
                (!hasTimestamps ||
                  (seg.startTimestamp <= transcript.endTimestamp &&
                    seg.endTimestamp >= transcript.startTimestamp))
              ) {
                matchingSegment = seg;
                break;
              }
            }
          }

          if (matchingSegment) {
            if (!matchingSegment.translation) {
              matchingSegment.translation = cleanedText;
            } else {
              matchingSegment.translation += cleanedText;
            }
          }
        } else {
          // Original transcript logic
          if (!currentSegment) {
            if (cleanedText.trim().length > 0 || !isEnd) {
              currentSegment = {
                ...transcript,
                text: cleanedText,
              };
              if (isEnd) {
                if (currentSegment.text.trim().length > 0) {
                  segmentTranscripts.push(currentSegment);
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
                segmentTranscripts.push(currentSegment);
              }
              if (isEnd) {
                if (cleanedText.trim().length > 0) {
                  segmentTranscripts.push({
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
                segmentTranscripts.push(currentSegment);
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
      }

      if (currentSegment && currentSegment.text.trim().length > 0) {
        segmentTranscripts.push(currentSegment);
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
