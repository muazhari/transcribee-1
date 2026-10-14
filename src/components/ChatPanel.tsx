"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../lib/store/storeHooks";
import { askGeminiStream } from "../lib/services/gemini";
import { db } from "../lib/services/db";
import {
  appendChatMessage,
  clearChatHistory,
  setLoading,
  recalculateTokens,
} from "../lib/store/slices/chatContextSlice";
import { addChatPairToActive } from "../lib/store/slices/persistenceSlice";
import { Transcript } from "../lib/services/db";

import Button from "./atoms/Button";
import Input from "./atoms/Input";
import ChatMessage from "./molecules/ChatMessage";
import TokenMeter from "./atoms/TokenMeter";
import WarningBanner from "./atoms/WarningBanner";
import { generateSrtContent } from "@/lib/utils/exportUtils";

type ChatTurn = { role: "user" | "assistant"; content: string };

// Smart FIFO: drop the oldest transcript segments (whole speaker turns), then the oldest chat
// messages, until the prompt fits under the token limit. Only affects the prompt, never stored data.
function fitToTokenLimit(
  transcripts: Transcript[],
  chatHistory: ChatTurn[],
  question: string,
  tokenLimit: number,
) {
  const tokensFor = (t: number, c: number) => {
    const chat = chatHistory
      .slice(c)
      .map((msg) => msg.content)
      .join("\n");
    const prompt = `You are an AI Assistant answering queries based on the following real-time transcript:\n\n${generateSrtContent(transcripts.slice(t))}\n${chat}\n${question}`;
    return Math.ceil(prompt.length / 4);
  };
  // Smallest index in [0, n] that satisfies fits() (fits is monotonic: dropping more never grows the prompt)
  const firstFit = (n: number, fits: (i: number) => boolean) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (fits(mid)) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };

  const t = firstFit(transcripts.length, (i) => tokensFor(i, 0) < tokenLimit);
  const c =
    tokensFor(t, 0) < tokenLimit
      ? 0
      : firstFit(
          chatHistory.length,
          (i) => tokensFor(transcripts.length, i) < tokenLimit,
        );
  return { transcripts: transcripts.slice(t), chatHistory: chatHistory.slice(c) };
}

