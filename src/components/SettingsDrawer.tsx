"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAppDispatch, useAppSelector } from "../lib/store/storeHooks";
import { updateConfig } from "../lib/store/slices/configSlice";
import { sonioxStreamClient } from "../lib/services/soniox";
import { audioCaptureManager } from "../lib/services/audioCapture";

import Button from "./atoms/Button";
import Input from "./atoms/Input";
import Select from "./atoms/Select";
import Checkbox from "./atoms/Checkbox";
import LanguageHintsSelector, {
  SUPPORTED_LANGUAGES,
} from "./molecules/LanguageHintsSelector";

const AI_MODEL_OPTIONS = [
  "gemini-4-neon",
  "gemini-4-carbon",
  "gemini-4-hydrogen",
  "gemini-3.5-flash-lite",
];

const AI_THINKING_LEVEL_OPTIONS = ["low", "medium", "high"];

const STT_MODEL_OPTIONS = ["stt-rt-v6", "stt-rt-v5"];

interface ComboInputProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  options: string[];
  placeholder?: string;
  error?: string;
}

function ComboInput({
  label,
  name,
  value,
  onChange,
  onBlur,
  options,
  placeholder,
  error,
}: ComboInputProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className={open ? "relative w-full z-50" : "relative w-full"}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <Input
        name={name}
        label={label}
        value={value}
        error={error}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Tab") setOpen(false);
        }}
        rightIcon={
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen((prev) => !prev)}
            aria-label={`Toggle ${label} options`}
            className="text-neutral-400 hover:text-white text-[0.625rem] cursor-pointer select-none px-1"
          >
            ▼
          </button>
        }
      />
      {open && (
        <div
          role="listbox"
          aria-label={`${label} options`}
          className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto bg-neutral-800 border border-white/10 rounded-lg shadow-xl py-1"
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={value === opt}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors cursor-pointer ${
                value === opt
                  ? "bg-violet-500/20 text-white"
                  : "text-neutral-200 hover:bg-neutral-700/50 hover:text-white"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const settingsFormSchema = z.object({
  sonioxApiKey: z.string().min(1, "Soniox API Key is required"),
  googleApiKey: z.string(),
  aiModel: z.string(),
  aiThinkingLevel: z.string(),
  transcriptionModel: z.string(),
  languageHints: z
    .array(z.string())
    .min(1, "At least one language hint is required"),
  enableEndpointDetection: z.boolean(),
  enableLanguageIdentification: z.boolean(),
  enableTranslation: z.boolean(),
  translationMode: z.enum(["one-way", "two-way"]),
  translationTargetLanguage: z.string(),
  translationLanguageA: z.string(),
  translationLanguageB: z.string(),
  audioRouting: z.enum(["mix", "mic-only", "speaker-only"]),
  enableKeepAwake: z.boolean(),
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
  const activeSession = useAppSelector(
    (state) => state.persistence.activeSession,
  );

  const [showSonioxKey, setShowSonioxKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [hasDisplayMedia, setHasDisplayMedia] = useState(true);

  const formValues = useMemo(
    () => ({
      ...config,
      aiThinkingLevel: config.aiThinkingLevel ?? "low",
    }),
    [config],
  );

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
    reset,
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    values: formValues,
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
  const translationMode = watch("translationMode");

  const onSubmit = (values: SettingsFormValues) => {
    const audioRouting =
      !hasDisplayMedia && values.audioRouting !== "mic-only"
        ? "mic-only"
        : values.audioRouting;

    const updated = { ...values, audioRouting };
    dispatch(updateConfig(updated));
    sonioxStreamClient.updateConfig({
      ...updated,
      apiKey: updated.sonioxApiKey,
      model: updated.transcriptionModel,
    });
    if (
      audioCaptureManager.isRunning &&
      activeSession &&
      audioRouting !== config.audioRouting
    ) {
      audioCaptureManager
        .start(
          activeSession.id,
          audioRouting,
          (pcmData) => sonioxStreamClient.sendAudio(pcmData),
          audioCaptureManager.getRecordedDurationMs(),
        )
        .catch((err) => console.error("Audio rerouting failed:", err));
    }
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

          {/* Model Selections */}
          <Controller
            name="aiModel"
            control={control}
            render={({ field, fieldState }) => (
              <ComboInput
                label="Gemini Model"
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                options={AI_MODEL_OPTIONS}
                placeholder="Select or enter Gemini model"
                error={fieldState.error?.message}
              />
            )}
          />

          <Controller
            name="aiThinkingLevel"
            control={control}
            render={({ field, fieldState }) => (
              <ComboInput
                label="Gemini Thinking Level"
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                options={AI_THINKING_LEVEL_OPTIONS}
                placeholder="Select or enter thinking level"
                error={fieldState.error?.message}
              />
            )}
          />

          <Controller
            name="transcriptionModel"
            control={control}
            render={({ field, fieldState }) => (
              <ComboInput
                label="STT Model"
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                options={STT_MODEL_OPTIONS}
                placeholder="Select or enter STT model"
                error={fieldState.error?.message}
              />
            )}
          />

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

            <Checkbox
              label="Keep Awake & Background Resilience"
              {...register("enableKeepAwake")}
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
                  name="translationMode"
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

                {translationMode === "one-way" ? (
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
