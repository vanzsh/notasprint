// Design brief: a handful of measurable constraints evaluated continuously against the live circuit.
// Pure functions shared by the panel and the WebMCP tools. These are circuit design checks, not certification.
import { archetypeById, type ArchetypeId, type ScoreKey } from "./archetypes";
import { SCORE_LABEL, type Analysis, type Circuit } from "./circuit";

export type Brief = {
  minLength?: number; // metres
  maxLength?: number; // metres
  maxTurns?: number; // real corners (kinks excluded), as in the analysis
  minOvertaking?: number; // strong overtaking zones (turn score ≥ 70)
  minStraight?: number; // metres, longest straight
  profile?: ArchetypeId; // target design inspiration
  preserve?: string[]; // turn ids that must stay locked
};
export type ConstraintKey = keyof Brief;
export const CONSTRAINT_LABEL: Record<ConstraintKey, string> = {
  minLength: "Min length", maxLength: "Max length", maxTurns: "Max turns", minOvertaking: "Overtaking zones", minStraight: "Main straight", profile: "Profile", preserve: "Preserve",
};
/** Sensible starting values when a constraint is switched on. */
export const BRIEF_DEFAULTS = { minLength: 4000, maxLength: 6000, maxTurns: 18, minOvertaking: 3, minStraight: 800 } as const;

export type ConstraintStatus = "pass" | "near" | "fail";
export type ConstraintResult = { key: ConstraintKey; label: string; status: ConstraintStatus; actual: string; target: string; turnId?: string };
export type BriefReport = { results: ConstraintResult[]; active: number; passed: number; failed: string[]; pass: boolean };

export const isBriefEmpty = (b: Brief) => Object.values(b).every((v) => v === undefined || (Array.isArray(v) && v.length === 0));

const km = (m: number) => `${(m / 1000).toFixed(2)} km`;
const NEAR = 0.04; // within 4 % of a length bound reads as "near limit"

export function evaluateBrief(brief: Brief, circuit: Circuit, a: Analysis): BriefReport {
  const out: ConstraintResult[] = [];
  const row = (key: ConstraintKey, status: ConstraintStatus, actual: string, target: string, extra: Partial<ConstraintResult> = {}) => out.push({ key, label: CONSTRAINT_LABEL[key], status, actual, target, ...extra });
  if (brief.minLength !== undefined) row("minLength", a.length < brief.minLength ? "fail" : a.length < brief.minLength * (1 + NEAR) ? "near" : "pass", km(a.length), `≥ ${km(brief.minLength)}`);
  if (brief.maxLength !== undefined) row("maxLength", a.length > brief.maxLength ? "fail" : a.length > brief.maxLength * (1 - NEAR) ? "near" : "pass", km(a.length), `≤ ${km(brief.maxLength)}`);
  if (brief.maxTurns !== undefined) row("maxTurns", a.turnCount > brief.maxTurns ? "fail" : a.turnCount === brief.maxTurns ? "near" : "pass", `${a.turnCount} turns`, `≤ ${brief.maxTurns}`);
  if (brief.minOvertaking !== undefined) {
    const n = a.overtakingOpportunities.length;
    row("minOvertaking", n < brief.minOvertaking ? "fail" : n === brief.minOvertaking ? "near" : "pass", `${n} strong`, `≥ ${brief.minOvertaking}`);
  }
  if (brief.minStraight !== undefined) row("minStraight", a.longestStraight < brief.minStraight ? "fail" : a.longestStraight < brief.minStraight * (1 + NEAR) ? "near" : "pass", `${a.longestStraight} m`, `≥ ${brief.minStraight} m`);
  if (brief.profile) {
    const arch = archetypeById(brief.profile);
    if (arch) {
      const checks = (Object.keys(arch.scoreTargets) as ScoreKey[]).map((k) => {
        const { min, max } = arch.scoreTargets[k]!, s = a.scores[k];
        const status: ConstraintStatus = (min !== undefined && s < min) || (max !== undefined && s > max) ? "fail" : (min !== undefined && s < min + 5) || (max !== undefined && s > max - 5) ? "near" : "pass";
        return { status, actual: `${SCORE_LABEL[k]} ${s}`, target: `${SCORE_LABEL[k]} ${min !== undefined ? `≥ ${min}` : `≤ ${max}`}` };
      });
      const status: ConstraintStatus = checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "near") ? "near" : "pass";
      row("profile", status, checks.map((c) => c.actual).join(" · "), `${arch.name}: ${checks.map((c) => c.target).join(", ")}`);
    }
  }
  for (const id of brief.preserve ?? []) {
    const i = circuit.turns.findIndex((t) => t.id === id);
    if (i < 0) row("preserve", "fail", "Turn removed", "kept and locked", { label: "Preserve turn", turnId: id });
    else row("preserve", circuit.turns[i].locked ? "pass" : "fail", circuit.turns[i].locked ? "Locked" : "Unlocked", "locked", { label: `Preserve T${i + 1}`, turnId: id });
  }
  const failed = out.filter((r) => r.status === "fail").map((r) => `${r.label} (${r.actual}, target ${r.target})`);
  return { results: out, active: out.length, passed: out.length - failed.length, failed, pass: failed.length === 0 };
}

/** One line for receipts and listings: "5.0–5.8 km · ≤ 18 turns · ≥ 3 zones · ≥ 800 m straight · Flowing / Technical · keep T7". */
export function describeBrief(brief: Brief, circuit: Circuit) {
  const parts: string[] = [];
  if (brief.minLength !== undefined || brief.maxLength !== undefined) parts.push(`${brief.minLength !== undefined ? (brief.minLength / 1000).toFixed(1) : "…"}–${brief.maxLength !== undefined ? (brief.maxLength / 1000).toFixed(1) : "…"} km`);
  if (brief.maxTurns !== undefined) parts.push(`≤ ${brief.maxTurns} turns`);
  if (brief.minOvertaking !== undefined) parts.push(`≥ ${brief.minOvertaking} zones`);
  if (brief.minStraight !== undefined) parts.push(`≥ ${brief.minStraight} m straight`);
  if (brief.profile) parts.push(archetypeById(brief.profile)?.name ?? brief.profile);
  const kept = preservedTurnNumbers(brief, circuit);
  if (kept.length) parts.push(`keep T${kept.join(", T")}`);
  return parts.join(" · ");
}

export const preservedTurnNumbers = (brief: Brief, circuit: Circuit) =>
  (brief.preserve ?? []).map((id) => circuit.turns.findIndex((t) => t.id === id) + 1).filter((n) => n > 0);

/** The brief as an agent reads it: turn numbers instead of ids, statuses spelled out, and what is currently limiting the design. */
export function briefForAgent(brief: Brief, circuit: Circuit, a: Analysis) {
  if (isBriefEmpty(brief)) return { active: false as const, note: "No design brief set. set_design_brief defines one; the designer can also edit it in the panel." };
  const report = evaluateBrief(brief, circuit, a);
  const { preserve: _ids, ...rest } = brief;
  void _ids;
  return {
    active: true as const,
    constraints: { ...rest, preserve_turns: preservedTurnNumbers(brief, circuit) },
    status: report.results.map((r) => ({ constraint: r.label, status: r.status === "near" ? "NEAR LIMIT" : r.status.toUpperCase(), actual: r.actual, target: r.target })),
    pass: report.pass,
    failing: report.failed,
    summary: describeBrief(brief, circuit),
  };
}
