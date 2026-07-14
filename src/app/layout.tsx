import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Transcribee - Transcription & Chat",
  description:
    "Real-time multilingual code-switching transcriber with diarization, translation, playback, and chat.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark bg-neutral-950 text-white"
      style={{ colorScheme: "dark" }}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
