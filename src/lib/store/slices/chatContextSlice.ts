import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContextState {
  chatHistory: ChatMessage[];
  isLoading: boolean;
}

const initialState: ChatContextState = {
  chatHistory: [],
  isLoading: false,
};

export const chatContextSlice = createSlice({
  name: "chatContext",
  initialState,
  reducers: {
    appendChatMessage: (state, action: PayloadAction<ChatMessage>) => {
      state.chatHistory.push(action.payload);
    },
    setChatHistory: (state, action: PayloadAction<ChatMessage[]>) => {
      state.chatHistory = action.payload;
    },
    clearChatHistory: (state) => {
      state.chatHistory = [];
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },
});

export const {
  appendChatMessage,
  setChatHistory,
  clearChatHistory,
  setLoading,
} = chatContextSlice.actions;
export default chatContextSlice.reducer;
