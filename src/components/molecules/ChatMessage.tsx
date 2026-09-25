"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Button } from "@heroui/react";

interface ChatMessageProps {
  role?: "user" | "assistant";
  content?: string;
  isStreaming?: boolean;
  isSkeleton?: boolean;
}

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

const markdownComponents = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="whitespace-pre-wrap" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:opacity-80"
      {...props}
    />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-inside space-y-1" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal list-inside space-y-1" {...props} />
  ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="bg-black/40 p-2.5 rounded-lg text-xs font-mono overflow-x-auto border border-white/10 my-2"
      {...props}
    />
  ),
  code: ({ className, ...props }: React.HTMLAttributes<HTMLElement>) =>
    className ? (
      <code className={className} {...props} />
    ) : (
      <code
        className="bg-black/30 px-1.5 py-0.5 rounded text-xs font-mono"
        {...props}
      />
    ),
};

export default function ChatMessage({
  role = "assistant",
  content = "",
  isStreaming = false,
  isSkeleton = false,
}: ChatMessageProps) {
  const isAssistant = role === "assistant";
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    if (!content) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = content;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy message:", err);
    }
  };

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
      className={`group relative flex flex-col gap-1 max-w-[85%] rounded-2xl p-4 text-sm font-medium leading-relaxed ${
        isAssistant
          ? "bg-neutral-900 text-neutral-200 self-start rounded-tl-none border border-white/5"
          : "bg-gradient-to-tr from-violet-600 to-indigo-600 text-white self-end rounded-tr-none"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-xs uppercase tracking-wider font-extrabold ${
            isAssistant && isStreaming
              ? "text-violet-400 animate-pulse"
              : "opacity-60"
          }`}
        >
          {isAssistant
            ? isStreaming
              ? "AI is writing..."
              : "AI Assistant"
            : "You"}
        </span>
        {content && !isStreaming && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 min-w-0 px-2 text-xs opacity-70 hover:opacity-100 cursor-pointer"
            onPress={handleCopy}
          >
            {copied ? "✔️" : "📋"}
          </Button>
        )}
      </div>
      <div className="markdown-content text-sm leading-relaxed space-y-2 break-words [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1">
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={markdownComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
