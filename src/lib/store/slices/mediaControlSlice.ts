import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface MediaControlState {
  isRecording: boolean;
  streamHealth: "good" | "poor" | "none";
  isReconnecting: boolean;
  keepAliveActive: boolean;
}

const initialState: MediaControlState = {
  isRecording: false,
  streamHealth: "none",
  isReconnecting: false,
  keepAliveActive: false,
};

export const mediaControlSlice = createSlice({
  name: "mediaControl",
  initialState,
  reducers: {
    startRecordingState: (state) => {
      state.isRecording = true;
      state.streamHealth = "good";
      state.isReconnecting = false;
    },
    stopRecordingState: (state) => {
      state.isRecording = false;
      state.streamHealth = "none";
      state.isReconnecting = false;
      state.keepAliveActive = false;
    },
    setStreamHealth: (state, action: PayloadAction<"good" | "poor" | "none">) => {
      state.streamHealth = action.payload;
    },
    setIsReconnecting: (state, action: PayloadAction<boolean>) => {
      state.isReconnecting = action.payload;
      if (action.payload) {
        state.streamHealth = "poor";
      } else if (state.isRecording) {
        state.streamHealth = "good";
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
  setIsReconnecting,
  setKeepAliveActive,
} = mediaControlSlice.actions;
export default mediaControlSlice.reducer;
