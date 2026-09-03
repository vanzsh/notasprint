"use client";
import { useRef, useState } from "react";
import { fmtKm, fmtLap, type Analysis, type Circuit } from "@/lib/circuit";
import { deleteTurn, editTurns, insertTurns, setLocks } from "@/lib/moves";
import { commit, getState, preview, SCORE_LABEL, select, undo, useStore } from "@/lib/store";

export function Panel() {
  const { circuit, analysis: a, selected, receipt } = useStore((s) => s);
  const selIdx = circuit.turns.findIndex((t) => t.id === selected);
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-line bg-surface">
      <div className="min-h-0 flex-1 overflow-y-auto">
      <Section label="Circuit">
        <div className="display text-[28px] leading-none">{circuit.name}</div>
        <div className="mt-1 truncate text-[12px] text-fg-muted" title={circuit.tagline}>{circuit.tagline}</div>
        <div className="mt-4 flex items-end gap-6">
          <Hero value={fmtKm(a.length)} unit="km" label="Length" />
          <Hero value={fmtLap(a.lapTime)} unit="" label="Est. lap" />
          <Hero value={String(a.turnCount)} unit={`${a.left}L ${a.right}R`} label="Turns" />
        </div>
        <div className="mono mt-3 grid grid-cols-3 gap-x-4 text-[11px] text-fg-muted">
          <Kv k="Top speed" v={`${a.topSpeed} km/h`} />
          <Kv k="Max straight" v={`${a.longestStraight} m`} />
          <Kv k="Track width" v={`${circuit.trackWidth} m`} />
        </div>
      </Section>

      <Section label="Design scores">
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(SCORE_LABEL) as (keyof typeof SCORE_LABEL)[]).map((k) => <Score key={k} label={SCORE_LABEL[k]} value={a.scores[k]} />)}
        </div>
      </Section>

      <Section label={selIdx >= 0 ? `Turn ${selIdx + 1}` : "Selected turn"}>
        {selIdx < 0 ? <div className="text-[12px] text-fg-dim">Click a turn to inspect it. Drag to move · double-click the track to add a turn · L locks.</div> : <Inspector key={selected} i={selIdx} />}
      </Section>


      <Section label="Sectors">
        <table className="mono w-full text-[11px]">
          <tbody>
            {a.sectors.map((s) => (
              <tr key={s.sector} className="border-t border-line first:border-t-0">
                <td className="display py-1 text-[15px] text-fg">S{s.sector}</td>
                <td className="py-1 text-fg-muted">{s.character}</td>
                <td className="py-1 text-right text-fg-muted">{s.turns} t</td>
                <td className="py-1 text-right text-fg-muted">{s.length} m</td>
                <td className="py-1 text-right text-fg">{s.avgSpeed} <span className="text-fg-dim">km/h</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section label={`Overtaking · ${a.overtakingOpportunities.length} strong`}>
        {a.overtakingOpportunities.length === 0 && <div className="text-[12px] text-fg-dim">No strong braking zone yet. A heavy stop after a long straight creates one.</div>}
        {a.overtakingOpportunities.map((t) => (
          <button key={t.id} onClick={() => select(t.id)} className="mono flex w-full items-baseline justify-between gap-2 py-1 text-left text-[11px] hover:text-fg">
            <span className="text-fg"><span className="text-accent">▸</span> T{t.turn}{t.name ? <span className="text-fg-muted"> {t.name}</span> : null}</span>
            <span className="text-fg-muted">{t.entrySpeed}→{t.apexSpeed} km/h · {t.approach} m</span>
          </button>
        ))}
      </Section>

      <Section label="Speed trace">
        <Sparkline a={a} />
      </Section>

      {a.warnings.length > 0 && (
        <Section label="Constraints">
          {a.warnings.map((w, i) => <div key={i} className="py-0.5 text-[12px] text-fg-muted before:mr-2 before:text-accent before:content-['!']">{w}</div>)}
        </Section>
      )}


      </div>
      <div className="border-t border-line px-4 py-3">
        <div className="label mb-1.5">Activity</div>
        {receipt ? (
          <div key={receipt.at} className="mono tick flex items-baseline gap-2 text-[11px] text-fg-muted">
            <span className={`shrink-0 ${receipt.source === "agent" ? "text-fg" : "text-fg-dim"}`}>{receipt.source === "agent" ? "AGENT" : "YOU"}</span>
            <span className="min-w-0 flex-1">{receipt.text}</span>
            <button onClick={() => undo()} className="shrink-0 underline decoration-line-strong underline-offset-2 hover:text-fg">Undo</button>
          </div>
        ) : (
          <div className="mono text-[11px] text-fg-dim">No changes yet · ⌘Z undo · ⇧⌘Z redo</div>
        )}
      </div>
    </aside>
  );
}

function Inspector({ i }: { i: number }) {
  const circuit = useStore((s) => s.circuit);
  const ta = useStore((s) => s.analysis.turns[i]);
  const t = circuit.turns[i];
  const [name, setName] = useState(t.name ?? "");
  // Slider: live preview while scrubbing, one history entry on release.
  const base = useRef<Circuit | null>(null);
  const begin = () => { base.current ??= getState().circuit; };
  const end = () => {
    if (!base.current) return;
    const cur = getState().circuit;
    preview(base.current);
    base.current = null;
    commit(cur, { source: "human", changed: [t.id] });
  };
  if (!t) return null;
  return (
    <div className="space-y-3">
      <div className="mono grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
        <Kv k="Type" v={ta.type} />
        <Kv k="Direction" v={ta.direction === "L" ? "Left" : "Right"} />
        <Kv k="Angle" v={`${ta.angle}°`} />
        <Kv k="Apex" v={`${ta.apexSpeed} km/h`} />
        <Kv k="Entry" v={`${ta.entrySpeed} km/h`} />
        <Kv k="Approach" v={`${ta.approach} m`} />
        <Kv k="Sector" v={`S${t.sector}`} />
        <Kv k="Position" v={`${Math.round(t.x)}, ${Math.round(t.y)}`} />
        <Kv k="Overtaking" v={`${ta.overtaking}`} />
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="label">Radius</span>
          <span className="mono text-[12px]">{Math.round(t.radius)} <span className="text-fg-dim">m{ta.radius < Math.round(t.radius) - 3 ? ` · fits ${ta.radius}` : ""}</span></span>
        </div>
        <input type="range" min={8} max={320} step={1} value={Math.round(t.radius)} disabled={t.locked}
          onPointerDown={begin} onKeyDown={begin} onPointerUp={end} onKeyUp={end}
          onChange={(e) => { begin(); preview(editTurns(getState().circuit, [{ turn: i + 1, radius: Number(e.target.value) }]).circuit); }} />
      </div>
      <div>
        <div className="label mb-1">Name</div>
        <input value={name} disabled={t.locked} placeholder="Unnamed" onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== (t.name ?? "") && commit(editTurns(circuit, [{ turn: i + 1, name }]).circuit, { source: "human", changed: [t.id] })}
          className="h-7 w-full border border-line bg-surface-2 px-2 text-[12px] text-fg outline-none placeholder:text-fg-dim focus:border-line-strong disabled:text-fg-muted" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button className={`btn ${t.locked ? "btn-on" : ""}`} onClick={() => commit(setLocks(circuit, [i + 1], !t.locked).circuit, { source: "human", label: t.locked ? `Unlocked T${i + 1}` : `Locked T${i + 1}` })}>
          {t.locked ? "Locked" : "Lock"} <kbd className="mono text-[10px] text-fg-dim">L</kbd>
        </button>
        <button className="btn" onClick={() => { const r = insertTurns(circuit, i, [midpoint(circuit, i)]); commit(r.circuit, { source: "human", changed: r.changed }); select(r.changed[0]); }}>Add turn after</button>
        <button className="btn" disabled={t.locked || circuit.turns.length <= 4} onClick={() => { commit(deleteTurn(circuit, i).circuit, { source: "human", label: `Removed T${i + 1}` }); select(null); }}>Remove</button>
      </div>
    </div>
  );
}

