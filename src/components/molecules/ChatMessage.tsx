import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
      <div className="markdown-content text-sm leading-relaxed space-y-2 break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside mb-2 space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside mb-2 space-y-1">
                {children}
              </ol>
            ),
            li: ({ children }) => <li className="ml-1">{children}</li>,
            code: ({ className, children }) => {
              const isBlock = Boolean(
                className && className.includes("language-"),
              );
              if (isBlock) {
                return (
                  <code
                    className={`${className} block bg-black/40 p-2.5 rounded-lg text-xs font-mono overflow-x-auto my-2 border border-white/10`}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code className="bg-black/30 px-1.5 py-0.5 rounded text-xs font-mono">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="my-2 overflow-x-auto">{children}</pre>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80"
              >
                {children}
              </a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
