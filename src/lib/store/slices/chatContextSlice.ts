import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContextState {
  chatHistory: ChatMessage[];
  tokenCount: number;
  tokenLimit: number; // e.g. 15,000 tokens
  tokenLimitExceeded: boolean; // >= 85%
  tokenLimitTruncated: boolean; // >= 100%
  isLoading: boolean;
}

const initialState: ChatContextState = {
  chatHistory: [],
  tokenCount: 0,
  tokenLimit: 1000000,
  tokenLimitExceeded: false,
  tokenLimitTruncated: false,
  isLoading: false,
};

export const chatContextSlice = createSlice({
  name: "chatContext",
  initialState,
  reducers: {
    appendChatMessage: (state, action: PayloadAction<ChatMessage>) => {
      state.chatHistory.push(action.payload);
    },
    clearChatHistory: (state) => {
      state.chatHistory = [];
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setTokenLimit: (state, action: PayloadAction<number>) => {
      state.tokenLimit = action.payload;
    },
    recalculateTokens: (
      state,
      action: PayloadAction<{ transcriptsText: string }>
    ) => {
      const { transcriptsText } = action.payload;
      // Simple client-side token count approximation: 1 token = 4 characters
      const tokens = Math.ceil(transcriptsText.length / 4);
      state.tokenCount = tokens;

      const pct = (tokens / state.tokenLimit) * 100;
      state.tokenLimitExceeded = pct >= 85;
      state.tokenLimitTruncated = pct >= 100;
    },
    setTokenLimitTruncatedFlag: (state, action: PayloadAction<boolean>) => {
      state.tokenLimitTruncated = action.payload;
    },
  },
});

export const {
  appendChatMessage,
  clearChatHistory,
  setLoading,
  setTokenLimit,
  recalculateTokens,
  setTokenLimitTruncatedFlag,
} = chatContextSlice.actions;
export default chatContextSlice.reducer;
