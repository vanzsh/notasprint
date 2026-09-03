import type { Metadata } from "next";
import { Barlow_Condensed, Geist, Geist_Mono, Oxanium } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const barlow = Barlow_Condensed({ variable: "--font-barlow", subsets: ["latin"], weight: ["500", "600", "700"] });
// Circuit annotations only (turn numbers, sector marks, S/F, on-canvas telemetry). Product UI keeps Geist / Geist Mono / Barlow.
const oxanium = Oxanium({ variable: "--font-oxanium", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "NotASprint — Circuit Design Lab",
  description: "Design Formula-style racing circuits together with an AI agent in the same live workspace. WebMCP-native.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${barlow.variable} ${oxanium.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
