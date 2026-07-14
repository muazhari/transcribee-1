import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ConfigState {
  sonioxApiKey: string;
  googleApiKey: string;
  aiModel: string;
  transcriptionModel: string;
  languageHints: string[];
  enableEndpointDetection: boolean;
  enableLanguageIdentification: boolean;
  enableTranslation: boolean;
  translationMode: "one-way" | "two-way";
  audioRouting: "mix" | "mic-only" | "speaker-only";
  translationTargetLanguage: string;
  translationLanguageA: string;
  translationLanguageB: string;
}

const initialState: ConfigState = {
  sonioxApiKey: "",
  googleApiKey: "",
  aiModel: "gemini-3.5-flash",
  transcriptionModel: "stt-rt-v5",
  languageHints: ["en", "id"],
  enableEndpointDetection: true,
  enableLanguageIdentification: true,
  enableTranslation: false,
  translationMode: "two-way",
  audioRouting: "mic-only",
  translationTargetLanguage: "id",
  translationLanguageA: "en",
  translationLanguageB: "id",
};

export const configSlice = createSlice({
  name: "config",
  initialState,
  reducers: {
    updateConfig: (state, action: PayloadAction<Partial<ConfigState>>) => {
      return { ...state, ...action.payload };
    },
    resetConfig: () => initialState,
  },
});

export const { updateConfig, resetConfig } = configSlice.actions;
export default configSlice.reducer;
