import React, { useState } from "react";

export const SUPPORTED_LANGUAGES = [
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

interface LanguageHintsSelectorProps {
  value: string[];
  onChange: (codes: string[]) => void;
  error?: string;
}

export default function LanguageHintsSelector({
  value = [],
  onChange,
  error,
}: LanguageHintsSelectorProps) {
  const [langQuery, setLangQuery] = useState("");
  const [showLangDropdown, setShowLangDropdown] = useState(false);

  const selectedCodes = value;

  const available = SUPPORTED_LANGUAGES.filter(
    (lang) => !selectedCodes.includes(lang.code),
  );
  
  const filtered = langQuery
    ? available.filter(
        (lang) =>
          lang.name.toLowerCase().includes(langQuery.toLowerCase()) ||
          lang.code.toLowerCase().includes(langQuery.toLowerCase()),
      )
    : available;

  return (
    <div className="flex flex-col gap-2 w-full">
      <label className="text-sm font-medium text-neutral-300">
        Language Hints
      </label>
      <div className="relative w-full">
        <div
          className="w-full bg-neutral-800 border border-white/10 rounded-lg p-2 flex flex-wrap gap-2 items-center cursor-text min-h-[46px] focus-within:border-violet-500 transition-colors pr-10 relative"
          onClick={() => {
            const input = document.getElementById("lang-search-input");
            if (input) input.focus();
          }}
        >
          {selectedCodes.map((code) => {
            const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
            const displayName = lang ? `[${code}] ${lang.name}` : code;
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
                    const newCodes = selectedCodes.filter((c) => c !== code);
                    onChange(newCodes);
                  }}
                  className="text-neutral-400 hover:text-white transition-colors cursor-pointer text-xs"
                >
                  ✕
                </button>
              </span>
            );
          })}

          <input
            id="lang-search-input"
            type="text"
            placeholder={selectedCodes.length === 0 ? "Select languages..." : ""}
            className="flex-1 bg-transparent border-none outline-none text-sm text-white min-w-[80px] p-0.5 focus:ring-0"
            onFocus={() => setShowLangDropdown(true)}
            onChange={(e) => {
              setLangQuery(e.target.value);
              setShowLangDropdown(true);
            }}
            value={langQuery}
          />

          {selectedCodes.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLangQuery("");
                onChange([]);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors cursor-pointer text-sm"
              title="Clear all"
            >
              ✕
            </button>
          )}
        </div>

        {showLangDropdown && filtered.length > 0 && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowLangDropdown(false)}
            />
            <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-neutral-800 border border-white/10 rounded-lg shadow-xl py-1">
              {filtered.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    const newCodes = [...selectedCodes, lang.code];
                    onChange(newCodes);
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
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