export default function ChatPanel() {
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

  const { tokenCount, tokenLimit, tokenLimitExceeded, tokenLimitTruncated } =
    useAppSelector((state) => state.chatContext);

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

  // Recalculate token count and trigger alerts
  useEffect(() => {
    if (activeSession) {
      dispatch(
        recalculateTokens({
          transcriptsText: generateSrtContent(transcripts),
          chatHistoryText: chatHistory.map((msg) => msg.content).join("\n"),
          questionText: question,
          aiModel: config.aiModel,
        }),
      );
    }
  }, [
    transcripts,
    chatHistory,
    question,
    config.aiModel,
    activeSession,
    dispatch,
  ]);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleAsk = async (queryText: string) => {
    if (!queryText.trim()) return;
    if (!activeSession) {
      alert("No active session loaded.");
      return;
    }
    if (!config.googleApiKey) {
      alert("Please configure your Google AI API Key in Settings first.");
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setQuestion("");
    dispatch(appendChatMessage({ role: "user", content: queryText }));
    dispatch(setLoading(true));
    setStreamedResponse("");

    // Compile active transcripts context (oldest turns dropped if over the token limit)
    const fitted = fitToTokenLimit(
      transcripts,
      chatHistory,
      queryText,
      tokenLimit,
    );
    const contextText =
      generateSrtContent(fitted.transcripts) ||
      "No transcription records available yet.";

    let currentResponse = "";
    try {
      const result = await askGeminiStream(
        {
          apiKey: config.googleApiKey,
          model: config.aiModel,
          context: contextText,
          chatHistory: fitted.chatHistory,
          question: queryText,
          signal: controller.signal,
        },
        (chunk) => {
          currentResponse += chunk;
          setStreamedResponse(currentResponse);
        },
        controller.signal,
      );

      const persistChat = async (answer: string) => {
        dispatch(appendChatMessage({ role: "assistant", content: answer }));
        const chat = {
          id: crypto.randomUUID(),
          sessionId: activeSession.id,
          question: queryText,
          answer,
          timestamp: new Date(),
        };
        await db.saveChatPair(chat);
        dispatch(addChatPairToActive(chat));
      };

      await persistChat(result);
    } catch (error: unknown) {
      const isAborted =
        (error instanceof Error &&
          (error.name === "AbortError" || error.message.includes("Aborted"))) ||
        controller.signal.aborted;

      if (isAborted) {
        if (currentResponse.trim()) {
          const chat = {
            id: crypto.randomUUID(),
            sessionId: activeSession.id,
            question: queryText,
            answer: `${currentResponse} *(Chat cancelled)*`,
            timestamp: new Date(),
          };
          dispatch(appendChatMessage({ role: "assistant", content: chat.answer }));
          await db.saveChatPair(chat);
          dispatch(addChatPairToActive(chat));
        } else {
          dispatch(
            appendChatMessage({
              role: "assistant",
              content: "*(Chat cancelled)*",
            }),
          );
        }
      } else {
        console.error("Gemini Chat Error:", error);
        const errMsg = error instanceof Error ? error.message : String(error);
        dispatch(
          appendChatMessage({
            role: "assistant",
            content: `Error: Failed to process query. ${errMsg}`,
          }),
        );
      }
    } finally {
      setStreamedResponse("");
      dispatch(setLoading(false));
      abortControllerRef.current = null;
    }
  };

  const handleClear = () => {
    dispatch(clearChatHistory());
  };

  const suggestionPrompts = [
    "Summarize this transcript",
    "What are the main action items?",
    "Compare what each speaker said",
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
      <div className="px-6 pt-5 pb-4 border-b border-white/10 flex flex-row gap-3">
        {/* Token capacity meter */}
        <TokenMeter tokenCount={tokenCount} tokenLimit={tokenLimit} />

        {chatHistory.length > 0 && (
          <Button onClick={handleClear} variant="clear" size="none">
            Clear
          </Button>
        )}
      </div>

      {/* Warnings & Notices */}
      {tokenLimitTruncated && (
        <WarningBanner type="error">
          <strong>Context Window Full:</strong> Exceeded 100% capacity. The
          oldest speaker turns are left out of the AI context (your saved
          transcript is untouched).
        </WarningBanner>
      )}
      {!tokenLimitTruncated && tokenLimitExceeded && (
        <WarningBanner type="warning">
          <strong>Warning:</strong> Active token volume has passed 85% threshold
          constraints. Truncation is imminent.
        </WarningBanner>
      )}

      {/* History */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-6 flex flex-col gap-4"
      >
        {chatHistory.length === 0 && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-neutral-500 my-auto">
            <span className="text-3xl mb-2">🤖</span>
            <p className="text-sm font-semibold text-neutral-400">
              Ask questions about this transcript
            </p>
            <p className="text-xs text-neutral-500 mt-1 max-w-xs">
              AI will reference the full transcript as context.
            </p>

            {/* Suggestions */}
            <div className="mt-6 flex flex-col gap-2 w-full">
              {suggestionPrompts.map((prompt, i) => (
                <Button
                  key={i}
                  onClick={() => handleAsk(prompt)}
                  disabled={!activeSession}
                  variant="secondary"
                  size="none"
                  className="!text-left !justify-start !font-normal !w-full !p-3 !rounded-lg text-sm bg-neutral-900 border border-white/5 hover:border-violet-500/40 hover:bg-neutral-900/80"
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Message sequence */}
        {chatHistory.map((msg, i) => (
          <ChatMessage key={i} role={msg.role} content={msg.content} />
        ))}

        {/* Streaming text container */}
        {isLoading && streamedResponse && (
          <ChatMessage
            role="assistant"
            content={streamedResponse}
            isStreaming
          />
        )}

        {/* Loading skeleton */}
        {isLoading && !streamedResponse && <ChatMessage isSkeleton />}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10 bg-neutral-950">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isLoading) {
              handleCancel();
            } else {
              handleAsk(question);
            }
          }}
          className="flex items-center gap-2"
        >
          <Input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!activeSession || isLoading}
            variant="dark"
            className="!px-4 !py-3 !text-sm flex-1"
            placeholder={
              isLoading ? "Generating response..." : "Type your question..."
            }
          />
          {isLoading ? (
            <Button
              type="button"
              onClick={handleCancel}
              variant="danger"
              size="none"
              className="!p-3 !rounded-lg shrink-0"
            >
              Cancel
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!activeSession || !question.trim()}
              variant="primary"
              size="none"
              className="!p-3 !rounded-lg shrink-0"
            >
              Send
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
