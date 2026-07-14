import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
} from "@langchain/core/messages";

export const tokenLimits: Record<string, number> = {
  "gemini-3.5-flash": 1000000,
  "gemini-3.1-flash-lite": 1000000,
  "gemini-3.1-pro-preview": 2000000,
};

export interface GeminiQueryConfig {
  apiKey: string;
  model: string;
  context: string;
  chatHistory: { role: "user" | "assistant"; content: string }[];
  question: string;
}

export async function askGeminiStream(
  config: GeminiQueryConfig,
  onChunk: (chunk: string) => void,
): Promise<string> {
  if (
    typeof window !== "undefined" &&
    (window as unknown as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__
  ) {
    const mockResponse =
      "This is a mock response from Gemini based on the transcript.";
    const chunks = mockResponse.split(" ");
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i] + " ";
      await new Promise((resolve) => setTimeout(resolve, 50));
      onChunk(chunk);
    }
    return mockResponse;
  }

  const modelName = config.model;

  // Initialize the Gemini chat model via LangChain
  const model = new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey: config.apiKey,
    temperature: 1,
    thinkingConfig: {
      thinkingLevel: "LOW",
    },
  });

  // Compile prompt message sequence
  const messages = [
    new SystemMessage(
      `You are an AI Assistant answering queries based on the following real-time transcript summary:\n\n${config.context}`,
    ),
    ...config.chatHistory.map((msg) =>
      msg.role === "assistant"
        ? new AIMessage(msg.content)
        : new HumanMessage(msg.content),
    ),
    new HumanMessage(config.question),
  ];

  // Stream responses using LangChain stream method
  const stream = await model.stream(messages);

  let fullResponse = "";
  for await (const chunk of stream) {
    const text = chunk.content;
    if (typeof text === "string" && text) {
      fullResponse += text;
      onChunk(text);
    }
  }

  return fullResponse;
}
