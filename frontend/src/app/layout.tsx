// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

// Font pairing: geometric sans for display, humanist sans for body,
// a real mono for anything technical (IDs, timestamps, status, clauses).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lexa — Legal Document Intelligence",
  description:
    "Upload and analyze legal contracts with AI-powered clause extraction, risk detection, and Indian case law grounding.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased [color-scheme:dark]`}
    >
      <body className="noise min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
