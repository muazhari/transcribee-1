# Technical Architecture & Client-Side Agents Specification (`agents.md`)

This document outlines the architecture of the **Local-First Real-Time Transcription & AI Chat System**. Operating entirely within the browser sandbox, the system orchestrates audio streaming, real-time AI processing, context management, and client-side relational storage without relying on an intermediate backend application server.

---

## 1. System Architecture Overview

The system is designed around a decoupled, reactive event-driven architecture powered by **Redux Toolkit (RTK)** as the global orchestrator. Interactions with external AI services (Soniox, Gemini) occur directly from the client browser using custom streaming engines, while storage is managed locally using **PGlite (Postgres in WASM) / IndexedDB** abstracted through **Prisma Client**.

```
                           +---------------------------------------+
                           |       Web Audio API Processing        |
                           |   (Mic Input + Speaker Loopback)      |
                           +-------------------+-------------------+
                                               | Raw Audio Buffer
                                               v
+-----------------------+  Audio Stream +------+------+   Real-Time Tokens  +------------------------+
|  Soniox Live STT Agent | ------------> |  RTK Global | <------------------ |   Gemini Chat Agent     |
|   (WebSocket Engine)  | <------------ | State Engine | ----------------->  |   (LangChain JS Client)|
+-----------------------+  Config / Keys +------+------+   Context Stream   +------------------------+
                                               |
                                               | Structured Payload Data
                                               v
                           +-------------------+-------------------+
                           |    Local-First Persistence Agent      |
                           |   (Prisma WASM + PGlite / IndexedDB)  |
                           +---------------------------------------+

```

---

## 2. Agent Breakdowns & Core Responsibilities

### 2.1 Configuration & Validation Agent (Settings Module)

Responsible for validating application configurations, managing API credentials securely in reactive memory, and ensuring schema safety before initializing streaming connections.

- **Tech Stack:** `react-hook-form`, `zod`, `@reduxjs/toolkit`
- **Key Responsibilities:**
- Validate user credentials (Google AI API Key, Soniox API Key) via Zod schemas.
- Enforce fallbacks (e.g., Default AI Model: `Gemini 3.5 Flash`, Default STT Model: `stt-rt-v5`).
- Dynamically propagate updates to audio routing and language configurations down to dependent streams.

```typescript
// Zod Schema Verification Layer
export const SettingsSchema = zod.object({
  sonioxApiKey: zod.string().min(1, "Soniox API Key is required"),
  googleApiKey: zod.string().min(1, "Google AI API Key is required"),
  aiModel: zod.string().default("gemini-3.5-flash"),
  transcriptionModel: zod.string().default("stt-rt-v5"),
  languageHints: zod.string().split(",")
    .map((s) => s.trim().default(["en", "id"]),
  enableEndpointDetection: zod.boolean().default(true),
  enableLanguageIdentification: zod.boolean().default(true),
  translationMode: zod.enum(["one-way", "two-way"]).default("two-way"),
  audioRouting: zod.enum(["mix", "mic-only", "speaker-only"]).default("mix"),
});
```

---

### 2.2 Audio Capture & Routing Agent

Intercepts, captures, and processes physical hardware input streams and software output streams entirely using native browser primitives.

- **Tech Stack:** Web Audio API (`AudioContext`, `MediaStreamAudioSourceNode`, `AudioWorklet`)
- **Key Responsibilities:**
- Capture microphone input via `navigator.mediaDevices.getUserMedia`.
- Capture system/speaker output audio via screen-share audio loopbacks (`navigator.mediaDevices.getDisplayMedia`).
- **Channel Management:** If "mix" routing is selected, mix both mic and speaker tracks down to a uniform mono/stereo linear PCM stream (16kHz or 44.1kHz) required by the STT API. If "mic-only" or "speaker-only" routing is selected, just stream the selected track.

---

### 2.3 Soniox Live Transcription Agent

Maintains a resilient, persistent duplex connection to the Soniox service, transmitting raw binary audio data frames and managing high-frequency, incremental token events.

- **Tech Stack:** Native Browser `WebSocket` client, Custom RTK Middleware Async Thunks
- **Key Responsibilities:**
- Establish high-frequency binary stream pipelines to `wss://[api.soniox.com/v1/stream](https://api.soniox.com/v1/stream)`.
- Inject dynamic configuration headers on connection initialization (e.g., translation profiles, channel masks, language identifiers).
- Consume token streams natively, extracting Word-Level Timestamps (`start_ms`, `duration_ms`), Speaker ID Tags (Diarization), and Translation strings.
- Append incremental outputs cleanly to the RTK Global Slice to prevent excessive DOM thrashing.
- Display streamed `isFinal == false` transcription, then refine transcription after `isFinal == true`. This is to make the transcription more readable. If it is not refined, the transcription will be spaced out and hard to read. Use different styles when displaying non-refined and refined transcription.

---

### 2.4 Context & Token Manager Agent

Monitors the client-side accumulated transcription array, performing real-time safety metrics and token allocation mapping before raw structural context is forwarded to the LLM context frame.

- **Tech Stack:** `langchain/llms/base`, `@langchain/core/tokens`
- **Key Responsibilities:**
- Continuously monitor text block mutations within the active recording session.
- Calculate precise token sizes using client-side approximations matching the Gemini tokenizer architecture.
- **Guardrail Execution:** Compare active token volume against the model's target threshold constraints. When volume passes **85%** capacity, dispatch a UI alert warning state via the global notification layout. If volume passes **100%**, execute smart FIFO (First-In, First-Out) truncation prioritizing speaker integrity boundaries.

---

### 2.5 Gemini Chat Agent

