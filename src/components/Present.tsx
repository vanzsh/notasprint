"use client";
import { useEffect } from "react";
import { Minimize2 } from "lucide-react";
import { fmtKm, fmtLap } from "@/lib/circuit";
import { seriesById } from "@/lib/series";
import { SCORE_LABEL, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Canvas } from "./Canvas";

/** Presentation view: the live circuit full-bleed with its identity and headline metrics. Esc or the corner button leaves. */
export function Present({ onExit }: { onExit: () => void }) {
  const circuit = useStore((s) => s.circuit);
  const a = useStore((s) => s.analysis);
  const series = seriesById(circuit.series);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onExit(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);
  return (
    <div className="relative h-full w-full bg-bg text-fg">
      <Canvas />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-8">
        <div>
          <div className="label mb-2">{series.name}{circuit.location ? ` · ${circuit.location}` : circuit.custom !== undefined ? " · generated concept" : ""}</div>
          <div className="display text-[44px] leading-[0.95]">{circuit.name}</div>
          <div className="mt-2 max-w-[520px] text-[13px] text-fg-muted">{circuit.tagline}</div>
        </div>
        <div className="pointer-events-auto flex items-center gap-3">
          <span className="mono text-[11px] text-fg-dim">Esc to exit</span>
          <Tooltip>
            <TooltipTrigger asChild><Button size="icon" onClick={onExit} aria-label="Exit presentation"><Minimize2 /></Button></TooltipTrigger>
            <TooltipContent>Back to the workspace</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-8">
        <div className="flex items-end gap-8">
          {([[fmtKm(a.length), "km", "Length"], [fmtLap(a.lapTime), "", "Est. lap"], [String(a.turnCount), `${a.left}L ${a.right}R`, "Turns"], [String(a.topSpeed), "km/h", "Top speed"]] as const).map(([v, unit, label]) => (
            <div key={label}>
              <div className="flex items-baseline gap-1.5"><span className="display text-[44px] leading-[0.95]">{v}</span>{unit && <span className="mono text-[12px] text-fg-muted">{unit}</span>}</div>
              <div className="label mt-1">{label}</div>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-6">
          {(Object.keys(SCORE_LABEL) as (keyof typeof SCORE_LABEL)[]).map((k) => (
            <div key={k} className="w-[84px]">
              <div className="label text-[10px] tracking-[0.06em]">{SCORE_LABEL[k]}</div>
              <div className="display mt-0.5 text-[28px] leading-none">{a.scores[k]}</div>
              <div className="mt-1.5 h-[2px] bg-line"><div className="h-full bg-fg" style={{ width: `${a.scores[k]}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      <div className="mono pointer-events-none absolute bottom-2 right-8 text-[10px] text-fg-dim">NotASprint · design analysis, not survey data</div>
    </div>
  );
}
