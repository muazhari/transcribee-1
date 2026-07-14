"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../lib/store/storeHooks";
import { askGeminiStream } from "../lib/services/gemini";
import { db, Transcript } from "../lib/services/db";
import {
  appendChatMessage,
  clearChatHistory,
  setLoading,
  recalculateTokens,
  truncateChatHistory,
  setTokenLimitTruncatedFlag,
} from "../lib/store/slices/chatContextSlice";
import { truncateOldTranscripts } from "../lib/store/slices/transcriptionSlice";
import { addChatPairToActive } from "../lib/store/slices/persistenceSlice";

import Button from "./atoms/Button";
import Input from "./atoms/Input";
import ChatMessage from "./molecules/ChatMessage";
import TokenMeter from "./atoms/TokenMeter";
import WarningBanner from "./atoms/WarningBanner";
import { generateSrtContent } from "@/lib/utils/exportUtils";

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

  // Handle Smart FIFO Context Window Truncation (100% capacity)
  useEffect(() => {
    if (tokenLimitTruncated && activeSession) {
      let sliceTransIndex = 0;
      let sliceChatIndex = 0;

      const calculateTokensForSlice = (
        transSlice: number,
        chatSlice: number,
      ) => {
        const slicedTransText = generateSrtContent(
          transcripts.slice(transSlice),
        );
        const slicedChat = chatHistory.slice(chatSlice);

        const systemPrompt = `You are an AI Assistant answering queries based on the following real-time transcript summary:\n\n${slicedTransText}`;
        const chatHistoryText = slicedChat.map((msg) => msg.content).join("\n");
        const totalInputText = `${systemPrompt}\n${chatHistoryText}\n${question}`;
        return Math.ceil(totalInputText.length / 4);
      };

      let currentTokens = calculateTokensForSlice(0, 0);

      // 1. Truncate transcripts first (FIFO)
      while (
        currentTokens >= tokenLimit &&
        sliceTransIndex < transcripts.length
      ) {
        sliceTransIndex++;
        currentTokens = calculateTokensForSlice(sliceTransIndex, 0);
      }

      // 2. If transcripts are fully truncated and tokens still exceed limit, truncate chat history (FIFO)
      while (
        currentTokens >= tokenLimit &&
        sliceChatIndex < chatHistory.length
      ) {
        sliceChatIndex++;
        currentTokens = calculateTokensForSlice(
          transcripts.length,
          sliceChatIndex,
        );
      }

      // Apply truncations if any
      if (sliceTransIndex > 0 || sliceChatIndex > 0) {
        if (sliceTransIndex > 0) {
          dispatch(truncateOldTranscripts(sliceTransIndex));
        }
        if (sliceChatIndex > 0) {
          dispatch(truncateChatHistory(sliceChatIndex));
        }
      }

      // Reset the truncation alert trigger
      dispatch(setTokenLimitTruncatedFlag(false));
    }
  }, [
    tokenLimitTruncated,
    transcripts,
    chatHistory,
    question,
    tokenLimit,
    activeSession,
    dispatch,
  ]);

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

    setQuestion("");
    dispatch(appendChatMessage({ role: "user", content: queryText }));
    dispatch(setLoading(true));
    setStreamedResponse("");

    // Compile active transcripts context
    const contextText =
      generateSrtContent(transcripts) ||
      "No transcription records available yet.";

    try {
      let currentResponse = "";
      const result = await askGeminiStream(
        {
          apiKey: config.googleApiKey,
          model: config.aiModel,
          context: contextText,
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

      // Save Chat pair to DB
      const chat = {
        id: crypto.randomUUID(),
        sessionId: activeSession.id,
        question: queryText,
        answer: result,
        timestamp: new Date(),
      };
      await db.saveChatPair(chat);
      dispatch(addChatPairToActive(chat));
    } catch (error: any) {
      console.error("Gemini Chat Error:", error);
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
    "Compare what each speakers said",
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
      <div className="px-6 pt-5 pb-4 border-b border-white/10 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm tracking-wide bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent uppercase">
            AI Assistant
          </h3>
          {chatHistory.length > 0 && (
            <Button onClick={handleClear} variant="clear" size="none">
              Clear
            </Button>
          )}
        </div>
        {/* Token capacity meter */}
        <TokenMeter tokenCount={tokenCount} tokenLimit={tokenLimit} />
      </div>

      {/* Warnings & Notices */}
      {tokenLimitTruncated && (
        <WarningBanner type="error">
          <strong>Context Window Full:</strong> Exceeded 100% capacity. FIFO
          truncation was executed to preserve latest speaker turns.
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
              Ask questions about this transcriptions
            </p>
            <p className="text-[10px] text-neutral-500 mt-1 max-w-xs">
              Gemini will reference the full transcriptions as context.
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
                  className="!text-left !justify-start !font-normal !w-full !p-3 !rounded-lg bg-neutral-900 border border-white/5 hover:border-violet-500/40 hover:bg-neutral-900/80"
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
            handleAsk(question);
          }}
          className="flex items-center gap-2"
        >
          <Input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!activeSession || isLoading}
            variant="dark"
            className="!px-4 !py-3 !text-sm"
            placeholder="Type your question..."
          />
          <Button
            type="submit"
            disabled={!activeSession || !question.trim() || isLoading}
            variant="primary"
            size="none"
            className="!p-3 !rounded-lg"
          >
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
