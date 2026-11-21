import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface MediaControlState {
  isRecording: boolean;
  streamHealth: "good" | "poor" | "none";
  isReconnecting: boolean;
  keepAliveActive: boolean;
  streamError: string | null;
}

const initialState: MediaControlState = {
  isRecording: false,
  streamHealth: "none",
  isReconnecting: false,
  keepAliveActive: false,
  streamError: null,
};

export const mediaControlSlice = createSlice({
  name: "mediaControl",
  initialState,
  reducers: {
    startRecordingState: (state) => {
      state.isRecording = true;
      state.streamHealth = "good";
      state.isReconnecting = false;
      state.streamError = null;
    },
    stopRecordingState: (state, action: PayloadAction<string | undefined>) => {
      state.isRecording = false;
      state.streamHealth = "none";
      state.isReconnecting = false;
      state.keepAliveActive = false;
      state.streamError = action.payload ?? null;
    },
    setStreamHealth: (state, action: PayloadAction<"good" | "poor" | "none">) => {
      state.streamHealth = action.payload;
    },
    setStreamError: (state, action: PayloadAction<string | null>) => {
      state.streamError = action.payload;
      if (action.payload) {
        state.streamHealth = "poor";
      }
    },
    setIsReconnecting: (state, action: PayloadAction<boolean>) => {
      state.isReconnecting = action.payload;
      if (action.payload) {
        state.streamHealth = "poor";
      } else if (state.isRecording) {
        state.streamHealth = "good";
        state.streamError = null;
      }
    },
    setKeepAliveActive: (state, action: PayloadAction<boolean>) => {
      state.keepAliveActive = action.payload;
    },
  },
});

export const {
  startRecordingState,
  stopRecordingState,
  setStreamHealth,
  setStreamError,
  setIsReconnecting,
  setKeepAliveActive,
} = mediaControlSlice.actions;
export default mediaControlSlice.reducer;
