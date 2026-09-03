"use client";
import { useEffect } from "react";
import { buildGeometry } from "@/lib/circuit";
import { CIRCUITS } from "@/lib/circuits";
import { deleteTurn, setLocks } from "@/lib/moves";
import { commit, getState, hydrate, loadCircuit, redo, select, undo, useStore } from "@/lib/store";
import { exportJSON, exportSVG } from "@/lib/export";
import { download } from "@/lib/tools";
import { registerWebMCP } from "@/lib/webmcp";
import { Canvas } from "./Canvas";
import { Panel } from "./Panel";

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
      <header className="flex items-center gap-4 border-b border-line px-4">
        <div className="flex items-baseline gap-2">
          <span className="display text-[20px] leading-none tracking-[0.04em]">NotASprint</span>
          <span className="label hidden sm:inline">Circuit Design Lab</span>
        </div>
        <div className="h-4 w-px bg-line" />
        <label className="flex items-center gap-2">
          <span className="label">Reference</span>
          <select value={circuit.id} onChange={(e) => loadCircuit(e.target.value)} aria-label="Reference layout" title="Example starting layouts. Design inspirations are applied to the live circuit from the panel or by the agent.">
            {CIRCUITS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button className="btn" onClick={() => undo()} disabled={!canUndo} title="Undo (⌘Z)">Undo</button>
          <button className="btn" onClick={() => redo()} disabled={!canRedo} title="Redo (⇧⌘Z)">Redo</button>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="chip" title={agent === "connected" ? "WebMCP tools registered — an agent in this browser reads and edits this live circuit with you." : "Open in ChatGPT's in-app browser or Chrome 149+ with chrome://flags/#enable-webmcp-testing to let an agent design with you."}>
            <span className={`dot ${agent === "connected" ? "dot-on" : ""}`} />
            {agent === "connected" ? "Agent connected" : agent === "unavailable" ? "WebMCP not detected" : "WebMCP"}
          </span>
          <div className="flex items-center gap-1">
            <button className="btn" onClick={() => exportFile("svg")}>Export SVG</button>
            <button className="btn btn-primary" onClick={() => exportFile("json")}>Export JSON</button>
          </div>
        </div>
      </header>
      <main className="grid min-h-0 grid-cols-[1fr_minmax(320px,26%)]">
        <div className="relative min-w-0 overflow-hidden">
          <Canvas />
        </div>
        <Panel />
      </main>
    </div>
  );
}
