"use client";
import { ARCHETYPES, type ArchetypeId } from "@/lib/archetypes";
import { BRIEF_DEFAULTS, evaluateBrief, isBriefEmpty, type Brief as BriefModel, type ConstraintStatus } from "@/lib/constraints";
import { setLocks } from "@/lib/moves";
import { clearBrief, commit, setBrief, useStore } from "@/lib/store";

const STATUS: Record<ConstraintStatus, { text: string; cls: string }> = { pass: { text: "PASS", cls: "text-fg" }, near: { text: "NEAR LIMIT", cls: "text-fg-muted" }, fail: { text: "FAIL", cls: "text-accent" } };
const rank = (s: ConstraintStatus) => ({ fail: 0, near: 1, pass: 2 })[s];

/** Design brief: a compact set of measurable constraints, each switchable, evaluated live against the circuit. */
export function Brief() {
  const brief = useStore((s) => s.brief);
  const circuit = useStore((s) => s.circuit);
  const analysis = useStore((s) => s.analysis);
  const selected = useStore((s) => s.selected);
  const report = evaluateBrief(brief, circuit, analysis);
  const status = (key: keyof BriefModel) => report.results.find((r) => r.key === key);
  const selIdx = circuit.turns.findIndex((t) => t.id === selected);
  const on = (key: keyof BriefModel) => brief[key] !== undefined;
  const toggle = (key: keyof typeof BRIEF_DEFAULTS) => setBrief({ [key]: on(key) ? null : BRIEF_DEFAULTS[key] });
  const preserved = brief.preserve ?? [];
  const preserve = (id: string, add: boolean) => {
    const next = add ? [...preserved, id] : preserved.filter((x) => x !== id);
    if (add) { const i = circuit.turns.findIndex((t) => t.id === id); if (i >= 0 && !circuit.turns[i].locked) commit(setLocks(circuit, [i + 1], true).circuit, { source: "human", label: `Locked T${i + 1}` }); }
    setBrief({ preserve: next.length ? next : null });
  };

  return (
    <div className="space-y-1.5">
      <Row on={on("minLength") || on("maxLength")} onToggle={() => setBrief(on("minLength") || on("maxLength") ? { minLength: null, maxLength: null } : { minLength: BRIEF_DEFAULTS.minLength, maxLength: BRIEF_DEFAULTS.maxLength })} label="Length" result={[status("minLength"), status("maxLength")].filter(Boolean).sort((a, b) => rank(a!.status) - rank(b!.status))[0]}>
        <Num value={brief.minLength} disabled={!on("minLength") && !on("maxLength")} scale={1000} step={0.1} onChange={(v) => setBrief({ minLength: v })} placeholder="min" />
        <span className="text-fg-dim">–</span>
        <Num value={brief.maxLength} disabled={!on("minLength") && !on("maxLength")} scale={1000} step={0.1} onChange={(v) => setBrief({ maxLength: v })} placeholder="max" />
        <span className="text-fg-dim">km</span>
      </Row>
      <Row on={on("maxTurns")} onToggle={() => toggle("maxTurns")} label="Max turns" result={status("maxTurns")}>
        <span className="text-fg-dim">≤</span><Num value={brief.maxTurns} onChange={(v) => setBrief({ maxTurns: v })} />
      </Row>
      <Row on={on("minOvertaking")} onToggle={() => toggle("minOvertaking")} label="Overtaking" result={status("minOvertaking")}>
        <span className="text-fg-dim">≥</span><Num value={brief.minOvertaking} onChange={(v) => setBrief({ minOvertaking: v })} />
      </Row>
      <Row on={on("minStraight")} onToggle={() => toggle("minStraight")} label="Main straight" result={status("minStraight")}>
        <span className="text-fg-dim">≥</span><Num value={brief.minStraight} step={50} onChange={(v) => setBrief({ minStraight: v })} /><span className="text-fg-dim">m</span>
      </Row>
      <Row on={on("profile")} onToggle={() => setBrief({ profile: on("profile") ? null : "high-speed" })} label="Profile" result={status("profile")}>
        <select value={brief.profile ?? ""} disabled={!on("profile")} onChange={(e) => setBrief({ profile: (e.target.value || null) as ArchetypeId | null })} className="h-6 text-[11px]">
          {!on("profile") && <option value="">—</option>}
          {ARCHETYPES.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Row>
      <div className="mono flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="w-[104px] shrink-0 text-fg-muted">Preserve</span>
        {preserved.map((id) => {
          const i = circuit.turns.findIndex((t) => t.id === id), r = report.results.find((x) => x.key === "preserve" && x.turnId === id);
          return (
            <button key={id} onClick={() => preserve(id, false)} title="Remove from brief" className={`chip normal-case tracking-normal ${r?.status === "fail" ? "border-accent text-accent" : "text-fg"}`}>
              {i >= 0 ? `T${i + 1}` : "removed"} · {r ? STATUS[r.status].text : ""} <span className="text-fg-dim">×</span>
            </button>
          );
        })}
        {selIdx >= 0 && !preserved.includes(selected!) && <button className="btn h-6" onClick={() => preserve(selected!, true)}>+ T{selIdx + 1}</button>}
        {!preserved.length && selIdx < 0 && <span className="text-fg-dim">select a turn to preserve it</span>}
      </div>
      <div className="mono flex items-center justify-between pt-1 text-[11px] text-fg-muted">
        <span>{isBriefEmpty(brief) ? "No constraints set · design checks, not certification" : <>{report.passed}/{report.active} pass{report.failed.length ? <span className="text-accent"> · {report.failed.length} failing</span> : null}</>}</span>
        {!isBriefEmpty(brief) && <button onClick={() => clearBrief()} className="underline decoration-line-strong underline-offset-2 hover:text-fg">Clear</button>}
      </div>
    </div>
  );
}

function Row({ on, onToggle, label, result, children }: { on: boolean; onToggle: () => void; label: string; result?: { status: ConstraintStatus; actual: string }; children: React.ReactNode }) {
  return (
    <div className="mono flex items-center gap-1.5 text-[11px]">
      <label className="flex w-[104px] shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-fg-muted"><input type="checkbox" checked={on} onChange={onToggle} />{label}</label>
      <div className={`flex items-center gap-1 ${on ? "" : "opacity-40"}`}>{children}</div>
      {on && result && (
        <div className="ml-auto flex min-w-0 items-baseline gap-2 whitespace-nowrap">
          <span className="truncate text-fg-muted" title={result.actual}>{result.actual}</span>
          <span className={`shrink-0 ${STATUS[result.status].cls}`}>{STATUS[result.status].text}</span>
        </div>
      )}
    </div>
  );
}

function Num({ value, onChange, disabled, scale = 1, step = 1, placeholder }: { value?: number; onChange: (v: number | null) => void; disabled?: boolean; scale?: number; step?: number; placeholder?: string }) {
  return (
    <input type="number" step={step} min={0} placeholder={placeholder} value={value === undefined ? "" : Math.round((value / scale) * 100) / 100} disabled={disabled ?? value === undefined}
      onChange={(e) => { const n = Number(e.target.value); onChange(e.target.value === "" || !Number.isFinite(n) ? null : n * scale); }}
      className="field w-[50px]" />
  );
}
