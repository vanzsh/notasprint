// WebMCP tool surface. Tools describe design intent (sectors, overtaking zones, locks) — never mouse clicks.
import { buildGeometry, fmtLap, type Analysis, type Circuit } from "./circuit";
import { CIRCUITS } from "./circuits";
import { applyDesignMove, DESIGN_MOVES, editTurns, LockedError, reshapeSector, SECTOR_INTENTS, setLocks, type Intensity, type TurnEdit } from "./moves";
import { commit, getState, loadCircuit, undo } from "./store";
import { exportJSON, exportSVG } from "./export";

export type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<string>;
};

const intensity = { type: "string", enum: ["subtle", "moderate", "strong"], description: "How far to push the change. Default moderate." };
const r1 = (x: number) => Math.round(x * 10) / 10;

function summary(c: Circuit, a: Analysis) {
  return {
    circuit: c.name, circuit_id: c.id, length_m: Math.round(a.length), est_lap: fmtLap(a.lapTime), track_width_m: c.trackWidth,
    scores: a.scores, top_speed_kmh: a.topSpeed, longest_straight_m: a.longestStraight, turn_count: a.turnCount,
    strong_overtaking_turns: a.overtakingOpportunities.map((t) => t.turn),
    locked_turns: a.turns.filter((t) => t.locked).map((t) => t.turn),
    sectors: a.sectors.map((s) => ({ sector: s.sector, length_m: s.length, turns: s.turns, avg_speed_kmh: s.avgSpeed, character: s.character, time_s: r1(s.time) })),
    turns: a.turns.map((t) => ({
      turn: t.turn, name: t.name, sector: t.sector, x: r1(c.turns[t.turn - 1].x), y: r1(c.turns[t.turn - 1].y), radius_m: t.radius, angle_deg: t.angle, direction: t.direction,
      type: t.type, apex_kmh: t.apexSpeed, entry_kmh: t.entrySpeed, braking_drop_kmh: t.brakingDrop, approach_straight_m: t.approach, overtaking_score: t.overtaking, locked: t.locked || undefined,
    })),
    warnings: a.warnings,
  };
}

const ok = (o: unknown) => JSON.stringify(o);
const afterWrite = (receipt: string) => ok({ ok: true, receipt, state: summary(getState().circuit, getState().analysis) });
const run = async (fn: () => string) => {
  try { return fn(); } catch (e) {
    return ok({ ok: false, error: (e as Error).message, locked_turns: getState().circuit.turns.map((t, i) => (t.locked ? i + 1 : 0)).filter(Boolean), hint: e instanceof LockedError ? "Locked turns are human decisions. Change other turns or insert new ones around them." : undefined });
  }
};

