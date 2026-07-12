import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Session, QnAPair } from "../../services/db";

export interface PersistenceState {
  sessions: Session[];
  activeSession: Session | null;
  qnaPairs: QnAPair[];
}

const initialState: PersistenceState = {
  sessions: [],
  activeSession: null,
  qnaPairs: [],
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
        state.qnaPairs = [];
      }
    },
    setQnAPairs: (state, action: PayloadAction<QnAPair[]>) => {
      state.qnaPairs = action.payload;
    },
    addSessionToList: (state, action: PayloadAction<Session>) => {
      state.sessions.unshift(action.payload);
    },
    removeSessionFromList: (state, action: PayloadAction<string>) => {
      state.sessions = state.sessions.filter((s) => s.id !== action.payload);
      if (state.activeSession?.id === action.payload) {
        state.activeSession = null;
        state.qnaPairs = [];
      }
    },
    addQnAPairToActive: (state, action: PayloadAction<QnAPair>) => {
      state.qnaPairs.push(action.payload);
    },
  },
});

export const {
  setSessions,
  setActiveSession,
  setQnAPairs,
  addSessionToList,
  removeSessionFromList,
  addQnAPairToActive,
} = persistenceSlice.actions;
export default persistenceSlice.reducer;
