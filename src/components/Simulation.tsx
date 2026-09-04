"use client";
import { Pause, Play, RotateCcw } from "lucide-react";
import { fingerprint } from "@/lib/circuit";
import { pause, play, restart, usePlayback } from "@/lib/playback";
import { compareSimulations, type Finding } from "@/lib/simulation";
import { seriesById } from "@/lib/series";
import { runSimulation, select, setSimParams, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  const noun = seriesById(circuit.series).noun;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1">
        <Param label="Field size" value={String(params.cars)} onChange={(v) => setSimParams({ cars: Number(v) })} options={[6, 8, 12, 16, 20].map((n) => [String(n), `${n} ${noun}s`])} />
        <Param label="Laps" value={String(params.laps)} onChange={(v) => setSimParams({ laps: Number(v) })} options={[3, 5, 8, 10].map((n) => [String(n), `${n} laps`])} />
        <Param label="Driver variance" tip="Driver skill and lap-to-lap spread" value={level(params.variance)} onChange={(v) => setSimParams({ variance: LEVELS.find((l) => l[0] === v)![1] })} options={LEVELS.map(([l]) => [l, `${l} variance`])} />
        <Param label="Aggression" tip="Willingness to attempt marginal passes" value={level(params.aggression)} onChange={(v) => setSimParams({ aggression: LEVELS.find((l) => l[0] === v)![1] })} options={LEVELS.map(([l]) => [l, `${l} aggression`])} />
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="primary" onClick={() => runSimulation()}>{result ? "Run again" : "Run simulation"}</Button>
        {result && !stale && (ended
          ? <Button size="icon" onClick={() => restart(run)} aria-label="Replay"><RotateCcw /></Button>
          : <Button size="icon" onClick={() => (playing ? pause() : play())} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause /> : <Play />}</Button>)}
        {result && <span className="ml-auto truncate text-[11px] text-fg-dim">seed <span className="mono">{result.params.seed}</span></span>}
      </div>
      {!result ? (
        <div className="text-[12px] text-fg-dim">Race a small field of {noun}s around this circuit and read where they bunch, pass or make contact. Simulated design signals, not real-world predictions.</div>
      ) : (
        <>
          {stale && <div className="text-[12px] text-fg-muted before:mr-2 before:text-accent before:content-['!']">Circuit changed since this run · run again for current signals</div>}
          <div className="grid grid-cols-5 gap-x-2 border-y border-line py-2">
            <Stat v={result.totals.congestion} k="held up" /><Stat v={result.totals.contacts} k="contacts" /><Stat v={result.totals.overtakes} k="passes" /><Stat v={result.totals.avgGapS} unit="s" k="avg gap" /><Stat v={result.totals.spreadS} unit="s" k="spread" />
          </div>
          {cmp && <div className="text-[12px] text-fg-muted" title={cmp.comparable ? "Same field, laps and seed as the previous run" : "Previous run used different parameters"}>Previous → this{cmp.comparable ? "" : " (different parameters)"} · <span className="mono text-[11px]">{cmp.summary}</span></div>}
          <div>
            {result.findings.slice(0, 5).map((f, i) => (
              <button key={i} onClick={() => f.turns.length && select(circuit.turns[f.turns[0] - 1]?.id ?? null)} className="-mx-2 flex w-[calc(100%+16px)] items-start gap-2 rounded-sm px-2 py-1 text-left text-[12px] leading-snug text-fg-muted enabled:hover:bg-surface-2 enabled:hover:text-fg" disabled={!f.turns.length}>
                <span className={cn("mono shrink-0", MARK[f.severity])}>{f.severity === "info" ? "·" : "!"}</span><span>{f.text}</span>
              </button>
            ))}
            {result.findings.length > 5 && <div className="pl-4 text-[11px] text-fg-dim">+{result.findings.length - 5} more via <span className="mono">analyze_circuit</span></div>}
          </div>
          <div className="text-[11px] text-fg-dim">Simulated design signal · point-mass model</div>
        </>
      )}
    </div>
  );
}

function Param({ label, tip, value, onChange, options }: { label: string; tip?: string; value: string; onChange: (v: string) => void; options: (readonly [string, string])[] }) {
  const trigger = <SelectTrigger size="sm" aria-label={label} className="w-full"><SelectValue /></SelectTrigger>;
  return (
    <Select value={value} onValueChange={onChange}>
      {tip ? <Tooltip><TooltipTrigger asChild>{trigger}</TooltipTrigger><TooltipContent>{tip}</TooltipContent></Tooltip> : trigger}
      <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function Stat({ v, k, unit }: { v: number | string; k: string; unit?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="mono truncate text-[12px] text-fg">{v}{unit && <span className="text-fg-dim"> {unit}</span>}</span>
      <span className="truncate text-[10px] text-fg-dim">{k}</span>
    </div>
  );
}
