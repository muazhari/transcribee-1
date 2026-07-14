"use client";

import React, { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAppDispatch, useAppSelector } from "../lib/store/storeHooks";
import { updateConfig } from "../lib/store/slices/configSlice";

import Button from "./atoms/Button";
import Input from "./atoms/Input";
import Select from "./atoms/Select";
import Checkbox from "./atoms/Checkbox";
import LanguageHintsSelector, {
  SUPPORTED_LANGUAGES,
} from "./molecules/LanguageHintsSelector";

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
  translationTab: z.enum(["one-way", "two-way"]),
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

  const langSelectOptions = SUPPORTED_LANGUAGES.map((lang) => ({
    value: lang.code,
    label: `[${lang.code}] ${lang.name}`,
  }));

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
          <Button
            onClick={onCloseHandler}
            variant="ghost"
            size="none"
            className="!p-1 !rounded-md"
            aria-label="Close settings"
          >
            ✕
          </Button>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="p-6 flex-1 flex flex-col gap-6"
        >
          {/* Soniox API Key */}
          <Input
            type={showSonioxKey ? "text" : "password"}
            label="Soniox API Key"
            error={errors.sonioxApiKey?.message}
            {...register("sonioxApiKey")}
            placeholder="Enter Soniox API Key"
            rightIcon={
              <button
                type="button"
                onClick={() => setShowSonioxKey(!showSonioxKey)}
                className="text-neutral-400 hover:text-white text-xs cursor-pointer select-none"
              >
                {showSonioxKey ? "Hide" : "Show"}
              </button>
            }
          />

          {/* Google AI API Key */}
          <Input
            type={showGoogleKey ? "text" : "password"}
            label="Google AI API Key"
            error={errors.googleApiKey?.message}
            {...register("googleApiKey")}
            placeholder="Enter Google AI API Key"
            rightIcon={
              <button
                type="button"
                onClick={() => setShowGoogleKey(!showGoogleKey)}
                className="text-neutral-400 hover:text-white text-xs cursor-pointer select-none"
              >
                {showGoogleKey ? "Hide" : "Show"}
              </button>
            }
          />

          {/* Model Selections */}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Gemini Model"
              error={errors.aiModel?.message}
              options={[
                { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
                {
                  value: "gemini-3.1-flash-lite",
                  label: "Gemini 3.1 Flash Lite",
                },
                {
                  value: "gemini-3.1-pro-preview",
                  label: "Gemini 3.1 Pro Preview",
                },
              ]}
              {...register("aiModel")}
            />

            <Select
              label="STT Model"
              error={errors.transcriptionModel?.message}
              options={[
                { value: "stt-rt-v5", label: "stt-rt-v5" },
                { value: "stt-rt-v4", label: "stt-rt-v4" },
              ]}
              {...register("transcriptionModel")}
            />
          </div>

          {/* Language Hints */}
          <Controller
            name="languageHints"
            control={control}
            render={({ field, fieldState }) => (
              <LanguageHintsSelector
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />

          {/* Toggle Switches */}
          <div className="flex flex-col gap-4 bg-neutral-800/40 p-4 rounded-xl border border-white/5">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-bold tracking-wider text-neutral-400 uppercase">
                Features
              </span>
            </div>

            <Checkbox
              label="Endpoint Detection"
              {...register("enableEndpointDetection")}
            />

            <Checkbox
              label="Language Identification"
              {...register("enableLanguageIdentification")}
            />
          </div>

          {/* Redesigned Translation Settings Section */}
          <div className="flex flex-col gap-4 bg-neutral-800/40 p-4 rounded-xl border border-white/5">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-bold tracking-wider text-neutral-400 uppercase">
                Translation
              </span>
            </div>

            <Checkbox
              label="Enable Translation"
              {...register("enableTranslation")}
            />

            {enableTranslation && (
              <div className="flex flex-col gap-4 mt-2">
                <Controller
                  name="translationTab"
                  control={control}
                  render={({ field }) => (
                    <div className="w-full bg-neutral-900 p-0.5 rounded-lg border border-white/5 flex select-none">
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
                  <Select
                    label="Target language"
                    options={langSelectOptions}
                    {...register("translationTargetLanguage")}
                  />
                ) : (
                  <div className="flex flex-col gap-3 mt-1">
                    <Select
                      label="Language A"
                      options={langSelectOptions}
                      {...register("translationLanguageA")}
                    />
                    <Select
                      label="Language B"
                      options={langSelectOptions}
                      {...register("translationLanguageB")}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Audio Capture Routing */}
          <Select
            label="Audio Capture Routing"
            error={errors.audioRouting?.message}
            options={[
              { value: "mic-only", label: "Microphone Only" },
              {
                value: "speaker-only",
                label: `System Speakers Only ${!hasDisplayMedia ? " (Not supported on this device)" : ""}`,
                disabled: !hasDisplayMedia,
              },
              {
                value: "mix",
                label: `Mix Mic + System Speakers ${!hasDisplayMedia ? " (Not supported on this device)" : ""}`,
                disabled: !hasDisplayMedia,
              },
            ]}
            {...register("audioRouting")}
          />

          {/* Save Button */}
          <Button
            type="submit"
            variant="primary"
            size="none"
            className="mt-auto w-full !py-3 !rounded-lg"
          >
            Save configurations
          </Button>
        </form>
      </div>
    </div>
  );
}
