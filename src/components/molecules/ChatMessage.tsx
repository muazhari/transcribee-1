import React from "react";

interface ChatMessageProps {
  role?: "user" | "assistant";
  content?: string;
  isStreaming?: boolean;
  isSkeleton?: boolean;
}

export default function ChatMessage({
  role = "assistant",
  content = "",
  isStreaming = false,
  isSkeleton = false,
}: ChatMessageProps) {
  const isAssistant = role === "assistant";

  if (isSkeleton) {
    return (
      <div className="flex flex-col gap-2 max-w-[85%] bg-neutral-900 text-neutral-200 self-start rounded-2xl rounded-tl-none p-4 border border-white/5 w-full animate-pulse">
        <div className="w-16 h-2 bg-neutral-800 rounded" />
        <div className="w-full h-3 bg-neutral-800 rounded" />
        <div className="w-3/4 h-3 bg-neutral-800 rounded" />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-1 max-w-[85%] rounded-2xl p-4 text-sm font-medium leading-relaxed ${
        isAssistant
          ? "bg-neutral-900 text-neutral-200 self-start rounded-tl-none border border-white/5"
          : "bg-gradient-to-tr from-violet-600 to-indigo-600 text-white self-end rounded-tr-none"
      }`}
    >
      <span
        className={`text-[9px] uppercase tracking-wider font-extrabold ${
          isAssistant && isStreaming ? "text-violet-400 animate-pulse" : "opacity-60"
        }`}
      >
        {isAssistant
          ? isStreaming
            ? "AI is writing..."
            : "AI Assistant"
          : "You"}
      </span>
      <p className="whitespace-pre-wrap">{content}</p>
    </div>
  );
}
