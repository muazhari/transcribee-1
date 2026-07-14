import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Session, ChatPair } from "../../services/db";

export interface PersistenceState {
  sessions: Session[];
  activeSession: Session | null;
  chatPairs: ChatPair[];
}

const initialState: PersistenceState = {
  sessions: [],
  activeSession: null,
  chatPairs: [],
};

export const persistenceSlice = createSlice({
  name: "persistence",
  initialState,
  reducers: {
    setSessions: (state, action: PayloadAction<Session[]>) => {
      state.sessions = action.payload;
    },
    setActiveSession: (state, action: PayloadAction<Session | null>) => {
      state.activeSession = action.payload;
      if (action.payload === null) {
        state.chatPairs = [];
      }
    },
    setChatPairs: (state, action: PayloadAction<ChatPair[]>) => {
      state.chatPairs = action.payload;
    },
    addSessionToList: (state, action: PayloadAction<Session>) => {
      state.sessions.unshift(action.payload);
    },
    removeSessionFromList: (state, action: PayloadAction<string>) => {
      state.sessions = state.sessions.filter((s) => s.id !== action.payload);
      if (state.activeSession?.id === action.payload) {
        state.activeSession = null;
        state.chatPairs = [];
      }
    },
    addChatPairToActive: (state, action: PayloadAction<ChatPair>) => {
      state.chatPairs.push(action.payload);
    },
  },
});

export const {
  setSessions,
  setActiveSession,
  setChatPairs,
  addSessionToList,
  removeSessionFromList,
  addChatPairToActive,
} = persistenceSlice.actions;
export default persistenceSlice.reducer;
