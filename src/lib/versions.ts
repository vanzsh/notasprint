// Named design versions: intentional milestones that complement (never replace) undo/redo. A version snapshots the
// circuit, its analysis, the active design brief and the latest simulation, and two snapshots can be compared.
import { analyze, SCORE_LABEL, type Analysis, type Circuit } from "./circuit";
import { evaluateBrief, type Brief } from "./constraints";
import { compareSimulations, type CompactSimResult } from "./simulation";

/** What a version captures — also the shape of "the current design" so current can be compared with any version. */
export type Snapshot = { circuit: Circuit; analysis: Analysis; brief: Brief; simulation: CompactSimResult | null };
export type Version = Snapshot & { id: string; n: number; name: string; at: number; source: "human" | "agent" };

export const MAX_VERSIONS = 30;

export function makeVersion(versions: Version[], name: string, snap: Snapshot, source: Version["source"], at = Date.now()): Version {
  const n = versions.reduce((m, v) => Math.max(m, v.n), 0) + 1;
  return { id: `v${n}`, n, name: name.trim() || `V${n}`, at, source, circuit: snap.circuit, analysis: snap.analysis, brief: snap.brief, simulation: snap.simulation };
}

export type CompareRow = { key: string; label: string; a: string; b: string; delta?: number };
export type Comparison = {
  a: { id: string; name: string }; b: { id: string; name: string };
  rows: CompareRow[];
  sectors: { sector: 1 | 2 | 3; a: string; b: string }[];
  simulation: ReturnType<typeof compareSimulations> | null;
  summary: string;
};

export function compareSnapshots(a: Snapshot & { id: string; name: string }, b: Snapshot & { id: string; name: string }): Comparison {
  const rows: CompareRow[] = [];
  const num = (key: string, label: string, x: number, y: number, fmt: (v: number) => string = String) => rows.push({ key, label, a: fmt(x), b: fmt(y), delta: Math.round((y - x) * 100) / 100 });
  num("length", "Length", a.analysis.length, b.analysis.length, (v) => `${(v / 1000).toFixed(2)} km`);
  num("turns", "Turns", a.analysis.turnCount, b.analysis.turnCount);
  for (const k of Object.keys(SCORE_LABEL) as (keyof typeof SCORE_LABEL)[]) num(k, SCORE_LABEL[k], a.analysis.scores[k], b.analysis.scores[k]);
  num("strongZones", "Strong zones", a.analysis.overtakingOpportunities.length, b.analysis.overtakingOpportunities.length);
  num("straight", "Longest straight", a.analysis.longestStraight, b.analysis.longestStraight, (v) => `${v} m`);
  const ra = evaluateBrief(a.brief, a.circuit, a.analysis), rb = evaluateBrief(b.brief, b.circuit, b.analysis);
  if (ra.active || rb.active) rows.push({ key: "brief", label: "Brief", a: ra.active ? `${ra.passed}/${ra.active} pass` : "—", b: rb.active ? `${rb.passed}/${rb.active} pass` : "—" });
  const simulation = a.simulation && b.simulation ? compareSimulations(a.simulation, b.simulation) : null;
  const simLabel: Record<string, string> = { congestion: "Sim congestion", contacts: "Sim contacts", overtakes: "Sim passes", avgGapS: "Sim avg gap (s)" };
  if (simulation) for (const r of simulation.rows) if (simLabel[r.metric]) rows.push({ key: `sim.${r.metric}`, label: simLabel[r.metric], a: String(r.before), b: String(r.after), delta: r.delta });
  const sectors = ([1, 2, 3] as const).map((s) => ({ sector: s, a: a.analysis.sectors[s - 1].character, b: b.analysis.sectors[s - 1].character }));
  const changed = rows.filter((r) => r.a !== r.b && !r.key.startsWith("sim."));
  const summary = changed.length ? changed.map((r) => `${r.label} ${r.a} → ${r.b}`).join(" · ") : "No metric differences";
  return { a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name }, rows, sectors, simulation, summary };
}

// Persistence: versions survive a refresh via localStorage. Analysis is derived, so only the circuit is stored.
type Stored = Omit<Version, "analysis">;
export const serializeVersions = (versions: Version[]) => JSON.stringify(versions.map(({ analysis: _a, ...rest }) => { void _a; return rest; }));
export function deserializeVersions(json: string | null): Version[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as Stored[];
    if (!Array.isArray(raw)) return [];
    return raw.filter((v) => v && v.circuit && Array.isArray(v.circuit.turns) && v.circuit.turns.length >= 4).map((v) => ({ ...v, brief: v.brief ?? {}, simulation: v.simulation ?? null, analysis: analyze(v.circuit) }));
  } catch { return []; }
}
