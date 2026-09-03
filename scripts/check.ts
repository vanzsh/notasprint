// Self-check: runs the P0 demo flow through the WebMCP tool executors and asserts the outcome.
// Usage: pnpm check
import assert from "node:assert/strict";
import { tools } from "../src/lib/tools";
import { getState, commit } from "../src/lib/store";
import { applyInspiration, moveTurn, setLocks, type Intensity } from "../src/lib/moves";
import { CIRCUITS } from "../src/lib/circuits";
import { analyze, buildGeometry } from "../src/lib/circuit";
import { ARCHETYPE_IDS, ARCHETYPES, resolveArchetype } from "../src/lib/archetypes";

const call = async (name: string, input: Record<string, unknown> = {}) => {
  const t = tools.find((x) => x.name === name)!;
  const out = JSON.parse(await t.execute(input));
  if (out.ok === false) throw new Error(`${name}: ${out.error}`);
  return out;
};

// Every reference circuit analyzes cleanly.
for (const c of CIRCUITS) {
  const a = analyze(c);
  assert.ok(a.length > 3000 && a.length < 6000, `${c.name} length ${a.length}`);
  assert.ok(a.lapTime > 55 && a.lapTime < 110, `${c.name} lap ${a.lapTime}`);
  assert.ok(buildGeometry(c.turns).path.startsWith("M"));
  assert.ok(!a.warnings.some((w) => w.includes("clamped")), `${c.name}: ${a.warnings.join(" | ")}`);
}

// Prompt 1: "Make this circuit more raceable: ≥3 strong overtaking opportunities, faster Sector 3, below 6 km."
let s = await call("analyze_circuit");
console.log("start", s.length_m, "m", s.scores, "strong:", s.strong_overtaking_turns);
assert.ok(s.strong_overtaking_turns.length < 3, "demo needs headroom on overtaking");
await call("reshape_sector", { sector: 3, intent: "faster", reason: "Faster Sector 3" });
let guard = 0;
while (getState().analysis.overtakingOpportunities.length < 3 && guard++ < 4) {
  const a = await call("analyze_circuit");
  const cand = a.turns.filter((t: { overtaking_score: number; type: string; locked?: boolean }) => t.overtaking_score < 70 && t.type !== "kink" && !t.locked).sort((p: { approach_straight_m: number }, q: { approach_straight_m: number }) => q.approach_straight_m - p.approach_straight_m)[0];
  await call("apply_design_move", { move: "create_overtaking_zone", turn: cand.turn, reason: `Braking zone into T${cand.turn}` });
}
s = await call("get_circuit");
console.log("after prompt 1", s.length_m, "m", s.scores, "strong:", s.strong_overtaking_turns, "receipt:", getState().receipt?.text);
assert.ok(s.strong_overtaking_turns.length >= 3, "three strong overtaking opportunities");
assert.ok(s.length_m < 6000, "below 6 km");

// Human: moves Turn 7 and locks it.
const t7 = getState().circuit.turns[6];
commit(moveTurn(getState().circuit, t7.id, t7.x + 60, t7.y - 40), { source: "human", changed: [t7.id] });
commit(setLocks(getState().circuit, [7], true).circuit, { source: "human" });
const lockedT7 = { ...getState().circuit.turns[6] };

// Prompt 2: "Keep my Turn 7 exactly where it is; make the rest of Sector 2 more technical around it."
s = await call("get_circuit");
assert.deepEqual(s.locked_turns, [7]);
const before = getState().analysis.sectors[1];
await call("reshape_sector", { sector: 2, intent: "more_technical", intensity: "moderate", reason: "Technical Sector 2 around T7" });
const lockedNow = getState().circuit.turns.findIndex((t) => t.id === lockedT7.id) + 1;
const bad = await tools.find((t) => t.name === "edit_turns")!.execute({ edits: [{ turn: lockedNow, radius: 10 }] });
assert.equal(JSON.parse(bad).ok, false, "locked turn rejected");
const after = getState();
const t7After = after.circuit.turns.find((t) => t.id === lockedT7.id)!;
assert.deepEqual([t7After.x, t7After.y, t7After.radius, t7After.locked], [lockedT7.x, lockedT7.y, lockedT7.radius, true], "T7 preserved");
assert.ok(after.analysis.scores.technicality > 0 && after.analysis.sectors[1].turns > before.turns, "Sector 2 gained turns");
console.log("after prompt 2", Math.round(after.analysis.length), "m", after.analysis.scores, "receipt:", after.receipt?.text);

