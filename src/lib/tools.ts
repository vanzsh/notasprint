// WebMCP tool surface. Tools describe design intent (sectors, overtaking zones, locks, inspirations) — never mouse clicks.
import { ARCHETYPE_IDS, ARCHETYPES, resolveArchetype } from "./archetypes";
import { buildGeometry, fmtLap, type Analysis, type Circuit } from "./circuit";
import { CIRCUITS } from "./circuits";
import { applyDesignMove, applyInspiration, DESIGN_MOVES, editTurns, LockedError, reshapeSector, SECTOR_INTENTS, setLocks, type Intensity, type TurnEdit } from "./moves";
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
const inspirationParam = {
  type: "string", enum: [...ARCHETYPE_IDS],
  description: "Design inspiration to apply. Reference phrases such as 'Monza-style' resolve to the matching id and mean its characteristics, never a real-world layout.",
};
const r1 = (x: number) => Math.round(x * 10) / 10;

// Archetypes as the agent sees them: compact in every listing, full detail in analyze_circuit.
const inspirations = (full: boolean) =>
  ARCHETYPES.map((a) => ({
    id: a.id, name: a.name, summary: a.summary, aliases: a.aliases,
    ...(full ? { traits: a.traits, what_applying_does: a.interpretation, score_tendencies: a.tendencies, example_request: a.examplePrompt } : {}),
  }));
