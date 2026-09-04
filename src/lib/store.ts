// Single source of truth shared by the canvas, the panel and the WebMCP tools.
import { useSyncExternalStore } from "react";
import { analyze, SCORE_LABEL, type Analysis, type Circuit } from "./circuit";
import { CIRCUITS, circuitById, DEFAULT_CIRCUIT } from "./circuits";
import { isBriefEmpty, type Brief } from "./constraints";
import { freshSeed, generateCircuit } from "./generate";
import { SERIES, type SeriesId } from "./series";
import { compactResult, DEFAULT_SIM, simulate, type CompactSimResult, type SimParams, type SimResult } from "./simulation";
import { deserializeVersions, makeVersion, MAX_VERSIONS, serializeVersions, type Snapshot, type Version } from "./versions";
export { SCORE_LABEL };

/**
 * One activity record. Human edits carry a label/text; a WebMCP call additionally carries the tool name, whether it
 * succeeded and a short local id — real event data, never a network origin.
 */
export type Receipt = { id: string; label?: string; text: string; source: "agent" | "human"; at: number; tool?: string; ok?: boolean };

export type State = {
  circuit: Circuit;
  origin: Circuit; // the circuit as loaded or generated; Reset returns to it
  analysis: Analysis;
  past: Circuit[];
  future: Circuit[];
  selected: string | null;
  flash: { ids: string[]; at: number } | null;
  receipt: Receipt | null; // newest activity record
  events: Receipt[]; // newest first, capped
  lastChange: string | null; // label of the most recent geometry change; the natural name for a version
  agent: "connected" | "unavailable" | "unknown";
  brief: Brief;
  simParams: SimParams;
  simulation: SimResult | null; // latest run, with playback frames
  simulationBefore: CompactSimResult | null; // the run before it, for before/after
  simRun: number; // increments per run so playback restarts even for identical results
  versions: Version[];
  compare: string | null; // version id overlaid and compared against the current design
};

let state: State = {
  circuit: DEFAULT_CIRCUIT, origin: DEFAULT_CIRCUIT, analysis: analyze(DEFAULT_CIRCUIT), past: [], future: [], selected: null, flash: null, receipt: null, events: [], lastChange: null, agent: "unknown",
  brief: {}, simParams: DEFAULT_SIM, simulation: null, simulationBefore: null, simRun: 0, versions: [], compare: null,
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; emit(); };

// Short local event id (#A72F): a counter mixed with the clock, formatted as four hex digits.
let seq = 0;
const eventId = () => `#${(((++seq * 0x9e3779b1) ^ Date.now()) >>> 0).toString(16).toUpperCase().slice(-4).padStart(4, "0")}`;
const MAX_EVENTS = 40;
/** State patch that records a new activity event and makes it the current receipt. */
const note = (r: Omit<Receipt, "id" | "at"> & { at?: number }): Pick<State, "receipt" | "events"> => {
  const receipt: Receipt = { ...r, id: eventId(), at: r.at ?? Date.now() };
  return { receipt, events: [receipt, ...state.events].slice(0, MAX_EVENTS) };
};
/**
 * Attach a WebMCP call to the activity log. If the call already produced an event (a write), that event is tagged with
 * the tool and outcome; a read-only or failed call gets its own compact record.
 */
export function logCall(tool: string, ok: boolean, startedAt: number, summary?: string) {
  const [latest, ...rest] = state.events;
  if (latest && latest.source === "agent" && latest.at >= startedAt && !latest.tool) {
    const tagged = { ...latest, tool, ok };
    set({ receipt: tagged, events: [tagged, ...rest] });
  } else set(note({ source: "agent", tool, ok, text: summary ?? "" }));
}

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
  const text = receiptText(before, analysis, opts.changed?.length ?? 0, !!opts.label);
  set({
    circuit, analysis,
    past: [...state.past.slice(-MAX_HISTORY), state.circuit], future: [],
    flash: opts.source === "agent" && opts.changed?.length ? { ids: opts.changed, at: Date.now() } : state.flash,
    ...note({ label: opts.label, text, source: opts.source }),
    lastChange: opts.label ?? state.lastChange,
    selected: state.selected && circuit.turns.some((t) => t.id === state.selected) ? state.selected : null,
  });
  return { text: [opts.label, text].filter(Boolean).join(" · "), before, after: analysis };
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

/** Replace the workspace with a circuit: history, selection, simulation and comparison all start over. */
function mount(c: Circuit, source: "agent" | "human", label: string) {
  set({ circuit: c, origin: c, analysis: analyze(c), past: [], future: [], selected: null, flash: null, ...note({ text: label, source }), lastChange: `${c.name} concept`, simulation: null, simulationBefore: null, compare: null });
  return c;
}
/** Back to the circuit as it was loaded or generated. An ordinary, undoable commit. */
export const resetCircuit = (source: "agent" | "human" = "human") => commit(state.origin, { source, label: "Reset to starting layout" });
export function loadCircuit(id: string, source: "agent" | "human" = "human") {
  const c = circuitById(id);
  if (!c) throw new Error(`Unknown circuit "${id}". Available: ${CIRCUITS.map((x) => x.id).join(", ")}`);
  return mount(c, source, `Loaded ${c.name}`);
}
/** Generate and load a custom concept for a discipline. Omit the seed for a fresh one; pass it to reproduce. */
export function loadCustom(series: SeriesId, seed = freshSeed(), source: "agent" | "human" = "human") {
  const c = generateCircuit(series, seed);
  return mount(c, source, `Generated ${SERIES[series].name} concept · seed ${seed}`);
}

