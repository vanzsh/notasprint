"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { deleteTurn, setLocks } from "@/lib/moves";
import { seriesById } from "@/lib/series";
import { commit, getState, hydrate, redo, select, undo, useStore } from "@/lib/store";
import { registerWebMCP } from "@/lib/webmcp";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Canvas } from "./Canvas";
import { ExportDialog } from "./ExportDialog";
import { Panel } from "./Panel";
import { Present } from "./Present";
import { ReferenceLibrary, SERIES_LOGO } from "./ReferenceLibrary";

const AGENT_TEXT = {
  connected: { label: "Agent connected", tip: "WebMCP tools registered. An agent in this browser reads and edits this live circuit with you." },
  unavailable: { label: "WebMCP not detected", tip: "Open in ChatGPT's in-app browser or Chrome 149+ with chrome://flags/#enable-webmcp-testing to let an agent design with you." },
  unknown: { label: "WebMCP", tip: "Checking for a WebMCP agent." },
} as const;

export function Workspace() {
  const circuit = useStore((s) => s.circuit);
  const agent = useStore((s) => s.agent);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const [library, setLibrary] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [present, setPresent] = useState(false);
  const series = seriesById(circuit.series);

  useEffect(() => registerWebMCP(), []);
  useEffect(() => { hydrate(); }, []); // brief and versions from localStorage, after mount so the first render matches the server

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;
      const { circuit: c, selected } = getState();
      const i = c.turns.findIndex((t) => t.id === selected);
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (e.key === "Escape") select(null);
      else if (i >= 0 && e.key.toLowerCase() === "l") commit(setLocks(c, [i + 1], !c.turns[i].locked).circuit, { source: "human", label: c.turns[i].locked ? `Unlocked T${i + 1}` : `Locked T${i + 1}` });
      else if (i >= 0 && (e.key === "Backspace" || e.key === "Delete") && !c.turns[i].locked && c.turns.length > 4) { commit(deleteTurn(c, i).circuit, { source: "human", label: `Removed T${i + 1}` }); select(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (present) return <Present onExit={() => setPresent(false)} />;

  return (
    <div className="grid h-full grid-rows-[48px_1fr] bg-bg text-fg">
      <header className="flex items-center gap-3 border-b border-line px-4">
        <div className="flex items-baseline gap-2">
          <span className="display text-[20px] leading-none tracking-[0.04em]">NotASprint</span>
          <span className="label hidden lg:inline">Circuit Design Lab</span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="hidden min-w-0 items-center gap-1.5 text-[12px] text-fg-dim md:flex">
          <Image src={SERIES_LOGO[circuit.series]} alt="" width={14} height={14} unoptimized className="size-3.5 shrink-0 rounded-[2px] object-contain" />
          <span className="truncate"><span className="text-fg-muted">{series.name}</span> · {circuit.name}</span>
        </div>
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild><Button size="icon" className="rounded-r-none" onClick={() => undo()} disabled={!canUndo} aria-label="Undo"><Undo2 /></Button></TooltipTrigger>
            <TooltipContent>Undo <kbd>⌘Z</kbd></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild><Button size="icon" className="-ml-px rounded-l-none" onClick={() => redo()} disabled={!canRedo} aria-label="Redo"><Redo2 /></Button></TooltipTrigger>
            <TooltipContent>Redo <kbd>⇧⌘Z</kbd></TooltipContent>
          </Tooltip>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="chip" tabIndex={0}>
                <span className={`dot ${agent === "connected" ? "dot-on" : ""}`} />
                {AGENT_TEXT[agent].label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">{AGENT_TEXT[agent].tip}</TooltipContent>
          </Tooltip>
        </div>
      </header>
      <main className="grid min-h-0 grid-cols-[1fr_minmax(320px,min(26%,400px))]">
        <div className="relative min-w-0 overflow-hidden">
          <Canvas />
        </div>
        <Panel onLibrary={() => setLibrary(true)} onExport={() => setExporting(true)} onPresent={() => setPresent(true)} />
      </main>
      <ReferenceLibrary open={library} onOpenChange={setLibrary} />
      <ExportDialog open={exporting} onOpenChange={setExporting} />
    </div>
  );
}
