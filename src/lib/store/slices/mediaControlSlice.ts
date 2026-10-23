import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface MediaControlState {
  isRecording: boolean;
  micConnected: boolean;
  speakerConnected: boolean;
  streamHealth: "good" | "poor" | "none";
  isReconnecting: boolean;
  keepAliveActive: boolean;
}

const initialState: MediaControlState = {
  isRecording: false,
  micConnected: false,
  speakerConnected: false,
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
  setDeviceStatus,
  setStreamHealth,
  setIsReconnecting,
  setKeepAliveActive,
} = mediaControlSlice.actions;
export default mediaControlSlice.reducer;
