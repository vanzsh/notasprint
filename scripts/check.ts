// Self-check: runs the P0 demo flow through the WebMCP tool executors and asserts the outcome.
// Usage: pnpm check
import assert from "node:assert/strict";
import { tools } from "../src/lib/tools";
import { getState, commit } from "../src/lib/store";
import { moveTurn, setLocks } from "../src/lib/moves";
import { CIRCUITS } from "../src/lib/circuits";
import { analyze, buildGeometry } from "../src/lib/circuit";

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
console.log("OK");
