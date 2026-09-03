"use client";
import { useState } from "react";
import { compactResult } from "@/lib/simulation";
import { deleteVersion, restoreVersion, saveVersion, setCompare, useStore } from "@/lib/store";
import { compareSnapshots } from "@/lib/versions";

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Named design milestones with a compare-against-current view. Complements undo; never replaces it. */
export function Versions() {
  const versions = useStore((s) => s.versions);
  const compare = useStore((s) => s.compare);
  const suggested = useStore((s) => s.lastChange ?? `${s.circuit.name} concept`);
  const circuit = useStore((s) => s.circuit);
  const analysis = useStore((s) => s.analysis);
  const brief = useStore((s) => s.brief);
  const simulation = useStore((s) => s.simulation);
  const [name, setName] = useState("");
  const target = versions.find((v) => v.id === compare);
  // Built from the subscribed live state so the table follows every edit — the same view the agent compares against.
  const cmp = target ? compareSnapshots(target, { id: "current", name: "Current", circuit, analysis, brief, simulation: simulation ? compactResult(simulation) : null }) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested || `V${versions.length + 1}`} className="field min-w-0 flex-1" onKeyDown={(e) => { if (e.key === "Enter") { saveVersion(name || suggested); setName(""); } }} />
        <button className="btn" onClick={() => { saveVersion(name || suggested); setName(""); }}>Save version</button>
      </div>
      {!versions.length && <div className="text-[12px] text-fg-dim">Save a milestone to compare designs later. Undo stays separate for small edits.</div>}
      {versions.map((v) => (
        <div key={v.id} className="mono text-[11px]">
          <div className="flex items-baseline gap-2">
            <span className="display shrink-0 text-[15px] leading-none text-fg">{v.id.toUpperCase()}</span>
            <span className="min-w-0 flex-1 truncate text-fg" title={`${v.name} · saved ${time(v.at)} by ${v.source}`}>{v.name}</span>
            <button onClick={() => setCompare(compare === v.id ? null : v.id)} className={`shrink-0 underline decoration-line-strong underline-offset-2 hover:text-fg ${compare === v.id ? "text-fg" : "text-fg-muted"}`}>{compare === v.id ? "Comparing" : "Compare"}</button>
            <button onClick={() => restoreVersion(v.id)} className="shrink-0 text-fg-muted underline decoration-line-strong underline-offset-2 hover:text-fg">Restore</button>
            <button onClick={() => deleteVersion(v.id)} title="Delete version" className="shrink-0 text-fg-dim hover:text-fg">×</button>
          </div>
          <div className="truncate pl-[calc(2.2ch+8px)] text-fg-dim">{(v.analysis.length / 1000).toFixed(2)} km · {v.analysis.turnCount} turns · {v.analysis.overtakingOpportunities.length} strong{v.simulation ? ` · sim ${v.simulation.totals.congestion} held up · ${v.simulation.totals.overtakes} passes` : " · no simulation"}</div>
        </div>
      ))}
      {cmp && target && (
        <div className="border-t border-line pt-2">
          <div className="mono mb-1 flex items-baseline justify-between text-[11px]">
            <span className="text-fg-muted"><span className="text-fg">{target.id.toUpperCase()}</span> → <span className="text-fg">CURRENT</span> · dashed on canvas</span>
            <button onClick={() => setCompare(null)} className="text-fg-dim hover:text-fg">Close</button>
          </div>
          <table className="mono w-full text-[11px]">
            <tbody>
              {cmp.rows.map((r) => (
                <tr key={r.key} className="border-t border-line first:border-t-0">
                  <td className="py-0.5 text-fg-muted">{r.label}</td>
                  <td className="py-0.5 text-right text-fg-muted">{r.a}</td>
                  <td className="w-6 py-0.5 text-center text-fg-dim">→</td>
                  <td className={`py-0.5 text-right ${r.a === r.b ? "text-fg-muted" : "text-fg"}`}>{r.b}</td>
                </tr>
              ))}
              {cmp.sectors.filter((s) => s.a !== s.b).map((s) => (
                <tr key={s.sector} className="border-t border-line">
                  <td className="py-0.5 text-fg-muted">S{s.sector}</td>
                  <td className="py-0.5 text-right text-fg-muted">{s.a}</td>
                  <td className="w-6 py-0.5 text-center text-fg-dim">→</td>
                  <td className="py-0.5 text-right text-fg">{s.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!cmp.simulation && <div className="mono mt-1 text-[11px] text-fg-dim">Run a simulation on both to compare race-flow signals</div>}
        </div>
      )}
    </div>
  );
}
