# Transcribee 🐝

> **Local-First, Real-Time Multilingual Code-switching Audio Transcriber, Diarization, Translation, Playback, & AI Chat.**

Transcribee is a browser-only web application orchestrating real-time audio streaming, speaker diarization, live translation, audio scrubbing playback, LLM chat with FIFO context management, and offline persistence—completely client-side with zero intermediary backend servers.

---

## 📸 Interface Preview

| View | Description |
| :--- | :--- |
| **Desktop Workspace**<br>![Desktop Workspace](public/screenshots/main_app.png) | Unified layout featuring saved session management, live transcript stream with speaker indicators, and dynamic AI chat drawer. |
| **Transcription & Translation**<br>![Live Transcription](public/screenshots/transcription.png) | High-frequency token streaming with finalized text refinement, concurrent translation tracks, and click-to-play audio scrubbing. |
| **System Configurations**<br>![System Configurations](public/screenshots/settings.png) | Slide-out drawer for Soniox and Google Gemini API keys, model selections, audio routing modes, and language hints. |
| **Mobile-Responsive Layout**<br>![Mobile Interface](public/screenshots/mobile_view.png) | Responsive viewport navigation collapsing auxiliary panels into fluid tabs focused on live transcription. |

---

## ⚡ Core Features

- **Audio Capture & Loopback Mixing:** Captures microphone (`getUserMedia`) and system audio (`getDisplayMedia`), mixing to 16kHz/44.1kHz linear PCM mono stream or routing single tracks.
- **Soniox Live STT Client:** Full-duplex WebSocket client streaming real-time tokens, speaker diarization IDs, and translation tracks directly to Redux store.
- **Token-Level Audio Scrubbing:** Correlates transcribed words to exact audio offsets (`start_ms`, `duration_ms`) for split-second audio playback from local cache.
- **Smart FIFO Context Manager:** Client-side token counting with visual warning at **85%** capacity and automated First-In, First-Out truncation at **100%** preserving speaker turn boundaries.
- **In-Browser Gemini Chat:** Context-aware assistant via LangChain JS streaming responses against accumulated session transcripts.
- **Local-First Persistence:** Complete offline persistence for audio buffers, transcripts, translations, and chat histories via IndexedDB / OPFS.

---

## 🛠️ Architecture Overview

```mermaid
flowchart TD
    Audio["Web Audio API Processing<br/>(Mic + Speaker Loopback)"]
    RTK["RTK Global State Engine"]
    Soniox["Soniox Live STT Agent<br/>(WebSocket Engine)"]
    Gemini["Gemini Chat Agent<br/>(LangChain JS Client)"]
    Persistence["Local-First Persistence Agent<br/>(IndexedDB / OPFS)"]

    Audio -->|"Raw Audio Buffer (PCM)"| RTK
    RTK -->|"Audio Stream"| Soniox
    Soniox -->|"Real-Time Tokens & Diarization"| RTK
    RTK -->|"Context Stream"| Gemini
    Gemini -->|"Streamed Tokens"| RTK
    RTK -->|"Structured Payload & Audio Blobs"| Persistence
```

---

## 🚀 Quickstart

### Prerequisites
- Node.js (v18+)
- npm or bun

### 1. Install Dependencies
```bash
npm install
# or
bun install
```

### 2. Start Development Server
```bash
npm run dev
# or
bun run dev
```
Open [http://localhost:3000](http://localhost:3000).

### 3. Running End-to-End Tests
Playwright validates full user workflows (recording, transcription, translation, playback, AI chat, persistence):
```bash
npm test
# or
bun test
```