function midpoint(c: { turns: { x: number; y: number }[] }, i: number) {
  const a = c.turns[i], b = c.turns[(i + 1) % c.turns.length];
  return { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2), radius: 60 };
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <div className="label mb-2">{label}</div>
      {children}
    </section>
  );
}
function Hero({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span key={value} className="display tick text-[36px] leading-[0.95]">{value}</span>
        {unit && <span className="mono text-[11px] text-fg-muted">{unit}</span>}
      </div>
      <div className="label mt-1">{label}</div>
    </div>
  );
}
function Kv({ k, v }: { k: string; v: string }) {
  return <div className="flex flex-col"><span className="text-fg-dim">{k}</span><span className="text-fg">{v}</span></div>;
}
function Score({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="label text-[10px] tracking-[0.06em]">{label}</div>
      <div key={value} className="display tick mt-0.5 text-[28px] leading-none">{value}</div>
      <div className="mt-1.5 h-[2px] bg-line"><div className="h-full bg-fg transition-[width] duration-300" style={{ width: `${value}%` }} /></div>
    </div>
  );
}
function Sparkline({ a }: { a: Analysis }) {
  const W = 320, H = 44;
  const pts = a.speedTrace;
  const maxS = a.length || 1;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${((p.s / maxS) * W).toFixed(1)},${(H - (p.v / 360) * H).toFixed(1)}`).join(" ");
  const bounds = a.sectors.slice(0, -1).map((s, i) => a.sectors.slice(0, i + 1).reduce((x, y) => x + y.length, 0));
  return (
    <svg viewBox={`0 0 ${W} ${H + 12}`} className="w-full" preserveAspectRatio="none">
      {[100, 200, 300].map((v) => <line key={v} x1={0} x2={W} y1={H - (v / 360) * H} y2={H - (v / 360) * H} stroke="var(--line)" strokeWidth={1} />)}
      {bounds.map((s, i) => <line key={i} x1={(s / maxS) * W} x2={(s / maxS) * W} y1={0} y2={H} stroke="var(--line-strong)" strokeDasharray="2 3" strokeWidth={1} />)}
      <path d={d} fill="none" stroke="var(--fg)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      <text x={0} y={H + 10} className="mono" fontSize={9} fill="var(--fg-dim)">S/F</text>
      {bounds.map((s, i) => <text key={i} x={(s / maxS) * W + 3} y={H + 10} className="mono" fontSize={9} fill="var(--fg-dim)">S{i + 2}</text>)}
      <text x={W} y={H + 10} className="mono" fontSize={9} fill="var(--fg-dim)" textAnchor="end">{a.topSpeed} km/h max</text>
    </svg>
  );
}
