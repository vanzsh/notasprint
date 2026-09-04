// Self-check: runs the P0 demo flow through the WebMCP tool executors and asserts the outcome.
// Usage: pnpm check
import assert from "node:assert/strict";
import { tools } from "../src/lib/tools";
import { clearBrief, commit, getState, redo, restoreVersion, saveVersion, setBrief, undo } from "../src/lib/store";
import { applyDesignMove, applyInspiration, deleteTurn, moveTurn, setLocks, type Intensity } from "../src/lib/moves";
import { CIRCUITS, REFERENCES } from "../src/lib/circuits";
import { analyze, buildGeometry, fingerprint, lapPath, startFinish } from "../src/lib/circuit";
import { ARCHETYPE_IDS, ARCHETYPES, resolveArchetype } from "../src/lib/archetypes";
import { compareSimulations, simulate } from "../src/lib/simulation";
import { briefForAgent, evaluateBrief } from "../src/lib/constraints";
import { compareSnapshots, deserializeVersions, serializeVersions } from "../src/lib/versions";
import { generateCircuit } from "../src/lib/generate";
import { resolveSeries, SERIES, SERIES_IDS } from "../src/lib/series";
import { exportSVG, EXPORT_STYLES } from "../src/lib/export";

const call = async (name: string, input: Record<string, unknown> = {}) => {
  const t = tools.find((x) => x.name === name)!;
  const out = JSON.parse(await t.execute(input));
  if (out.ok === false) throw new Error(`${name}: ${out.error}`);
  return out;
};

// Every reference circuit analyzes cleanly, inside its discipline's length band, with a plausible lap.
const band = (series: string) => SERIES[series as keyof typeof SERIES].lengthBand;
for (const c of CIRCUITS) {
  const a = analyze(c), [lo, , , hi] = band(c.series);
  assert.ok(a.length > lo && a.length < hi, `${c.name} length ${a.length} outside ${lo}–${hi}`);
  assert.ok(a.lapTime > 50 && a.lapTime < 110, `${c.name} lap ${a.lapTime}`);
  assert.ok(buildGeometry(c.turns).path.startsWith("M"));
  assert.ok(!a.warnings.some((w) => w.includes("clamped") || w.includes("tighter")), `${c.name}: ${a.warnings.join(" | ")}`);
}
// The Reference Library: exactly three per motorsport, each with a location and three character words, ids unique.
for (const s of SERIES_IDS) {
  assert.equal(REFERENCES[s].length, 3, `${s} has three references`);
  for (const r of REFERENCES[s]) assert.ok(r.location && r.character?.length === 3 && r.series === s, `${r.id} described`);
}
assert.equal(new Set(CIRCUITS.map((c) => c.id)).size, CIRCUITS.length, "circuit ids unique");
assert.equal(CIRCUITS[0].id, "silver-fields", "Silver Fields stays the default workspace");

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
assert.deepEqual(Object.keys(gc.reference_library), [...SERIES_IDS], "library grouped by motorsport");
assert.ok(gc.reference_library.f1.some((r: { id: string }) => r.id === "monza") && gc.motorsport.id === "f1" && gc.reference.kind === "original", "motorsport and origin visible to the agent");
const an = await call("analyze_circuit");
assert.ok(an.design_inspirations.every((d: Record<string, unknown>) => (d.traits as string[]).length && d.what_applying_does && d.score_tendencies && d.example_request), "full descriptions in analyze_circuit");