Manages standalone semantic interrogation interactions over the compiled session context logs. Runs entirely inside the browser using LangChain expressions.

- **Tech Stack:** `@langchain/google-genai`, `langchain/prompts`
- **Key Responsibilities:**
- Initialize localized instances of `ChatGoogleGenerativeAI` dynamically utilizing the credentials provided by the Configuration Agent.
- Compile the systemic engineering prompt template combining the parsed history, the truncated context block, and the user's explicit question.
- Expose fully-streamed token outputs from Gemini directly to UI response elements using standard async iterators.

```typescript
// Conceptual Token Execution Path
const promptTemplate = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are an AI Assistant answering queries based on the following real-time transcript summary:\n\n{context}",
  ],
  ["placeholder", "{chat_history}"],
  ["human", "{question}"],
]);
```

---

### 2.6 Local-First Persistence Agent

Abstracts stateful, offline relational operations inside the client environment, storing structural telemetry metrics alongside extensive raw data segments.

- **Tech Stack:** `Prisma Client (WASM / Driver Adapter)`, `@electric-sql/pglite` or IndexedDB Engine, Web Origin Private File System (OPFS)
- **Key Responsibilities:**
- **Data Models:** Synchronize structures representing sessions, transcription tokens, translations, speaker shifts, and question-answer configurations.
- **High-Volume Blob Caching:** Stream continuous binary audio input directly into indexed chunk allocations inside browser storage/OPFS to eliminate client RAM exhaustion.
- **Transactional Bindings:** Guarantee ACID compliance across operations updating text fragments alongside microsecond timestamp mappings.

---

## 3. Advanced Feature Implementation Paths

### 3.1 Token-Level Audio Playback Architecture

To achieve granular audio scrubbing (clicking a transcribed token plays the precise split-second of audio), the system correlates textual elements with audio chunk timelines:

1. **Ingestion:** The **Audio Capture Agent** marks data blocks with high-precision absolute timestamps relative to session generation zero (`t_0`).
2. **Mapping:** The **Soniox Live Transcription Agent** appends relative offset values (`start_ms` and `duration_ms`) directly to every text token object returned by the WebSocket pipeline.
3. **Cross-Referencing:** The UI registers text interaction elements with click handlers containing targets targeting the token's precise mathematical offsets.
4. **Playback Extraction:** The **Persistence Agent** seeks directly inside the browser audio cache, extracts the target segment array, shifts playback targets dynamically, and routes the slice directly to the output hardware nodes.

### 3.2 Relational Local Storage Schema (Prisma Engine Blueprint)

```prisma
datasource db {
  provider = "postgresql"
  url      = "file:local.db"
}

model Session {
  id             String          @id @default(uuid())
  createdAt      DateTime        @default(now())
  title          String?
  audioBlobPath  String          // Reference path pointing to browser local storage index
  transcripts    Transcript[]
  chatPairs       ChatPair[]
}

model Transcript {
  id             String          @id @default(uuid())
  sessionId      String
  session        Session         @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  speakerId      String          // Diarization identity mapping ("Speaker 1", "Speaker 2")
  text           String          // Original localized text content
  isFinal        Boolean         // Whether the text is final or not
  translationStatus String       // Status of the translation
  language       String          // Language of the transcription
  translation    String?         // Outgoing target language translation block if enabled
  startTimestamp Int             // Start point offset in milliseconds from session initialization
  endTimestamp   Int             // End point offset in milliseconds from session initialization
  offsetTimestamp Int             // Offset timestamp of the transcription segment
  duration       Int             // Duration of the transcription segment in milliseconds

}

model ChatPair {
  id             String          @id @default(uuid())
  sessionId      String
  session        Session         @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  question       String
  answer         String
  timestamp      DateTime        @default(now())
}

```

---

## 4. Global State Layout (Redux Toolkit State Slices)

The runtime environment balances performance constraints by isolating state variables based on frequency configurations:

```
State Container (RTK Root)
 ├── config          <- Static/Low-frequency validation metrics, API keys, operational profiles.
 ├── mediaControl    <- Device targets, stream health metrics, hardware mapping toggles.
 ├── transcription   <- High-frequency text tokens, relative token maps, active diarization streams.
 ├── chatContext     <- Token computation boundaries, prompt histories, truncation warning flags.
 └── persistence     <- Synced processing states, operational database access allocations.

```

---

## 5. UI/UX Responsive Layout Strategies

The application implements a tailored design framework targeting high-speed performance on mobile viewpoints while accommodating data-dense structural layouts on high-resolution displays:

- **Mobile-First Construction:** Navigation interfaces hide parameter panels under persistent slide-out utility sheets (`HeroUI Drawer`), prioritizing single-column layout focus spaces containing live text generation nodes.
- **Accessibility Under Live Mutation:** Content output arrays anchor viewing bounds dynamically to screen base plates. If a user manually scrolls upward to view historical tokens or interact with token playback components, automated tracking flags unlock seamlessly to prevent jarring viewport disruptions.
- **Atomic Design Principles:** The application implements atomic design principles to ensure high-quality, reusable UI components, and maintainable code.

## 6. End-to-end Testing

- Test the application using Playwright. Test all branches, features, and coverages.
- When executing end-to-end tests, it is crucial to mimic real-world conditions as closely as possible. This includes simulating user interactions with the audio input and verifying the system's response to various conditions. The tests should validate the complete user journey: initiating a recording session, reviewing the final transcript, reviewing translations, reviewing playback, and chatting with the transcript. Furthermore, the tests should cover edge cases and error states, such as network interruptions or invalid input, to ensure the application handles them gracefully.