// Export + undo
const json = JSON.parse(await tools.find((t) => t.name === "export_circuit")!.execute({ format: "json" }));
assert.equal(json.circuit.turns.length, after.circuit.turns.length);
await call("undo_changes", { steps: 1 });
assert.equal(getState().analysis.sectors[1].turns, before.turns);
console.log("P0 OK");

// ---- Design inspirations ----

// Exactly three archetypes with stable ids, each fully described for an agent.
assert.deepEqual(ARCHETYPES.map((a) => a.id), ["high-speed", "street-technical", "flowing-technical"]);
for (const a of ARCHETYPES) assert.ok(a.name && a.summary && a.traits.length >= 4 && a.aliases.length >= 3 && a.interpretation && a.examplePrompt, `${a.id} described`);
assert.equal(resolveArchetype("Monza-style")?.id, "high-speed");
assert.equal(resolveArchetype("monaco inspired")?.id, "street-technical");
assert.equal(resolveArchetype("Suzuka style flow")?.id, "flowing-technical");
assert.equal(resolveArchetype("technical"), undefined, "ambiguous phrases are not guessed");

// Tool surface: existing names stay, read tools expose the archetypes and tag the reference layouts.
const names = tools.map((t) => t.name);
for (const n of ["get_circuit", "analyze_circuit", "apply_design_move", "reshape_sector", "edit_turns", "set_turn_locks", "load_reference_circuit", "undo_changes", "export_circuit", "apply_design_inspiration"]) assert.ok(names.includes(n), n);
await call("load_reference_circuit", { circuit_id: "silver-fields" });
const gc = await call("get_circuit");
assert.deepEqual(gc.design_inspirations.map((d: { id: string }) => d.id), [...ARCHETYPE_IDS]);
assert.ok(gc.design_inspirations.every((d: { aliases: string[]; summary: string }) => d.aliases.length >= 3 && d.summary), "aliases and summaries visible to the agent");
assert.deepEqual(gc.reference_circuits.map((r: { example_of: string }) => r.example_of), ["mixed", "high-speed", "street-technical", "flowing-technical"]);
const an = await call("analyze_circuit");
assert.ok(an.design_inspirations.every((d: Record<string, unknown>) => (d.traits as string[]).length && d.what_applying_does && d.score_tendencies && d.example_request), "full descriptions in analyze_circuit");

// Every archetype × scope × intensity applies to every reference circuit: deterministic, no clamped radii, sane length.
for (const c of CIRCUITS) for (const id of ARCHETYPE_IDS) for (const scope of [1, 2, 3, "circuit"] as const) for (const intensity of ["subtle", "moderate", "strong"] as Intensity[]) {
  const r = applyInspiration(c, id, scope, intensity);
  const a = analyze(r.circuit);
  assert.ok(r.changed.length > 0, `${c.name} ${id} ${scope} ${intensity} changed something`);
  assert.ok(!a.warnings.some((w) => w.includes("clamped")), `${c.name} ${id} ${scope} ${intensity}: ${a.warnings.join(" | ")}`);
  assert.ok(a.length > 2500 && a.length < 6500, `${c.name} ${id} ${scope} ${intensity} length ${a.length}`);
  assert.deepEqual(applyInspiration(c, id, scope, intensity).circuit.turns.map((t) => [t.x, t.y, t.radius]), r.circuit.turns.map((t) => [t.x, t.y, t.radius]), "deterministic");
}
// Archetypes move their scores the way they say they do (whole circuit, moderate, on the default layout).
const base = analyze(CIRCUITS[0]).scores;
for (const a of ARCHETYPES) {
  const s = analyze(applyInspiration(CIRCUITS[0], a.id, "circuit").circuit).scores;
  for (const k of ["highSpeed", "technicality", "flow"] as const) if (a.tendencies[k] !== "neutral") assert.ok(a.tendencies[k] === "up" ? s[k] > base[k] : s[k] < base[k], `${a.id} ${k} ${base[k]} → ${s[k]} should go ${a.tendencies[k]}`);
}