export const tools: Tool[] = [
  {
    name: "get_circuit",
    description: "Read the live circuit exactly as the designer sees it: every turn (position in metres, radius, sector, apex/entry speed, braking drop, approach straight, overtaking score, lock state), sector summaries, scores and warnings. Coordinates: metres, +x east, +y south; the lap runs Turn 1 → N; start/finish sits on the straight from the last turn into Turn 1. Call this first and again after the human edits something.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => ok({ ...summary(getState().circuit, getState().analysis), reference_circuits: CIRCUITS.map((c) => ({ id: c.id, name: c.name, tagline: c.tagline })) }),
  },
  {
    name: "analyze_circuit",
    description: "Deterministic circuit design analysis with explanations: what makes each score what it is, where the strong overtaking opportunities are (heavy braking after a long approach), which turns are the best candidates to become one, sector character, and constraints. Use it to decide what to change and to verify a change achieved the goal.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const { circuit: c, analysis: a } = getState();
      const cands = a.turns.filter((t) => t.overtaking < 70 && t.type !== "kink" && !t.locked).sort((p, q) => q.approach - p.approach).slice(0, 4);
      const slowest = [...a.sectors].sort((p, q) => p.avgSpeed - q.avgSpeed)[0];
      return ok({
        ...summary(c, a),
        strong_overtaking_opportunities: a.overtakingOpportunities.map((t) => `Turn ${t.turn}${t.name ? ` (${t.name})` : ""}: ${t.entrySpeed} → ${t.apexSpeed} km/h after a ${t.approach} m approach (score ${t.overtaking})`),
        overtaking_candidates: cands.map((t) => `Turn ${t.turn}: approach ${t.approach} m, braking drop ${t.brakingDrop} km/h, score ${t.overtaking}. create_overtaking_zone would slow the corner and lengthen the approach.`),
        how_scores_work: {
          overtaking: "22 points per strong opportunity (max 3) + weighted top-3 turn scores. A turn scores ≥70 when braking drop ≥ ~120 km/h and approach ≥ ~400 m.",
          flow: "Share of corners taken ≥170 km/h and low average braking drop. Opening radii raises flow; hairpins and chicanes lower it.",
          technicality: "Corner density per km and share of corners below 150 km/h. Chicanes, esses and tighter radii raise it.",
          highSpeed: "Share of the lap spent above 250 km/h.",
        },
        sector_notes: a.sectors.map((s) => `Sector ${s.sector}: ${s.length} m, ${s.turns} turns, avg ${s.avgSpeed} km/h, ${s.character}${s === slowest ? " (slowest sector)" : ""}`),
        design_guidance: [
          "Keep total length in the brief (e.g. below 6000 m) — removing a shallow turn or chicane shortens; hairpin loops add ~400 m.",
          "Locked turns must keep their exact position and radius; change neighbours or insert turns on adjacent straights instead.",
          "Prefer reshape_sector and apply_design_move; use edit_turns only for precise placement.",
        ],
      });
    },
  },
  {
    name: "apply_design_move",
    description: `Apply one motorsport design move to a turn. Moves: tighten_turn (smaller radius, slower apex), open_turn (larger radius, faster), create_overtaking_zone (turn becomes a heavy braking zone with a long approach — the classic overtaking spot), add_chicane_after / add_esses_after / add_hairpin_after (insert new turns on the straight after this turn), remove_turn (delete, straightening the track). Respects locked turns. Returns a receipt and the new circuit state.`,
    inputSchema: {
      type: "object",
      properties: {
        move: { type: "string", enum: [...DESIGN_MOVES] },
        turn: { type: "integer", description: "Turn number (1-based)." },
        intensity,
        reason: { type: "string", description: "One short sentence shown to the designer, e.g. 'Braking zone for overtaking into Turn 3'." },
      },
      required: ["move", "turn"],
    },
    execute: async ({ move, turn, intensity, reason }) =>
      run(() => {
        const r = applyDesignMove(getState().circuit, move as (typeof DESIGN_MOVES)[number], Number(turn), intensity as Intensity);
        return afterWrite(commit(r.circuit, { source: "agent", changed: r.changed, label: (reason as string) || `${String(move).replace(/_/g, " ")} · T${turn}` }).text);
      }),
  },
  {
    name: "reshape_sector",
    description: "Reshape a whole sector toward an intent, respecting locked turns: faster (open radii, remove kinks at strong), more_technical (tighten radii and insert a chicane on the sector's longest straight; esses too at strong), more_overtaking (turn the best candidate into a heavy braking zone). The tool decides the geometry; you decide the intent.",
    inputSchema: {
      type: "object",
      properties: {
        sector: { type: "integer", enum: [1, 2, 3] },
        intent: { type: "string", enum: [...SECTOR_INTENTS] },
        intensity,
        reason: { type: "string", description: "One short sentence shown to the designer." },
      },
      required: ["sector", "intent"],
    },
    execute: async ({ sector, intent, intensity, reason }) =>
      run(() => {
        const r = reshapeSector(getState().circuit, Number(sector) as 1 | 2 | 3, intent as (typeof SECTOR_INTENTS)[number], intensity as Intensity);
        return afterWrite(commit(r.circuit, { source: "agent", changed: r.changed, label: (reason as string) || `Sector ${sector} ${String(intent).replace(/_/g, " ")}` }).text);
      }),
  },
  {
    name: "edit_turns",
    description: "Precisely edit one or more turns: position (metres), corner radius (metres, ≥8) or name. Fails for locked turns. Use for fine placement after design moves, or to shorten/lengthen straights by moving turns.",
    inputSchema: {
      type: "object",
      properties: {
        edits: {
          type: "array", minItems: 1,
          items: { type: "object", properties: { turn: { type: "integer" }, x: { type: "number" }, y: { type: "number" }, radius: { type: "number" }, name: { type: "string" } }, required: ["turn"] },
        },
        reason: { type: "string" },
      },
      required: ["edits"],
    },
    execute: async ({ edits, reason }) =>
      run(() => {
        const r = editTurns(getState().circuit, edits as TurnEdit[]);
        return afterWrite(commit(r.circuit, { source: "agent", changed: r.changed, label: (reason as string) || undefined }).text);
      }),
  },
  {
    name: "set_turn_locks",
    description: "Lock or unlock turns. Locked turns are protected design decisions: no tool may move, resize or delete them. Use when the designer asks to keep a turn exactly as it is.",
    inputSchema: { type: "object", properties: { turns: { type: "array", items: { type: "integer" }, minItems: 1 }, locked: { type: "boolean" } }, required: ["turns", "locked"] },
    execute: async ({ turns, locked }) =>
      run(() => {
        const r = setLocks(getState().circuit, turns as number[], Boolean(locked));
        return afterWrite(commit(r.circuit, { source: "agent", changed: [], label: `${locked ? "Locked" : "Unlocked"} T${(turns as number[]).join(", T")}` }).text);
      }),
  },
  {
    name: "load_reference_circuit",
    description: "Replace the workspace with one of the reference layouts: silver-fields (mixed), temple-of-speed (long straights), street-crown (tight urban), figure-eight (flowing crossover). Clears history.",
    inputSchema: { type: "object", properties: { circuit_id: { type: "string", enum: CIRCUITS.map((c) => c.id) } }, required: ["circuit_id"] },
    annotations: { destructiveHint: true },
    execute: async ({ circuit_id }) => run(() => { loadCircuit(String(circuit_id), "agent"); return afterWrite(`Loaded ${getState().circuit.name}`); }),
  },
  {
    name: "undo_changes",
    description: "Undo the last N changes (yours or the designer's).",
    inputSchema: { type: "object", properties: { steps: { type: "integer", minimum: 1, default: 1 } } },
    execute: async ({ steps }) => run(() => afterWrite(`Undid ${undo(Number(steps) || 1)} change(s)`)),
  },
  {
    name: "export_circuit",
    description: "Export the current circuit. json: full definition plus analysis (also returned inline). svg: vector drawing of the layout. Triggers a download in the designer's browser.",
    inputSchema: { type: "object", properties: { format: { type: "string", enum: ["json", "svg"], default: "json" } } },
    annotations: { readOnlyHint: true },
    execute: async ({ format }) => {
      const { circuit, analysis } = getState();
      const svg = format === "svg";
      const body = svg ? exportSVG(circuit, buildGeometry(circuit.turns)) : exportJSON(circuit, analysis);
      if (typeof document !== "undefined") download(`${circuit.id}.${svg ? "svg" : "json"}`, body, svg ? "image/svg+xml" : "application/json");
      return svg ? ok({ ok: true, downloaded: `${circuit.id}.svg`, bytes: body.length }) : body;
    },
  },
];

export function download(name: string, body: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
