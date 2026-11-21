import { combineReducers, configureStore } from "@reduxjs/toolkit";
import configReducer, {
  ConfigState,
  initialConfigState,
} from "./slices/configSlice";
import mediaControlReducer from "./slices/mediaControlSlice";
import transcriptionReducer from "./slices/transcriptionSlice";
import chatContextReducer from "./slices/chatContextSlice";
import persistenceReducer from "./slices/persistenceSlice";

export const CONFIG_STORAGE_KEY = "transcribee:config";

function loadSavedConfig(): ConfigState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      return { ...initialConfigState, ...JSON.parse(raw) };
    }
    // Migrate legacy redux-persist config so existing users keep their saved keys
    const legacy = window.localStorage.getItem("persist:root");
    if (legacy) {
      const root = JSON.parse(legacy) as { config?: string };
      if (root.config) {
        return { ...initialConfigState, ...JSON.parse(root.config) };
      }
    }
  } catch (err) {
    console.warn("Failed to read saved config from localStorage:", err);
  }
  return undefined;
}

const rootReducer = combineReducers({
  config: configReducer,
  mediaControl: mediaControlReducer,
  transcription: transcriptionReducer,
  chatContext: chatContextReducer,
  persistence: persistenceReducer,
});

const savedConfig = loadSavedConfig();

export const store = configureStore({
  reducer: rootReducer,
  ...(savedConfig ? { preloadedState: { config: savedConfig } } : {}),
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
  devTools: process.env.NEXT_PUBLIC_NODE_ENV === "development",
});

if (typeof window !== "undefined") {
  let prevConfig = store.getState().config;
  store.subscribe(() => {
    const nextConfig = store.getState().config;
    if (nextConfig !== prevConfig) {
      prevConfig = nextConfig;
      try {
        window.localStorage.setItem(
          CONFIG_STORAGE_KEY,
          JSON.stringify(nextConfig),
        );
      } catch (err) {
        console.warn("Failed to persist config to localStorage:", err);
      }
    }
  });
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
