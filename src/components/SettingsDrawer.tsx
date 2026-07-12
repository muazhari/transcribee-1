"use client";

import React, { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAppDispatch, useAppSelector } from "../lib/store/storeHooks";
import { updateConfig } from "../lib/store/slices/configSlice";

const SUPPORTED_LANGUAGES = [
  { code: "af", name: "Afrikaans" },
  { code: "sq", name: "Albanian" },
  { code: "ar", name: "Arabic" },
  { code: "az", name: "Azerbaijani" },
  { code: "eu", name: "Basque" },
  { code: "be", name: "Belarusian" },
  { code: "bn", name: "Bengali" },
  { code: "bs", name: "Bosnian" },
  { code: "bg", name: "Bulgarian" },
  { code: "ca", name: "Catalan" },
  { code: "zh", name: "Chinese" },
  { code: "hr", name: "Croatian" },
  { code: "cs", name: "Czech" },
  { code: "da", name: "Danish" },
  { code: "nl", name: "Dutch" },
  { code: "en", name: "English" },
  { code: "et", name: "Estonian" },
  { code: "fi", name: "Finnish" },
  { code: "fr", name: "French" },
  { code: "gl", name: "Galician" },
  { code: "de", name: "German" },
  { code: "el", name: "Greek" },
  { code: "gu", name: "Gujarati" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "hu", name: "Hungarian" },
  { code: "id", name: "Indonesian" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "kn", name: "Kannada" },
  { code: "kk", name: "Kazakh" },
  { code: "ko", name: "Korean" },
  { code: "lv", name: "Latvian" },
  { code: "lt", name: "Lithuanian" },
  { code: "mk", name: "Macedonian" },
  { code: "ms", name: "Malay" },
  { code: "ml", name: "Malayalam" },
  { code: "mr", name: "Marathi" },
  { code: "no", name: "Norwegian" },
  { code: "fa", name: "Persian" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese" },
  { code: "pa", name: "Punjabi" },
  { code: "ro", name: "Romanian" },
  { code: "ru", name: "Russian" },
  { code: "sr", name: "Serbian" },
  { code: "sk", name: "Slovak" },
  { code: "sl", name: "Slovenian" },
  { code: "es", name: "Spanish" },
  { code: "sw", name: "Swahili" },
  { code: "sv", name: "Swedish" },
  { code: "tl", name: "Tagalog" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "th", name: "Thai" },
  { code: "tr", name: "Turkish" },
  { code: "uk", name: "Ukrainian" },
  { code: "ur", name: "Urdu" },
  { code: "vi", name: "Vietnamese" },
  { code: "cy", name: "Welsh" },
];

const settingsFormSchema = z.object({
  sonioxApiKey: z.string().min(1, "Soniox API Key is required"),
  googleApiKey: z.string().min(1, "Google AI API Key is required"),
  aiModel: z.string(),
  transcriptionModel: z.string(),
  languageHints: z
    .array(z.string())
    .min(1, "At least one language hint is required"),
  enableEndpointDetection: z.boolean(),
  enableLanguageIdentification: z.boolean(),
  enableTranslation: z.boolean(),
  translationTab: z.enum(["one-way", "two-way", "none"]),
  translationTargetLanguage: z.string(),
  translationLanguageA: z.string(),
  translationLanguageB: z.string(),
  audioRouting: z.enum(["mix", "mic-only", "speaker-only"]),
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsDrawer({
  isOpen,
  onClose,
}: SettingsDrawerProps) {
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.config);

  const [showSonioxKey, setShowSonioxKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [langQuery, setLangQuery] = useState("");
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [hasDisplayMedia, setHasDisplayMedia] = useState(true);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
    reset,
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    values: {
      sonioxApiKey: config.sonioxApiKey,
      googleApiKey: config.googleApiKey,
      aiModel: config.aiModel,
      transcriptionModel: config.transcriptionModel,
      languageHints: config.languageHints,
      enableEndpointDetection: config.enableEndpointDetection,
      enableLanguageIdentification: config.enableLanguageIdentification,
      enableTranslation: config.enableTranslation,
      translationTab: config.translationMode,
      translationTargetLanguage: config.translationTargetLanguage,
      translationLanguageA: config.translationLanguageA,
      translationLanguageB: config.translationLanguageB,
      audioRouting: config.audioRouting,
    },
  });

  const onCloseHandler = () => {
    reset();
    onClose();
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasDisplayMedia(
        !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
      );
    }
  }, []);

  const enableTranslation = watch("enableTranslation");
  const translationTab = watch("translationTab");

  const onSubmit = (values: SettingsFormValues) => {
    let resolvedAudioRouting = values.audioRouting;
    if (!hasDisplayMedia && resolvedAudioRouting !== "mic-only") {
      resolvedAudioRouting = "mic-only";
    }

    dispatch(
      updateConfig({
        sonioxApiKey: values.sonioxApiKey,
        googleApiKey: values.googleApiKey,
        aiModel: values.aiModel,
        transcriptionModel: values.transcriptionModel,
        languageHints: values.languageHints,
        enableEndpointDetection: values.enableEndpointDetection,
        enableLanguageIdentification: values.enableLanguageIdentification,
        enableTranslation: values.enableTranslation,
        translationMode: values.translationTab,
        translationTargetLanguage: values.translationTargetLanguage,
        translationLanguageA: values.translationLanguageA,
        translationLanguageB: values.translationLanguageB,
        audioRouting: resolvedAudioRouting,
      }),
    );
    onCloseHandler();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onCloseHandler}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-md h-full bg-neutral-900 border-l border-white/10 text-white flex flex-col shadow-2xl overflow-y-auto">
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            System Configurations
          </h2>
          <button
            onClick={onCloseHandler}
            className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="p-6 flex-1 flex flex-col gap-6"
        >
          {/* Soniox API Key */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-neutral-300">
              Soniox API Key
            </label>
            <div className="relative">
              <input
                type={showSonioxKey ? "text" : "password"}
                {...register("sonioxApiKey")}
                className="w-full bg-neutral-800 border border-white/10 rounded-lg pl-4 pr-12 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="Enter Soniox API Key"
              />
              <button
                type="button"
                onClick={() => setShowSonioxKey(!showSonioxKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white text-xs"
              >
                {showSonioxKey ? "Hide" : "Show"}
              </button>
            </div>
            {errors.sonioxApiKey && (
              <p className="text-xs text-red-400">
                {errors.sonioxApiKey.message}
              </p>
            )}
          </div>

          {/* Google AI API Key */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-neutral-300">
              Google Gemini API Key
            </label>
            <div className="relative">
              <input
                type={showGoogleKey ? "text" : "password"}
                {...register("googleApiKey")}
                className="w-full bg-neutral-800 border border-white/10 rounded-lg pl-4 pr-12 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="Enter Gemini API Key"
              />
              <button
                type="button"
                onClick={() => setShowGoogleKey(!showGoogleKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white text-xs"
              >
                {showGoogleKey ? "Hide" : "Show"}
              </button>
            </div>
            {errors.googleApiKey && (
              <p className="text-xs text-red-400">
                {errors.googleApiKey.message}
              </p>
            )}
          </div>

          {/* Model Selections */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-neutral-300">
                Gemini Model
              </label>
              <div className="relative w-full">
                <select
                  {...register("aiModel")}
                  className="w-full bg-neutral-800 border border-white/10 rounded-lg pl-3 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 appearance-none cursor-pointer transition-colors"
                >
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                  <option value="gemini-3.1-flash-lite">
                    Gemini 3.1 Flash Lite
                  </option>
                  <option value="gemini-3.1-pro-preview">
                    Gemini 3.1 Pro Preview
                  </option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 text-[10px]">
                  ▼
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-neutral-300">
                STT Model
              </label>
              <div className="relative w-full">
                <select
                  {...register("transcriptionModel")}
                  className="w-full bg-neutral-800 border border-white/10 rounded-lg pl-3 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 appearance-none cursor-pointer transition-colors"
                >
                  <option value="stt-rt-v5">stt-rt-v5</option>
                  <option value="stt-rt-v4">stt-rt-v4</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 text-[10px]">
                  ▼
                </div>
              </div>
            </div>
          </div>

          {/* Language Hints */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-neutral-300">
              Language Hints
            </label>
            <Controller
              name="languageHints"
              control={control}
              render={({ field }) => {
                const selectedCodes = field.value || [];

                return (
                  <div className="relative w-full">
                    <div
                      className="w-full bg-neutral-800 border border-white/10 rounded-lg p-2 flex flex-wrap gap-2 items-center cursor-text min-h-[46px] focus-within:border-violet-500 transition-colors pr-10 relative"
                      onClick={() => {
                        const input =
                          document.getElementById("lang-search-input");
                        if (input) input.focus();
                      }}
                    >
                      {selectedCodes.map((code) => {
                        const lang = SUPPORTED_LANGUAGES.find(
                          (l) => l.code === code,
                        );
                        const displayName = lang
                          ? `[${code}] ${lang.name}`
                          : code;
                        return (
                          <span
                            key={code}
                            className="inline-flex items-center gap-1.5 bg-neutral-700/60 hover:bg-neutral-700 text-neutral-200 text-xs px-2.5 py-1 rounded-full transition-colors font-medium border border-white/5"
                          >
                            <span>{displayName}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newCodes = selectedCodes.filter(
                                  (c) => c !== code,
                                );
                                field.onChange(newCodes);
                              }}
                              className="text-neutral-400 hover:text-white transition-colors cursor-pointer text-xs"
                            >
                              ✕
                            </button>
                          </span>
                        );
                      })}

                      {/* Search/input field inside the container */}
                      <input
                        id="lang-search-input"
                        type="text"
                        placeholder={
                          selectedCodes.length === 0
                            ? "Select languages..."
                            : ""
                        }
                        className="flex-1 bg-transparent border-none outline-none text-sm text-white min-w-[80px] p-0.5 focus:ring-0"
                        onFocus={() => {
                          setShowLangDropdown(true);
                        }}
                        onChange={(e) => {
                          setLangQuery(e.target.value);
                          setShowLangDropdown(true);
                        }}
                        value={langQuery}
                      />

                      {/* Clear all button */}
                      {selectedCodes.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLangQuery("");
                            field.onChange([]);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors cursor-pointer text-sm"
                          title="Clear all"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Dropdown overlay */}
                    {(() => {
                      const available = SUPPORTED_LANGUAGES.filter(
                        (lang) => !selectedCodes.includes(lang.code),
                      );
                      const filtered = langQuery
                        ? available.filter(
                            (lang) =>
                              lang.name
                                .toLowerCase()
                                .includes(langQuery.toLowerCase()) ||
                              lang.code
                                .toLowerCase()
                                .includes(langQuery.toLowerCase()),
                          )
                        : available;

                      if (!showLangDropdown || filtered.length === 0)
                        return null;

                      return (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => {
                              setShowLangDropdown(false);
                            }}
                          />
                          <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-neutral-800 border border-white/10 rounded-lg shadow-xl py-1">
                            {filtered.map((lang) => (
                              <button
                                key={lang.code}
                                type="button"
                                onClick={() => {
                                  const newCodes = [
                                    ...selectedCodes,
                                    lang.code,
                                  ];
                                  field.onChange(newCodes);
                                  setLangQuery("");
                                  setShowLangDropdown(false);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700/50 hover:text-white transition-colors flex items-center justify-between"
                              >
                                <span>{lang.name}</span>
                                <span className="text-xs text-neutral-500 font-mono">
                                  [{lang.code}]
                                </span>
                              </button>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                );
              }}
            />
            {errors.languageHints && (
              <p className="text-xs text-red-400">
                {errors.languageHints.message}
              </p>
            )}
          </div>

          {/* Toggle Switches */}
          <div className="flex flex-col gap-4 bg-neutral-800/40 p-4 rounded-xl border border-white/5">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-bold tracking-wider text-neutral-400 uppercase">
                Features
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-300">
                Endpoint Detection
              </span>
              <input
                type="checkbox"
                {...register("enableEndpointDetection")}
                className="w-4 h-4 rounded text-violet-600 bg-neutral-700 border-neutral-600 focus:ring-violet-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-300">
                Language Identification
              </span>
              <input
                type="checkbox"
                {...register("enableLanguageIdentification")}
                className="w-4 h-4 rounded text-violet-600 bg-neutral-700 border-neutral-600 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Redesigned Translation Settings Section */}
          <div className="flex flex-col gap-4 bg-neutral-800/40 p-4 rounded-xl border border-white/5">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-bold tracking-wider text-neutral-400 uppercase">
                Translation
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-300">
                Enable Translation
              </span>
              <input
                type="checkbox"
                {...register("enableTranslation")}
                className="w-4 h-4 rounded text-violet-600 bg-neutral-700 border-neutral-600 focus:ring-violet-500"
              />
            </div>

            {enableTranslation && (
              <div className="flex flex-col gap-4 mt-2">
                <Controller
                  name="translationTab"
                  control={control}
                  render={({ field }) => (
                    <div className="w-full bg-neutral-900 p-0.5 rounded-lg border border-white/5 flex">
                      <button
                        type="button"
                        onClick={() => field.onChange("one-way")}
                        className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-all ${
                          field.value === "one-way"
                            ? "bg-neutral-800 text-white"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        One-way
                      </button>
                      <button
                        type="button"
                        onClick={() => field.onChange("two-way")}
                        className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-all ${
                          field.value === "two-way"
                            ? "bg-neutral-800 text-white"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        Two-way
                      </button>
                    </div>
                  )}
                />
              </div>
            )}

            {enableTranslation && (
              <div className="flex flex-col gap-4 mt-2">
                {translationTab === "one-way" ? (
                  <div className="flex items-center justify-between gap-4 mt-1">
                    <span className="text-sm font-semibold text-neutral-300">
                      Target language
                    </span>
                    <div className="relative flex-grow max-w-[200px]">
                      <Controller
                        name="translationTargetLanguage"
                        control={control}
                        render={({ field }) => (
                          <div className="relative w-full">
                            <select
                              value={field.value}
                              onChange={(e) => field.onChange(e.target.value)}
                              className="w-full bg-neutral-800 border border-white/10 rounded-lg pl-3 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                            >
                              {SUPPORTED_LANGUAGES.map((lang) => (
                                <option key={lang.code} value={lang.code}>
                                  [{lang.code}] {lang.name}
                                </option>
                              ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 text-[10px]">
                              ▼
                            </div>
                          </div>
                        )}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 mt-1">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-semibold text-neutral-300">
                        Language A
                      </span>
                      <div className="relative flex-grow max-w-[200px]">
                        <Controller
                          name="translationLanguageA"
                          control={control}
                          render={({ field }) => (
                            <div className="relative w-full">
                              <select
                                value={field.value}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="w-full bg-neutral-800 border border-white/10 rounded-lg pl-3 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                              >
                                {SUPPORTED_LANGUAGES.map((lang) => (
                                  <option key={lang.code} value={lang.code}>
                                    [{lang.code}] {lang.name}
                                  </option>
                                ))}
                              </select>
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 text-[10px]">
                                ▼
                              </div>
                            </div>
                          )}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-semibold text-neutral-300">
                        Language B
                      </span>
                      <div className="relative flex-grow max-w-[200px]">
                        <Controller
                          name="translationLanguageB"
                          control={control}
                          render={({ field }) => (
                            <div className="relative w-full">
                              <select
                                value={field.value}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="w-full bg-neutral-800 border border-white/10 rounded-lg pl-3 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                              >
                                {SUPPORTED_LANGUAGES.map((lang) => (
                                  <option key={lang.code} value={lang.code}>
                                    [{lang.code}] {lang.name}
                                  </option>
                                ))}
                              </select>
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 text-[10px]">
                                ▼
                              </div>
                            </div>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Audio Capture Routing */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-neutral-300">
              Audio Capture Routing
            </label>
            <div className="relative w-full">
              <select
                {...register("audioRouting")}
                className="w-full bg-neutral-800 border border-white/10 rounded-lg pl-3 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 appearance-none cursor-pointer transition-colors"
              >
                <option value="mic-only">Microphone Only</option>
                <option value="speaker-only" disabled={!hasDisplayMedia}>
                  System Speakers Only
                  {!hasDisplayMedia && " (Not supported on this device)"}
                </option>
                <option value="mix" disabled={!hasDisplayMedia}>
                  Mix Mic + System Speakers
                  {!hasDisplayMedia && " (Not supported on this device)"}
                </option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 text-[10px]">
                ▼
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            type="submit"
            className="mt-auto w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg py-3 font-semibold text-sm shadow-lg shadow-violet-950/30 active:scale-[0.98] transition-transform duration-75"
          >
            Save configurations
          </button>
        </form>
      </div>
    </div>
  );
}
