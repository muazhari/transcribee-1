import React, { useState } from "react";
import Button from "../atoms/Button";

interface ExportDropdownProps {
  onExportAudio: () => void;
  onExportSrt: () => void;
  onExportJson: () => void;
  exportingAudio: boolean;
  hasTranscripts: boolean;
}

export default function ExportDropdown({
  onExportAudio,
  onExportSrt,
  onExportJson,
  exportingAudio,
  hasTranscripts,
}: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="secondary"
        size="sm"
        className="!px-4 !py-2 !rounded-xl !bg-neutral-800 hover:!bg-neutral-750 font-bold border border-white/10 text-white hover:text-violet-300 shadow-lg active:scale-95"
        aria-label="Export Menu"
      >
        <span>📥</span>
        <span>Export</span>
        <span className="text-[9px] text-neutral-400">▼</span>
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-neutral-950/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl z-50 py-1.5 overflow-hidden animate-[fadeIn_0.15s_ease-out]">
            <div className="px-3 py-1.5 text-[9px] font-bold text-neutral-500 uppercase tracking-widest border-b border-white/5">
              Download Audio
            </div>

            {/* Audio Option */}
            <button
              onClick={() => {
                onExportAudio();
                setIsOpen(false);
              }}
              disabled={exportingAudio}
              className="w-full text-left px-4 py-2 text-xs text-neutral-300 hover:text-white hover:bg-violet-600/25 transition disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
            >
              <span>🔊</span>
              <span>
                {exportingAudio ? "Compiling..." : "Audio (.wav)"}
              </span>
            </button>

            <div className="px-3 py-1.5 text-[9px] font-bold text-neutral-500 uppercase tracking-widest border-t border-b border-white/5">
              Download Transcript
            </div>

            {/* SRT Option */}
            <button
              onClick={() => {
                onExportSrt();
                setIsOpen(false);
              }}
              disabled={!hasTranscripts}
              className="w-full text-left px-4 py-2 text-xs text-neutral-300 hover:text-white hover:bg-violet-600/25 transition disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
            >
              <span>🎬</span>
              <span>Subtitles (.srt)</span>
            </button>

            {/* JSON Option */}
            <button
              onClick={() => {
                onExportJson();
                setIsOpen(false);
              }}
              disabled={!hasTranscripts}
              className="w-full text-left px-4 py-2 text-xs text-neutral-300 hover:text-white hover:bg-violet-600/25 transition disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
            >
              <span>💻</span>
              <span>Data Block (.json)</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
