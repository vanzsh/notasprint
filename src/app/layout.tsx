import type { Metadata } from "next";
import { Barlow_Condensed, Geist, Geist_Mono, Oxanium } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const barlow = Barlow_Condensed({ variable: "--font-barlow", subsets: ["latin"], weight: ["500", "600", "700"] });
// Circuit annotations only (turn numbers, sector marks, S/F, on-canvas telemetry). Product UI keeps Geist / Geist Mono / Barlow.
const oxanium = Oxanium({ variable: "--font-oxanium", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "NotASprint — Circuit Design Lab",
  description: "Design racing circuits for Formula 1, Formula E and MotoGP together with an AI agent in the same live workspace. WebMCP-native.",
  applicationName: "NotASprint",
  openGraph: { title: "NotASprint — Circuit Design Lab", description: "A multi-motorsport circuit design studio where humans and AI agents design, analyse and simulate the same live circuit.", type: "website", siteName: "NotASprint" },
  twitter: { card: "summary", title: "NotASprint — Circuit Design Lab", description: "Humans and AI agents designing the same racing circuit, live." },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${barlow.variable} ${oxanium.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
