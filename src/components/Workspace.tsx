"use client";
import { useEffect } from "react";
import { buildGeometry } from "@/lib/circuit";
import { CIRCUITS } from "@/lib/circuits";
import { deleteTurn, setLocks } from "@/lib/moves";
import { commit, getState, hydrate, loadCircuit, redo, select, undo, useStore } from "@/lib/store";
import { exportJSON, exportSVG } from "@/lib/export";
import { download } from "@/lib/tools";
import { registerWebMCP } from "@/lib/webmcp";
import { ChevronDown, Download, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Canvas } from "./Canvas";
import { Panel } from "./Panel";

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

  const exportFile = (fmt: "json" | "svg") => {
    const { circuit: c, analysis } = getState();
    download(`${c.id}.${fmt}`, fmt === "svg" ? exportSVG(c, buildGeometry(c.turns)) : exportJSON(c, analysis), fmt === "svg" ? "image/svg+xml" : "application/json");
  };

  return (
    <div className="grid h-full grid-rows-[48px_1fr] bg-bg text-fg">
      <header className="flex items-center gap-3 border-b border-line px-4">
        <div className="flex items-baseline gap-2">
          <span className="display text-[20px] leading-none tracking-[0.04em]">NotASprint</span>
          <span className="label hidden lg:inline">Circuit Design Lab</span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild><span className="label cursor-help">Reference</span></TooltipTrigger>
            <TooltipContent>Example starting layouts. Design inspirations (in the panel) are characteristics applied to the live circuit.</TooltipContent>
          </Tooltip>
          <Select value={circuit.id} onValueChange={(id) => loadCircuit(id)}>
            <SelectTrigger aria-label="Reference layout" className="min-w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CIRCUITS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button><Download />Export<ChevronDown className="-mr-1 size-3" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuLabel>Export {circuit.name}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => exportFile("json")}>JSON<span className="text-fg-muted">definition + analysis</span><DropdownMenuShortcut>.json</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportFile("svg")}>SVG<span className="text-fg-muted">layout drawing</span><DropdownMenuShortcut>.svg</DropdownMenuShortcut></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="grid min-h-0 grid-cols-[1fr_minmax(320px,min(26%,400px))]">
        <div className="relative min-w-0 overflow-hidden">
          <Canvas />
        </div>
        <Panel />
      </main>
    </div>
  );
}
