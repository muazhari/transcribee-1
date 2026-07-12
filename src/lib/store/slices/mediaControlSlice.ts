import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface MediaControlState {
  isRecording: boolean;
  isPaused: boolean;
  micConnected: boolean;
  speakerConnected: boolean;
  streamHealth: "good" | "poor" | "none";
}

const initialState: MediaControlState = {
  isRecording: false,
  isPaused: false,
  micConnected: false,
  speakerConnected: false,
  streamHealth: "none",
};

export const mediaControlSlice = createSlice({
  name: "mediaControl",
  initialState,
  reducers: {
    startRecordingState: (state) => {
      state.isRecording = true;
      state.isPaused = false;
      state.streamHealth = "good";
    },
    stopRecordingState: (state) => {
      state.isRecording = false;
      state.isPaused = false;
      state.streamHealth = "none";
    },
    togglePauseState: (state) => {
      state.isPaused = !state.isPaused;
    },
    setDeviceStatus: (
      state,
      action: PayloadAction<{ micConnected?: boolean; speakerConnected?: boolean }>
    ) => {
      if (action.payload.micConnected !== undefined) {
        state.micConnected = action.payload.micConnected;
      }
      if (action.payload.speakerConnected !== undefined) {
        state.speakerConnected = action.payload.speakerConnected;
      }
    },
    setStreamHealth: (state, action: PayloadAction<"good" | "poor" | "none">) => {
      state.streamHealth = action.payload;
    },
  },
});

export const {
  startRecordingState,
  stopRecordingState,
  togglePauseState,
  setDeviceStatus,
  setStreamHealth,
} = mediaControlSlice.actions;
export default mediaControlSlice.reducer;