// Every archetype × scope × intensity applies to every reference circuit: deterministic, no clamped radii, sane length.
for (const c of CIRCUITS) for (const id of ARCHETYPE_IDS) for (const scope of [1, 2, 3, "circuit"] as const) for (const intensity of ["subtle", "moderate", "strong"] as Intensity[]) {
  const r = applyInspiration(c, id, scope, intensity);
  const a = analyze(r.circuit), [lo, , , hi] = band(c.series);
  assert.ok(r.changed.length > 0, `${c.name} ${id} ${scope} ${intensity} changed something`);
  assert.ok(!a.warnings.some((w) => w.includes("clamped")), `${c.name} ${id} ${scope} ${intensity}: ${a.warnings.join(" | ")}`);
  assert.ok(a.length > lo * 0.85 && a.length < hi, `${c.name} ${id} ${scope} ${intensity} length ${a.length}`);
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
await call("load_reference_circuit", { circuit_id: "monza" });
assert.equal(JSON.parse(await tools.find((t) => t.name === "export_circuit")!.execute({ format: "json" })).circuit.inspiration, "high-speed", "export carries the layout's archetype");
console.log("inspirations OK");

// ---- Motorsports, references and custom concepts ----
assert.deepEqual([resolveSeries("Formula E")?.id, resolveSeries("moto gp")?.id, resolveSeries("bikes")?.id, resolveSeries("F1")?.id, resolveSeries("rally")], ["fe", "motogp", "motogp", "f1", undefined]);
// Loading a reference sets the motorsport; the analysis reads it with that discipline's vehicle model.
let ref = await call("load_reference_circuit", { circuit_id: "mugello" });
assert.ok(ref.state.motorsport.id === "motogp" && ref.state.motorsport.vehicle === "bike" && ref.state.reference.kind === "reference" && ref.state.reference.location === "Mugello, Italy", JSON.stringify(ref.state.motorsport));
assert.ok(getState().analysis.topSpeed > 300, "MotoGP vehicle model reaches a bike's top speed on Mugello's straight");
ref = await call("load_reference_circuit", { circuit_id: "tokyo" });
assert.ok(ref.state.motorsport.id === "fe" && getState().analysis.topSpeed < 280, "Formula E model tops out lower");
assert.ok(!getState().analysis.warnings.some((w) => w.includes("short")), "a 2.8 km Formula E layout is not flagged as short");
// The same layout reads differently per discipline: Monaco for F1 vs Formula E.
const monacoF1 = analyze(CIRCUITS.find((c) => c.id === "monaco")!), monacoFE = analyze(CIRCUITS.find((c) => c.id === "monaco-fe")!);
assert.ok(monacoF1.lapTime < monacoFE.lapTime && monacoF1.topSpeed > monacoFE.topSpeed, "Formula E is slower around the same street layout");
// Custom concepts: seeded, deterministic, discipline-shaped, clean, and genuinely different between seeds.
for (const s of SERIES_IDS) {
  const [lo, , , hi] = band(s);
  const shapes = new Set<string>();
  for (let seed = 1; seed <= 25; seed++) {
    const c = generateCircuit(s, seed), g = buildGeometry(c.turns), a = analyze(c, g);
    assert.ok(a.length > lo && a.length < hi, `${s} seed ${seed} length ${a.length}`);
    assert.equal(g.crossings, 0, `${s} seed ${seed} does not cross itself`);
    assert.ok(!a.warnings.some((w) => w.includes("clamped") || w.includes("tighter")), `${s} seed ${seed}: ${a.warnings.join(" | ")}`);
    assert.ok(a.turnCount >= 6, `${s} seed ${seed} has real corners (${a.turnCount})`);
    assert.deepEqual(generateCircuit(s, seed).turns, c.turns, "deterministic for a seed");
    shapes.add(`${c.turns.length}:${c.turns.map((t) => Math.round(t.radius / 10)).join(",")}`);
  }
  assert.ok(shapes.size >= 24, `${s}: seeds give different layouts (${shapes.size}/25 distinct)`);
}
const f1Avg = (k: "highSpeed" | "technicality") => Array.from({ length: 20 }, (_, i) => analyze(generateCircuit("f1", i + 1)).scores[k]).reduce((a, b) => a + b, 0) / 20;
const feAvg = (k: "highSpeed" | "technicality") => Array.from({ length: 20 }, (_, i) => analyze(generateCircuit("fe", i + 1)).scores[k]).reduce((a, b) => a + b, 0) / 20;
assert.ok(f1Avg("highSpeed") > feAvg("highSpeed") && feAvg("technicality") > f1Avg("technicality"), "Formula 1 concepts read faster, Formula E concepts more technical");
// Through the tool: the demo prompt "Create a custom MotoGP circuit", then the usual loop around a human lock.
const cc = await call("create_custom_circuit", { motorsport: "MotoGP", seed: 11 });
assert.ok(cc.state.motorsport.id === "motogp" && cc.state.reference.kind === "custom" && cc.state.reference.seed === 11 && getState().circuit.custom === 11, "custom MotoGP concept loaded");
const again = await call("create_custom_circuit", { motorsport: "motogp", seed: 11 });
assert.deepEqual(again.state.turns.map((t: { x: number; y: number }) => [t.x, t.y]), cc.state.turns.map((t: { x: number; y: number }) => [t.x, t.y]), "same seed reproduces the concept");
assert.equal(JSON.parse(await tools.find((t) => t.name === "create_custom_circuit")!.execute({ motorsport: "rally" })).ok, false, "unknown motorsport refused");
await call("reshape_sector", { sector: 2, intent: "faster", reason: "Faster, flowing Sector 2" });
const c7 = getState().circuit.turns[6];
commit(moveTurn(getState().circuit, c7.id, c7.x + 40, c7.y - 30), { source: "human", changed: [c7.id] });
commit(setLocks(getState().circuit, [7], true).circuit, { source: "human" });
const kc7 = { ...getState().circuit.turns[6] };
const around = await call("reshape_sector", { sector: 2, intent: "more_technical", reason: "Redesign Sector 2 around Turn 7" });
const kept = around.state.turns.find((t: { locked?: boolean }) => t.locked);
assert.deepEqual([kept.x, kept.y, kept.radius_m], [kc7.x, kc7.y, kc7.radius], "locked T7 preserved on a generated MotoGP circuit");
const simGen = await call("run_simulation", { seed: 3 });
assert.ok(simGen.simulation.findings.length > 0 && !simGen.simulation.findings.some((f: { text: string }) => /\bcars?\b/i.test(f.text)), "MotoGP findings talk about bikes, not cars");
// Export: every drawing style renders for every discipline; the technical style carries the discipline and scale bar.
for (const c of [getState().circuit, ...SERIES_IDS.map((s) => REFERENCES[s][0])]) for (const style of EXPORT_STYLES) {
  const svg = exportSVG(c, analyze(c), buildGeometry(c.turns), style, { transparent: style === "minimal" });
  assert.ok(svg.startsWith("<svg") && svg.includes('width="2400"') && (style === "minimal" ? !svg.includes("<text") && !svg.includes("<rect") : svg.includes("<text")), `${c.id} ${style} export`);
}
assert.ok(exportSVG(REFERENCES.motogp[0], analyze(REFERENCES.motogp[0]), buildGeometry(REFERENCES.motogp[0].turns), "technical").includes("MotoGP"), "technical export names the motorsport");
console.log("motorsports OK ·", cc.receipt);

// ---- Simulation ----

// The lap path is the real centreline: exact length, S/F at s = 0, every arc boundary on its fillet tangent point.
for (const c of CIRCUITS) {
  const g = buildGeometry(c.turns), path = lapPath(g), sf = startFinish(g);
  assert.ok(Math.abs(path.length - g.length) < 1e-6 && Math.hypot(path.at(0).x - sf.x, path.at(0).y - sf.y) < 1e-6, `${c.name} lap path`);
  let s = g.corners[g.corners.length - 1].straightAfter / 2;
  for (const k of g.corners) {
    assert.ok(Math.hypot(path.at(s).x - k.start.x, path.at(s).y - k.start.y) < 1e-3, `${c.name} arc start`);
    s += k.arcLength;
    assert.ok(Math.hypot(path.at(s).x - k.end.x, path.at(s).y - k.end.y) < 1e-3, `${c.name} arc end`);
    s += k.straightAfter;
  }
}
// Deterministic for a seed, different for another; read-only on the circuit; blind to locks.
const frozen = JSON.parse(JSON.stringify(CIRCUITS[0])), frozenJson = JSON.stringify(frozen);
const simA = simulate(frozen, { seed: 7 }), simB = simulate(frozen, { seed: 7 }), simC = simulate(frozen, { seed: 8 });
assert.deepEqual(simA, simB, "seeded runs are identical");
assert.notDeepEqual(simA.totals, simC.totals, "a different seed changes the outcome");
assert.equal(JSON.stringify(frozen), frozenJson, "simulation does not mutate the circuit");
const lockedAll = setLocks(CIRCUITS[0], CIRCUITS[0].turns.map((_, i) => i + 1), true).circuit;
assert.deepEqual(simulate(lockedAll, { seed: 7 }).totals, simA.totals, "locks are irrelevant to a read-only simulation");
assert.equal(simA.fingerprint, fingerprint(lockedAll), "fingerprint ignores locks and names");
// Structured, sane output on every reference layout.
for (const c of CIRCUITS) {
  const r = simulate(c, { seed: 1 });
  assert.equal(r.params.cars * r.params.laps, 60);
  assert.ok(r.frames.s.length > 100 && r.frames.s.every((f) => f.length === 12) && r.frames.s[0].every((s) => !Number.isNaN(s)) && r.frames.s[r.frames.s.length - 1].some((s) => Number.isNaN(s)), `${c.name} frames start with every car on track and end with finishers gone`);
  assert.ok(r.totals.avgGapS > 0 && r.totals.spreadS > 0 && r.totals.lapTimeS > 50, `${c.name} totals ${JSON.stringify(r.totals)}`);
  for (const t of r.turns) assert.ok(t.arrivals <= 72 && t.congestion <= t.arrivals && t.packed <= t.arrivals && t.overtakes <= t.congestion && t.contacts <= t.congestion, `${c.name} T${t.turn} ${JSON.stringify(t)}`);
  assert.ok(r.findings.length > 0 && r.findings.every((f) => f.text && f.turns.every((n) => n >= 1 && n <= c.turns.length)), `${c.name} findings`);
  assert.ok(r.limitations.length >= 3 && r.sectors.length === 3);
  assert.equal(r.totals.strongZones, analyze(c).overtakingOpportunities.length);
}
assert.ok(simulate(CIRCUITS[0], { seed: 1, aggression: 0.9 }).totals.overtakes > simulate(CIRCUITS[0], { seed: 1, aggression: 0.1 }).totals.overtakes, "aggression produces more passes");
assert.ok(simulate(CIRCUITS[2], { seed: 1 }).totals.lapTimeS !== simA.totals.lapTimeS, "a different circuit gives a different lap");
// Simulation → redesign: the worst bunching finding names a turn; a braking zone there lets more held-up cars through.
const simBase = simulate(CIRCUITS[0], { seed: 1 });
const worst = simBase.findings.find((f) => f.kind === "bunching")!;
assert.ok(worst, "fixture has a bunching finding");
const tn = worst.turns[0], tid = CIRCUITS[0].turns[tn - 1].id;
const fixed = applyDesignMove(CIRCUITS[0], "create_overtaking_zone", tn).circuit;
const simAfter = simulate(fixed, { seed: 1 });
const b = simBase.turns[tn - 1], a2 = simAfter.turns.find((t) => t.id === tid)!;
assert.ok(a2.overtakes / Math.max(1, a2.congestion) > b.overtakes / Math.max(1, b.congestion), `pass ratio at T${tn} improved: ${b.overtakes}/${b.congestion} → ${a2.overtakes}/${a2.congestion}`);
assert.ok(!simAfter.findings.some((f) => f.kind === "bunching" && f.turns.includes(a2.turn)), "bunching finding cleared at the redesigned turn");
const cmp = compareSimulations(simBase, simAfter);
assert.ok(cmp.comparable && cmp.summary.startsWith("Congestion") && cmp.rows.length === 5);
console.log("simulation OK ·", worst.text, "→", cmp.summary);

// ---- Design brief ----
const sf0 = CIRCUITS[0], an0 = analyze(sf0);
let rep = evaluateBrief({ minLength: 4000, maxLength: 6000, maxTurns: 18, minOvertaking: 1, minStraight: 800 }, sf0, an0);
assert.ok(rep.pass && rep.active === 5 && rep.results.find((r) => r.key === "minOvertaking")!.status === "near", "loose brief passes, exact minimum is near limit");
rep = evaluateBrief({ maxLength: 4000, minOvertaking: 3, profile: "street-technical" }, sf0, an0);
assert.deepEqual(rep.results.map((r) => r.status), ["fail", "fail", "fail"]);
assert.equal(rep.failed.length, 3);
assert.equal(evaluateBrief({ maxLength: 4700 }, sf0, an0).results[0].status, "near", "within 4 % of a bound is near");
assert.equal(evaluateBrief({ profile: "high-speed" }, CIRCUITS[1], analyze(CIRCUITS[1])).results[0].status, "pass", "Temple of Speed reads as high-speed");
assert.equal(evaluateBrief({ profile: "flowing-technical" }, CIRCUITS[3], analyze(CIRCUITS[3])).results[0].status, "near", "Figure Eight reads as flowing, just inside the band");
assert.equal(evaluateBrief({ profile: "street-technical" }, CIRCUITS[2], analyze(CIRCUITS[2])).results[0].status, "pass", "Street Crown reads as street");
const t7id = sf0.turns[6].id;
assert.equal(evaluateBrief({ preserve: [t7id] }, sf0, an0).results[0].status, "fail", "unlocked preserved turn fails");
assert.equal(evaluateBrief({ preserve: [t7id] }, setLocks(sf0, [7], true).circuit, an0).results[0].status, "pass", "locked preserved turn passes");
assert.equal(evaluateBrief({ preserve: [t7id] }, deleteTurn(sf0, 6).circuit, an0).results[0].actual, "Turn removed");
const agentBrief = briefForAgent({ maxTurns: 14, preserve: [t7id] }, sf0, an0);
assert.ok(agentBrief.active && agentBrief.constraints.preserve_turns[0] === 7 && agentBrief.status.length === 2 && agentBrief.summary.includes("keep T7"));
// Status follows the live circuit.
await call("load_reference_circuit", { circuit_id: "silver-fields" });
clearBrief();
setBrief({ maxTurns: 13 });
assert.equal(evaluateBrief(getState().brief, getState().circuit, getState().analysis).results[0].status, "near");
await call("apply_design_move", { move: "add_chicane_after", turn: 12 });
assert.equal(evaluateBrief(getState().brief, getState().circuit, getState().analysis).results[0].status, "fail", "adding turns fails the max-turns constraint");
let w = JSON.parse(await tools.find((t) => t.name === "apply_design_move")!.execute({ move: "remove_turn", turn: 13 }));
assert.ok(w.ok && w.design_brief && typeof w.design_brief.pass === "boolean", "write receipts carry brief status");
console.log("brief OK");

// ---- Versions ----
await call("load_reference_circuit", { circuit_id: "silver-fields" });
clearBrief();
getState().versions.splice(0); // fresh list for the checks below
const v1 = saveVersion("Initial concept");
assert.ok(v1.id === "v1" && v1.circuit.turns.length === 14 && v1.simulation === null);
await call("reshape_sector", { sector: 3, inspiration: "flowing-technical" });
assert.equal(v1.circuit.turns.length, 14, "a saved version is independent of later edits");
assert.equal(getState().circuit.turns.length, 17);
await call("run_simulation", { seed: 5 });
const v2 = saveVersion("Flowing Sector 3");
assert.ok(v2.id === "v2" && v2.simulation && !("frames" in v2.simulation), "version keeps a compact simulation");
const cmpV = compareSnapshots(v1, v2);
const turnsRow = cmpV.rows.find((r) => r.key === "turns")!;
assert.ok(turnsRow.a === String(v1.analysis.turnCount) && turnsRow.b === String(v2.analysis.turnCount) && cmpV.simulation === null && cmpV.summary.includes(`Turns ${turnsRow.a} → ${turnsRow.b}`), cmpV.summary);
restoreVersion("v1");
assert.equal(getState().circuit.turns.length, 14, "restore makes the version live");
assert.equal(undo(), 1); assert.equal(getState().circuit.turns.length, 17, "restore is an ordinary undoable commit");
assert.equal(redo(), 1); assert.equal(getState().circuit.turns.length, 14);
const round = deserializeVersions(serializeVersions(getState().versions));
assert.ok(round.length === 2 && round[1].analysis.turnCount === v2.analysis.turnCount && round[1].simulation?.totals.congestion === v2.simulation!.totals.congestion, "versions round-trip through storage without frames");
assert.deepEqual(deserializeVersions("not json"), []);
// Through the tools: list / save / compare / restore, and the loop's read side.
let vt = await call("design_versions", { action: "list" });
assert.equal(vt.versions.length, 2);
vt = await call("design_versions", { action: "save", name: "Restored concept" });
assert.equal(vt.version.id, "v3");
vt = await call("design_versions", { action: "compare", version_id: "v2" });
assert.ok(vt.comparison.rows.length > 5 && getState().compare === "v2", "compare answers and overlays on the canvas");
assert.equal(JSON.parse(await tools.find((t) => t.name === "design_versions")!.execute({ action: "restore", version_id: "v9" })).ok, false);
const sim1 = await call("run_simulation", { seed: 5 });
assert.ok(sim1.simulation.findings.length && sim1.simulation.turns.length === 14 && !("frames" in sim1.simulation) && sim1.before_after, "run_simulation is compact and compares to the previous run");
const gcs = await call("get_circuit");
assert.ok(gcs.simulation.available && gcs.simulation.stale === false && gcs.versions.count === 3 && gcs.design_brief.active === false);
w = JSON.parse(await tools.find((t) => t.name === "edit_turns")!.execute({ edits: [{ turn: 2, radius: 120 }] }));
assert.equal(w.simulation_stale, true, "a geometry change flags the last simulation as stale");
assert.equal((await call("analyze_circuit")).simulation.stale, true);
console.log("versions OK");
console.log("OK");
