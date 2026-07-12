import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { persistStore, persistReducer } from 'redux-persist';
import storage from './storage';
import configReducer from "./slices/configSlice";
import mediaControlReducer from "./slices/mediaControlSlice";
import transcriptionReducer from "./slices/transcriptionSlice";
import chatContextReducer from "./slices/chatContextSlice";
import persistenceReducer from "./slices/persistenceSlice";


const persistConfig = {
  key: 'root',
  storage,
};

const rootReducer = combineReducers({
  config: configReducer,
  mediaControl: mediaControlReducer,
  transcription: transcriptionReducer,
  chatContext: chatContextReducer,
  persistence: persistenceReducer,
});


const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
  devTools: process.env.NEXT_PUBLIC_NODE_ENV === 'development',
});

export const persistor = persistStore(store);


export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
