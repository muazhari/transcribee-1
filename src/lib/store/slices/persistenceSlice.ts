import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Session } from "../../services/db";

export interface PersistenceState {
  sessions: Session[];
  activeSession: Session | null;
}

const initialState: PersistenceState = {
  sessions: [],
  activeSession: null,
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
      if (action.payload) {
        const idx = state.sessions.findIndex((s) => s.id === action.payload!.id);
        if (idx !== -1) state.sessions[idx] = action.payload;
      }
    },
    addSessionToList: (state, action: PayloadAction<Session>) => {
      state.sessions.unshift(action.payload);
    },
    removeSessionFromList: (state, action: PayloadAction<string>) => {
      state.sessions = state.sessions.filter((s) => s.id !== action.payload);
      if (state.activeSession?.id === action.payload) {
        state.activeSession = null;
      }
    },
  },
});

export const {
  setSessions,
  setActiveSession,
  addSessionToList,
  removeSessionFromList,
} = persistenceSlice.actions;
export default persistenceSlice.reducer;
