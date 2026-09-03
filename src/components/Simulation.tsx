"use client";
import { fingerprint } from "@/lib/circuit";
import { pause, play, restart, usePlayback } from "@/lib/playback";
import { compareSimulations, type Finding } from "@/lib/simulation";
import { runSimulation, select, setSimParams, useStore } from "@/lib/store";

const LEVELS = [["Low", 0.25], ["Moderate", 0.5], ["High", 0.8]] as const;
const MARK: Record<Finding["severity"], string> = { high: "text-accent", medium: "text-fg", info: "text-fg-dim" };

/** Hypothetical race-flow simulation: a few controls, the run's totals, ranked findings and playback. */
export function Simulation() {
  const params = useStore((s) => s.simParams);
  const result = useStore((s) => s.simulation);
  const before = useStore((s) => s.simulationBefore);
  const run = useStore((s) => s.simRun);
  const circuit = useStore((s) => s.circuit);
  const playing = usePlayback((p) => p.playing);
  const ended = usePlayback((p) => result ? p.t >= (result.frames.s.length - 1) * result.frames.step : false);
  const stale = result ? result.fingerprint !== fingerprint(circuit) : false;
  const level = (v: number) => LEVELS.reduce((b, l) => (Math.abs(l[1] - v) < Math.abs(b[1] - v) ? l : b))[0];
  const cmp = result && before ? compareSimulations(before, result) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={params.cars} onChange={(e) => setSimParams({ cars: Number(e.target.value) })} aria-label="Cars">{[6, 8, 12, 16, 20].map((n) => <option key={n} value={n}>{n} cars</option>)}</select>
        <select value={params.laps} onChange={(e) => setSimParams({ laps: Number(e.target.value) })} aria-label="Laps">{[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n} laps</option>)}</select>
        <select value={level(params.variance)} onChange={(e) => setSimParams({ variance: LEVELS.find((l) => l[0] === e.target.value)![1] })} aria-label="Driver variance" title="Driver skill and lap-to-lap spread">{LEVELS.map(([l]) => <option key={l} value={l}>{l} variance</option>)}</select>
        <select value={level(params.aggression)} onChange={(e) => setSimParams({ aggression: LEVELS.find((l) => l[0] === e.target.value)![1] })} aria-label="Aggression" title="Willingness to attempt marginal passes">{LEVELS.map(([l]) => <option key={l} value={l}>{l} aggression</option>)}</select>
        <button className="btn btn-primary ml-auto" onClick={() => runSimulation()}>{result ? "Run again" : "Run simulation"}</button>
      </div>
      {!result ? (
        <div className="text-[12px] text-fg-dim">Race a small field around this circuit and read where cars bunch, pass or make contact. Simulated design signals, not real-world predictions.</div>
      ) : (
        <>
          {stale && <div className="mono text-[11px] text-fg-muted before:mr-2 before:text-accent before:content-['!']">Circuit changed since this run · run again for current signals</div>}
          <div className="mono flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            <Stat v={result.totals.congestion} k="held up" /><Stat v={result.totals.contacts} k="contacts" /><Stat v={result.totals.overtakes} k="passes" /><Stat v={`${result.totals.avgGapS} s`} k="avg gap" /><Stat v={`${result.totals.spreadS} s`} k="spread" />
          </div>
          {cmp && <div className="mono text-[11px] text-fg-muted" title={cmp.comparable ? "Same cars, laps and seed as the previous run" : "Previous run used different parameters"}>Previous → this{cmp.comparable ? "" : " (different parameters)"} · {cmp.summary}</div>}
          <div>
            {result.findings.slice(0, 5).map((f, i) => (
              <button key={i} onClick={() => f.turns.length && select(circuit.turns[f.turns[0] - 1]?.id ?? null)} className="flex w-full items-start gap-2 py-0.5 text-left text-[12px] text-fg-muted hover:text-fg" disabled={!f.turns.length}>
                <span className={`mono shrink-0 ${MARK[f.severity]}`}>{f.severity === "info" ? "·" : "!"}</span><span>{f.text}</span>
              </button>
            ))}
            {result.findings.length > 5 && <div className="mono pl-4 text-[11px] text-fg-dim">+{result.findings.length - 5} more via analyze_circuit</div>}
          </div>
          <div className="flex items-center gap-1.5">
            {!stale && (ended ? <button className="btn" onClick={() => restart(run)}>Replay</button> : <button className="btn" onClick={() => (playing ? pause() : play())}>{playing ? "Pause" : "Play"}</button>)}
            <span className="mono text-[11px] text-fg-dim">Simulated design signal · point-mass model · seed {result.params.seed}</span>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ v, k }: { v: number | string; k: string }) {
  return <span className="text-fg">{v} <span className="text-fg-dim">{k}</span></span>;
}