// Locks: applied around a locked turn, never through it; a fully locked scope is refused.
const sf = CIRCUITS[0];
for (const id of ARCHETYPE_IDS) {
  const locked = setLocks(sf, [7], true).circuit, t7 = locked.turns[6];
  const r = applyInspiration(locked, id, 2, "strong");
  const kept = r.circuit.turns.find((t) => t.id === t7.id)!;
  assert.deepEqual([kept.x, kept.y, kept.radius, kept.locked], [t7.x, t7.y, t7.radius, true], `${id} keeps locked T7`);
  assert.ok(r.changed.length > 0 && !r.changed.includes(t7.id), `${id} changes S2 around T7`);
}
assert.throws(() => applyInspiration(setLocks(sf, sf.turns.map((t, i) => (t.sector === 2 ? i + 1 : 0)).filter(Boolean), true).circuit, "high-speed", 2), /locked/);

// Upgraded demo through the tools. Prompt 1: "Make Sector 3 more flowing."
const p0 = getState().analysis;
let ins = await call("reshape_sector", { sector: 3, inspiration: "flowing-technical", reason: "Flowing Sector 3" });
assert.ok(ins.state.scores.flow > p0.scores.flow && getState().analysis.sectors[2].turns > p0.sectors[2].turns, "Sector 3 gained flow and linked corners");
console.log("flowing S3", ins.receipt);
// Human moves Turn 7 and locks it.
const h7 = getState().circuit.turns[6];
commit(moveTurn(getState().circuit, h7.id, h7.x + 60, h7.y - 40), { source: "human", changed: [h7.id] });
commit(setLocks(getState().circuit, [7], true).circuit, { source: "human" });
const kept7 = { ...getState().circuit.turns[6] };
const preserved = () => { const t = getState().circuit.turns.find((x) => x.id === kept7.id)!; return t.x === kept7.x && t.y === kept7.y && t.radius === kept7.radius && t.locked === true; };
// Prompt 2: "Keep Turn 7 exactly as it is. Move Sector 2 toward the high-speed profile and create another overtaking opportunity." (alias on purpose)
const strongBefore = getState().analysis.overtakingOpportunities.length;
ins = await call("reshape_sector", { sector: 2, inspiration: "Monza-style", reason: "High-speed Sector 2 around your Turn 7" });
assert.ok(preserved(), "T7 preserved through high-speed S2");
assert.ok(ins.state.strong_overtaking_turns.length > strongBefore, "Sector 2 gained an overtaking opportunity");
assert.deepEqual(ins.state.locked_turns, [7]);
console.log("high-speed S2", ins.receipt);
// Whole circuit through apply_design_inspiration, still around the lock; a direct edit of the lock is refused.
ins = await call("apply_design_inspiration", { inspiration: "street-technical", intensity: "subtle", reason: "Street character" });
assert.ok(preserved(), "T7 preserved through whole-circuit street");
const lockedNo = getState().circuit.turns.findIndex((t) => t.id === kept7.id) + 1;
assert.equal(JSON.parse(await tools.find((t) => t.name === "edit_turns")!.execute({ edits: [{ turn: lockedNo, radius: 10 }] })).ok, false, "locked turn rejected");
for (const bad of [{ inspiration: "technical" }, { sector: 9, inspiration: "high-speed" }]) assert.equal(JSON.parse(await tools.find((t) => t.name === "apply_design_inspiration")!.execute(bad)).ok, false, JSON.stringify(bad));
assert.equal(JSON.parse(await tools.find((t) => t.name === "reshape_sector")!.execute({ sector: 2 })).ok, false, "intent or inspiration required");
// Undo the two agent writes made after the lock (shared history: agent and human steps interleave) and export.
const streetState = getState().circuit;
await call("undo_changes", { steps: 2 });
assert.equal(getState().circuit.turns.length, streetState.turns.length - 2, "street chicane undone");
assert.equal(getState().analysis.overtakingOpportunities.length, strongBefore, "high-speed S2 undone");
assert.ok(preserved(), "T7 still locked after undo");
const ex = JSON.parse(await tools.find((t) => t.name === "export_circuit")!.execute({ format: "json" }));
assert.equal(ex.circuit.turns.length, getState().circuit.turns.length);
await call("load_reference_circuit", { circuit_id: "temple-of-speed" });
assert.equal(JSON.parse(await tools.find((t) => t.name === "export_circuit")!.execute({ format: "json" })).circuit.inspiration, "high-speed", "export carries the layout's archetype");
console.log("OK");
