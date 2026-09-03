// Single source of truth shared by the canvas, the panel and the WebMCP tools.
import { useSyncExternalStore } from "react";
import { analyze, type Analysis, type Circuit } from "./circuit";
import { CIRCUITS, DEFAULT_CIRCUIT } from "./circuits";

export type Receipt = { text: string; source: "agent" | "human"; at: number };

export type State = {
  circuit: Circuit;
  analysis: Analysis;
  past: Circuit[];
  future: Circuit[];
  selected: string | null;
  flash: { ids: string[]; at: number } | null;
  receipt: Receipt | null;
  agent: "connected" | "unavailable" | "unknown";
};

let state: State = {
  circuit: DEFAULT_CIRCUIT, analysis: analyze(DEFAULT_CIRCUIT), past: [], future: [], selected: null, flash: null, receipt: null, agent: "unknown",
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; emit(); };

export const getState = () => state;
export const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}

const MAX_HISTORY = 60;

/** Commit a new circuit to history. Returns a metrics receipt for the change. */
export function commit(circuit: Circuit, opts: { source: "agent" | "human"; changed?: string[]; label?: string } = { source: "human" }) {
  const before = state.analysis;
  const analysis = analyze(circuit);
  const text = receiptText(before, analysis, opts.changed?.length ?? 0, opts.label);
  set({
    circuit, analysis,
    past: [...state.past.slice(-MAX_HISTORY), state.circuit], future: [],
    flash: opts.source === "agent" && opts.changed?.length ? { ids: opts.changed, at: Date.now() } : state.flash,
    receipt: { text, source: opts.source, at: Date.now() },
    selected: state.selected && circuit.turns.some((t) => t.id === state.selected) ? state.selected : null,
  });
  return { text, before, after: analysis };
}

/** Live preview while dragging — no history entry. */
export const preview = (circuit: Circuit) => set({ circuit, analysis: analyze(circuit) });

export function undo(steps = 1) {
  let n = 0;
  while (n < steps && state.past.length) {
    const prev = state.past[state.past.length - 1];
    set({ circuit: prev, analysis: analyze(prev), past: state.past.slice(0, -1), future: [state.circuit, ...state.future] });
    n++;
  }
  return n;
}
export function redo() {
  if (!state.future.length) return 0;
  const [next, ...rest] = state.future;
  set({ circuit: next, analysis: analyze(next), past: [...state.past, state.circuit], future: rest });
  return 1;
}

export function loadCircuit(id: string, source: "agent" | "human" = "human") {
  const c = CIRCUITS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown circuit "${id}". Available: ${CIRCUITS.map((x) => x.id).join(", ")}`);
  set({ circuit: c, analysis: analyze(c), past: [], future: [], selected: null, flash: null, receipt: { text: `Loaded ${c.name}`, source, at: Date.now() } });
  return c;
}

export const select = (id: string | null) => set({ selected: id });
export const setAgent = (agent: State["agent"]) => set({ agent });

function receiptText(b: Analysis, a: Analysis, changed: number, label?: string) {
  const parts: string[] = [];
  if (label) parts.push(label);
  const delta = a.turns.length - b.turns.length;
  parts.push(delta > 0 ? `${changed} changed · ${delta} added` : delta < 0 ? `${changed} changed · ${-delta} removed` : `${changed} element${changed === 1 ? "" : "s"} changed`);
  if (Math.abs(a.length - b.length) > 5) parts.push(`Length ${(b.length / 1000).toFixed(2)} → ${(a.length / 1000).toFixed(2)} km`);
  const keys = (["overtaking", "flow", "technicality", "highSpeed"] as const)
    .map((k) => ({ k, d: Math.abs(a.scores[k] - b.scores[k]) })).filter((x) => x.d >= 2).sort((x, y) => y.d - x.d).slice(0, 2);
  for (const { k } of keys) parts.push(`${SCORE_LABEL[k]} ${b.scores[k]} → ${a.scores[k]}`);
  return parts.join(" · ");
}

export const SCORE_LABEL = { overtaking: "Overtaking", flow: "Flow", technicality: "Technicality", highSpeed: "High-speed" } as const;