export const select = (id: string | null) => set({ selected: id });
export const setAgent = (agent: State["agent"]) => set({ agent });

// ---- design brief ----

/** Merge constraints into the brief; `undefined` (or null from JSON) removes a constraint. */
export function setBrief(patch: Partial<Record<keyof Brief, Brief[keyof Brief] | null>>, source: "agent" | "human" = "human") {
  const brief: Brief = { ...state.brief };
  for (const [k, v] of Object.entries(patch) as [keyof Brief, Brief[keyof Brief] | null | undefined][]) {
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) delete brief[k];
    else (brief as Record<string, unknown>)[k] = v;
  }
  set({ brief, ...note({ label: isBriefEmpty(brief) ? "Brief cleared" : "Brief updated", text: "", source }) });
  persist();
  return brief;
}
export const clearBrief = (source: "agent" | "human" = "human") => setBrief({ minLength: null, maxLength: null, maxTurns: null, minOvertaking: null, minStraight: null, profile: null, preserve: null }, source);

// ---- simulation ----

/** Run the race-flow simulation on the live circuit. Read-only on the circuit; the previous result is kept for before/after. */
export function runSimulation(params: Partial<SimParams> = {}, source: "agent" | "human" = "human") {
  const simParams = { ...state.simParams, ...params };
  const result = simulate(state.circuit, simParams);
  set({
    simParams, simulation: result, simulationBefore: state.simulation ? compactResult(state.simulation) : state.simulationBefore, simRun: state.simRun + 1,
    ...note({ label: `Simulation · ${simParams.cars} ${SERIES[state.circuit.series].noun}s · ${simParams.laps} laps`, text: `${result.totals.congestion} held up · ${result.totals.contacts} contacts · ${result.totals.overtakes} passes`, source }),
  });
  return result;
}
export const setSimParams = (params: Partial<SimParams>) => set({ simParams: { ...state.simParams, ...params } });

// ---- versions ----

export const snapshot = (): Snapshot => ({ circuit: state.circuit, analysis: state.analysis, brief: state.brief, simulation: state.simulation ? compactResult(state.simulation) : null });

export function saveVersion(name: string, source: "agent" | "human" = "human") {
  const v = makeVersion(state.versions, name, snapshot(), source);
  set({ versions: [...state.versions, v].slice(-MAX_VERSIONS), ...note({ label: `Saved ${v.id.toUpperCase()} · ${v.name}`, text: "", source }) });
  persist();
  return v;
}
export function restoreVersion(id: string, source: "agent" | "human" = "human") {
  const v = state.versions.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown version "${id}". Available: ${state.versions.map((x) => x.id).join(", ") || "none"}`);
  commit(v.circuit, { source, label: `Restored ${v.id.toUpperCase()} · ${v.name}` });
  return v;
}
export function deleteVersion(id: string) {
  set({ versions: state.versions.filter((v) => v.id !== id), compare: state.compare === id ? null : state.compare });
  persist();
}
export const setCompare = (id: string | null) => set({ compare: id && state.versions.some((v) => v.id === id) ? id : null });

// ---- persistence (browser only, after mount, so server and first client render agree) ----

const KEY = "notasprint.studio.v1";
const storage = () => (typeof window !== "undefined" ? window.localStorage : null);
function persist() {
  try { storage()?.setItem(KEY, JSON.stringify({ brief: state.brief, versions: JSON.parse(serializeVersions(state.versions)) })); } catch { /* storage full or blocked: versions stay in-session */ }
}
export function hydrate() {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as { brief?: Brief; versions?: unknown };
    set({ brief: data.brief && typeof data.brief === "object" ? data.brief : {}, versions: deserializeVersions(JSON.stringify(data.versions ?? [])) });
  } catch { /* ignore corrupt storage */ }
}

function receiptText(b: Analysis, a: Analysis, changed: number, label: boolean) {
  const parts: string[] = [];
  const delta = a.turns.length - b.turns.length;
  if (delta > 0) parts.push(`${changed} changed · ${delta} added`);
  else if (delta < 0) parts.push(`${changed} changed · ${-delta} removed`);
  else if (changed || !label) parts.push(`${changed} element${changed === 1 ? "" : "s"} changed`);
  if (Math.abs(a.length - b.length) > 5) parts.push(`Length ${(b.length / 1000).toFixed(2)} → ${(a.length / 1000).toFixed(2)} km`);
  const keys = (["overtaking", "flow", "technicality", "highSpeed"] as const)
    .map((k) => ({ k, d: Math.abs(a.scores[k] - b.scores[k]) })).filter((x) => x.d >= 2).sort((x, y) => y.d - x.d).slice(0, 2);
  for (const { k } of keys) parts.push(`${SCORE_LABEL[k]} ${b.scores[k]} → ${a.scores[k]}`);
  return parts.join(" · ");
}
