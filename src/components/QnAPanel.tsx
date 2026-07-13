"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../lib/store/storeHooks";
import { askGeminiStream } from "../lib/services/gemini";
import { db } from "../lib/services/db";
import {
  appendChatMessage,
  clearChatHistory,
  setLoading,
} from "../lib/store/slices/chatContextSlice";
import { addQnAPairToActive } from "../lib/store/slices/persistenceSlice";

export default function QnAPanel() {
  const dispatch = useAppDispatch();

  const activeSession = useAppSelector(
    (state) => state.persistence.activeSession,
  );
  const transcripts = useAppSelector(
    (state) => state.transcription.transcripts,
  );

  const chatHistory = useAppSelector((state) => state.chatContext.chatHistory);
  const isLoading = useAppSelector((state) => state.chatContext.isLoading);
  const config = useAppSelector((state) => state.config);

  const [question, setQuestion] = useState("");
  const [streamedResponse, setStreamedResponse] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat history
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatHistory, streamedResponse, isLoading]);

  const handleAsk = async (queryText: string) => {
    if (!queryText.trim()) return;
    if (!activeSession) {
      alert("No active session loaded.");
      return;
    }
    if (!config.googleApiKey) {
      alert("Please configure your Gemini API Key in Settings first.");
      return;
    }

    setQuestion("");
    dispatch(appendChatMessage({ role: "user", content: queryText }));
    dispatch(setLoading(true));
    setStreamedResponse("");

    // Compile active transcripts context
    const contextText = transcripts
      .map((t) => `Speaker ${t.speakerId}: ${t.text}`)
      .join("\n");

    try {
      let currentResponse = "";
      const result = await askGeminiStream(
        {
          apiKey: config.googleApiKey,
          model: config.aiModel,
          context: contextText || "No transcription records available yet.",
          chatHistory: chatHistory,
          question: queryText,
        },
        (chunk) => {
          currentResponse += chunk;
          setStreamedResponse(currentResponse);
        },
      );

      // Complete message
      dispatch(appendChatMessage({ role: "assistant", content: result }));
      setStreamedResponse("");

      // Save QnA pair to DB
      const qna = {
        id: crypto.randomUUID(),
        sessionId: activeSession.id,
        question: queryText,
        answer: result,
        timestamp: new Date(),
      };
      await db.saveQnAPair(qna);
      dispatch(addQnAPairToActive(qna));
    } catch (error: any) {
      console.error("Gemini QnA Error:", error);
      dispatch(
        appendChatMessage({
          role: "assistant",
          content: `Error: Failed to process query. ${error?.message || ""}`,
        }),
      );
    } finally {
      dispatch(setLoading(false));
    }
  };

  const handleClear = () => {
    dispatch(clearChatHistory());
  };

  const suggestionPrompts = [
    "Summarize this transcriptions",
    "What are the main action items?",
    "Compare what Speaker 1 and Speaker 2 said",
  ];

  if (!activeSession) {
    return (
      <div className="flex-1 h-full flex flex-col bg-neutral-900 text-white justify-center items-center p-8 text-neutral-500">
        <span className="text-4xl mb-3">🤖</span>
        <h3 className="font-bold text-lg text-neutral-400">Ready to chat</h3>
        <p className="text-neutral-500 text-sm max-w-sm mt-1 text-center">
          Select a session from the session list to begin asking questions.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full lg:w-96 h-full bg-neutral-950 lg:border-l border-white/10 flex flex-col text-white">
      {/* Header */}
      <div className="p-6 border-b border-white/10 flex items-center justify-between">
        <h3 className="font-bold text-sm tracking-wide bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent uppercase">
          AI Q&A Assistant
        </h3>
        {chatHistory.length > 0 && (
          <button
            onClick={handleClear}
            className="text-[10px] text-neutral-400 hover:text-white uppercase font-bold tracking-wider hover:bg-neutral-800 px-2 py-1 rounded transition"
          >
            Clear
          </button>
        )}
      </div>

      {/* History */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-6 flex flex-col gap-4"
      >
        {chatHistory.length === 0 && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-neutral-500 my-auto">
            <span className="text-3xl mb-2">🤖</span>
            <p className="text-xs font-semibold text-neutral-400">
              Ask questions about this transcriptions
            </p>
            <p className="text-[10px] text-neutral-500 mt-1 max-w-xs">
              Gemini will reference the full transcriptions as context.
            </p>

            {/* Suggestions */}
            <div className="mt-6 flex flex-col gap-2 w-full">
              {suggestionPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleAsk(prompt)}
                  disabled={!activeSession}
                  className="w-full text-left text-xs bg-neutral-900 border border-white/5 hover:border-violet-500/40 p-3 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-900/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message sequence */}
        {chatHistory.map((msg, i) => {
          const isAssistant = msg.role === "assistant";
          return (
            <div
              key={i}
              className={`flex flex-col gap-1 max-w-[85%] rounded-2xl p-4 text-xs font-medium leading-relaxed ${
                isAssistant
                  ? "bg-neutral-900 text-neutral-200 self-start rounded-tl-none border border-white/5"
                  : "bg-gradient-to-tr from-violet-600 to-indigo-600 text-white self-end rounded-tr-none"
              }`}
            >
              <span className="text-[9px] uppercase tracking-wider font-extrabold opacity-60">
                {isAssistant ? "AI Assistant" : "You"}
              </span>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          );
        })}

        {/* Streaming text container */}
        {isLoading && streamedResponse && (
          <div className="flex flex-col gap-1 max-w-[85%] bg-neutral-900 text-neutral-200 self-start rounded-2xl rounded-tl-none p-4 border border-white/5">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-violet-400 animate-pulse">
              AI is writing...
            </span>
            <p className="text-xs whitespace-pre-wrap">{streamedResponse}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && !streamedResponse && (
          <div className="flex flex-col gap-2 max-w-[85%] bg-neutral-900 text-neutral-200 self-start rounded-2xl rounded-tl-none p-4 border border-white/5 w-full animate-pulse">
            <div className="w-16 h-2 bg-neutral-800 rounded" />
            <div className="w-full h-3 bg-neutral-800 rounded" />
            <div className="w-3/4 h-3 bg-neutral-800 rounded" />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10 bg-neutral-950">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk(question);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!activeSession || isLoading}
            className="flex-1 bg-neutral-900 border border-white/10 rounded-lg px-4 py-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-50"
            placeholder="Type your question..."
          />
          <button
            type="submit"
            disabled={!activeSession || !question.trim() || isLoading}
            className="p-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-xs shadow-md shadow-violet-950/20 active:scale-95 transition-transform"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