const inspiration = (v: unknown) => {
  const a = resolveArchetype(String(v ?? ""));
  if (!a) throw new Error(`Unknown design inspiration "${v}". Use one of: ${ARCHETYPE_IDS.join(", ")}.`);
  return a;
};
const INSPIRATION_NOTE = "Design inspirations describe characteristics to apply to the live circuit. They never load or reproduce a real-world layout.";

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
    description: "Read the live circuit exactly as the designer sees it: every turn (position in metres, radius, sector, apex/entry speed, braking drop, approach straight, overtaking score, lock state), sector summaries, scores and warnings, plus the available design inspirations (high-speed, street-technical, flowing-technical) and reference layouts. Coordinates: metres, +x east, +y south; the lap runs Turn 1 → N; start/finish sits on the straight from the last turn into Turn 1. Call this first and again after the human edits something.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const { circuit: c, analysis: a } = getState();
      return ok({
        ...summary(c, a),
        layout_example_of: c.inspiration ?? "mixed",
        design_inspirations: inspirations(false),
        design_inspiration_note: `${INSPIRATION_NOTE} Apply one with reshape_sector (inspiration) for a sector or apply_design_inspiration for the whole circuit; analyze_circuit lists traits and what each does.`,
        reference_circuits: CIRCUITS.map((r) => ({ id: r.id, name: r.name, tagline: r.tagline, example_of: r.inspiration ?? "mixed" })),
      });
    },
  },
  {
    name: "analyze_circuit",
    description: "Deterministic circuit design analysis with explanations: what makes each score what it is, where the strong overtaking opportunities are (heavy braking after a long approach), which turns are the best candidates to become one, sector character, constraints, and the design inspirations — their traits, aliases, what applying each does and which scores it moves. Use it to decide what to change and to verify a change achieved the goal.",
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
        layout_example_of: c.inspiration ?? "mixed",
        design_inspirations: inspirations(true),
        design_inspiration_note: `${INSPIRATION_NOTE} Sector scope: reshape_sector with inspiration. Whole circuit: apply_design_inspiration. Locked turns are always kept; the profile is applied around them.`,
        design_guidance: [
          "Keep total length in the brief (e.g. below 6000 m) — removing a shallow turn or chicane shortens; hairpin loops add ~400 m.",
          "Locked turns must keep their exact position and radius; change neighbours or insert turns on adjacent straights instead.",
          "To move a sector or the circuit toward a named character (high-speed, street, flowing), apply a design inspiration; the profile decides the geometry.",
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
    description: "Reshape a whole sector, respecting locked turns. Give either an intent — faster (open radii, remove kinks at strong), more_technical (tighten radii and insert a chicane on the sector's longest straight; esses too at strong), more_overtaking (turn the best candidate into a heavy braking zone) — or a design inspiration (high-speed, street-technical, flowing-technical), which applies that archetype's whole set of characteristics to the sector. The tool decides the geometry; you decide the intent.",
    inputSchema: {
      type: "object",
      properties: {
        sector: { type: "integer", enum: [1, 2, 3] },
        intent: { type: "string", enum: [...SECTOR_INTENTS], description: "Single-axis change. Omit when giving an inspiration." },
        inspiration: { ...inspirationParam, description: `${inspirationParam.description} Takes precedence over intent.` },
        intensity,
        reason: { type: "string", description: "One short sentence shown to the designer." },
      },
      required: ["sector"],
    },
    execute: async ({ sector, intent, inspiration: insp, intensity, reason }) =>
      run(() => {
        const s = Number(sector) as 1 | 2 | 3;
        if (insp) {
          const a = inspiration(insp);
          const r = applyInspiration(getState().circuit, a.id, s, intensity as Intensity);
          return afterWrite(commit(r.circuit, { source: "agent", changed: r.changed, label: (reason as string) || `${a.name} · S${s}` }).text);
        }
        if (!intent) throw new Error(`Give an intent (${SECTOR_INTENTS.join(", ")}) or an inspiration (${ARCHETYPE_IDS.join(", ")}).`);
        const r = reshapeSector(getState().circuit, s, intent as (typeof SECTOR_INTENTS)[number], intensity as Intensity);
        return afterWrite(commit(r.circuit, { source: "agent", changed: r.changed, label: (reason as string) || `Sector ${sector} ${String(intent).replace(/_/g, " ")}` }).text);
      }),
  },
  {
    name: "apply_design_inspiration",
    description: "Apply a design inspiration to the whole circuit or one sector, respecting locked turns. high-speed: open radii around the existing braking zones, drop shallow kinks, and make the corner after the longest approach a heavy braking zone. street-technical: tighten radii and insert a tight chicane on the longest straight. flowing-technical: pull radii into the 70–140 m rhythm band and insert gentle linked esses on the longest straight. The start/finish straight is always kept; locked turns are designed around. Returns a receipt and the new circuit state.",
    inputSchema: {
      type: "object",
      properties: {
        inspiration: inspirationParam,
        sector: { type: "integer", enum: [1, 2, 3], description: "Limit the change to one sector. Omit for the whole circuit." },
        intensity,
        reason: { type: "string", description: "One short sentence shown to the designer, e.g. 'High-speed character for Sector 2'." },
      },
      required: ["inspiration"],
    },
    execute: async ({ inspiration: insp, sector, intensity, reason }) =>
      run(() => {
        const a = inspiration(insp);
        const scope = sector === undefined || sector === null ? "circuit" : (Number(sector) as 1 | 2 | 3);
        const r = applyInspiration(getState().circuit, a.id, scope, intensity as Intensity);
        return afterWrite(commit(r.circuit, { source: "agent", changed: r.changed, label: (reason as string) || `${a.name} · ${scope === "circuit" ? "circuit" : `S${scope}`}` }).text);
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
          items: { type: "object", properties: { turn: { type: "integer" }, x: { type: "number" }, y: { type: "number" }, radius: { type: "number", description: "Corner radius in metres" }, name: { type: "string" } }, required: ["turn"] },
        },
        reason: { type: "string" },
      },
      required: ["edits"],
    },
    execute: async ({ edits, reason }) =>
      run(() => {
        const norm = (edits as (TurnEdit & { radius_m?: number })[]).map(({ radius_m, ...e }) => ({ ...e, radius: e.radius ?? radius_m }));
        const r = editTurns(getState().circuit, norm);
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
