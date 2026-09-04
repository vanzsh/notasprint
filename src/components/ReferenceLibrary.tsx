"use client";
import { useMemo, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import { Plus } from "lucide-react";
import f1Logo from "@/assets/formula1.webp";
import feLogo from "@/assets/formula-e.webp";
import motogpLogo from "@/assets/motogp.webp";
import { analyze, buildGeometry, fmtKm, fmtLap, startFinish, type Circuit } from "@/lib/circuit";
import { REFERENCES } from "@/lib/circuits";
import { SERIES, SERIES_IDS, type SeriesId } from "@/lib/series";
import { loadCircuit, loadCustom, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Series marks are the supplied files, shown as-is for identification only.
export const SERIES_LOGO: Record<SeriesId, StaticImageData> = { f1: f1Logo, fe: feLogo, motogp: motogpLogo };

/**
 * The Reference Library: one tab per motorsport, three reference layouts and Create custom in a 2 × 2 grid.
 * Picking a card replaces the workspace and closes the dialog.
 */
export function ReferenceLibrary({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const circuit = useStore((s) => s.circuit);
  const [tab, setTab] = useState<SeriesId>(circuit.series);
  const choose = (fn: () => void) => { fn(); onOpenChange(false); };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) setTab(circuit.series); onOpenChange(o); }}>
      <DialogContent className="h-[min(700px,calc(100vh-40px))] max-w-[1000px] rounded-xl">
        <DialogHeader>
          <DialogTitle>Reference Library</DialogTitle>
          <DialogDescription>Start from a reference layout or generate a concept for the discipline. Loading replaces the live circuit.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as SeriesId)} className="min-h-0 flex-1 gap-0 px-5 pt-2">
          <TabsList>
            {SERIES_IDS.map((s) => (
              <TabsTrigger key={s} value={s}>
                <Image src={SERIES_LOGO[s]} alt="" width={18} height={18} unoptimized className="size-[18px] rounded-[2px] object-contain" />
                {SERIES[s].name}
              </TabsTrigger>
            ))}
            <span className="mono ml-auto pb-2 text-[11px] text-fg-dim">{Math.round(SERIES[tab].vehicle.vMax * 3.6)} km/h · {(SERIES[tab].vehicle.aLat / 9.81).toFixed(1)} g lateral · {SERIES[tab].noun}s</span>
          </TabsList>
          {SERIES_IDS.map((s) => (
            <TabsContent key={s} value={s} className="flex min-h-0 flex-col pt-3">
              <p className="mb-3 text-[12px] text-fg-muted">{SERIES[s].emphasis}</p>
              <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2 pb-4">
                {REFERENCES[s].map((r) => <ReferenceCard key={r.id} circuit={r} loaded={circuit.id === r.id} onPick={() => choose(() => loadCircuit(r.id))} />)}
                <button onClick={() => choose(() => loadCustom(s))} className="group flex min-h-0 flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-line-strong px-6 text-center outline-none transition-colors duration-120 hover:border-fg-muted hover:bg-surface-2 focus-visible:bg-surface-2">
                  <span className="flex size-9 items-center justify-center rounded-sm border border-line-strong text-fg-muted transition-colors duration-120 group-hover:border-fg group-hover:text-fg"><Plus className="size-4" /></span>
                  <span className="display text-[20px] leading-none">Create custom</span>
                  <span className="text-[12px] text-fg-muted">A new {SERIES[s].name} concept, different every time.</span>
                  <span className="text-[11px] text-fg-dim"><span className="mono">{SERIES[s].generator.length[0] / 1000}–{SERIES[s].generator.length[1] / 1000} km · {SERIES[s].generator.turns[0]}–{SERIES[s].generator.turns[1]} turns</span> · reproducible by seed</span>
                </button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <DialogFooter>
          <span className="shrink-0 text-[11px] text-fg-dim">Schematic interpretations for design inspiration · not survey data</span>
          <span className="truncate text-[10px] text-fg-dim">For representation purposes only. Not affiliated with or endorsed by the referenced racing series or circuits.</span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReferenceCard({ circuit: c, loaded, onPick }: { circuit: Circuit; loaded: boolean; onPick: () => void }) {
  const a = useMemo(() => analyze(c), [c]);
  return (
    <button onClick={onPick} aria-current={loaded || undefined} className={cn("group flex min-h-0 flex-col rounded-sm border text-left outline-none transition-colors duration-120 hover:border-line-strong hover:bg-surface-2 focus-visible:bg-surface-2", loaded ? "border-fg" : "border-line")}>
      <div className="relative min-h-0 flex-1 p-3">
        <Schematic circuit={c} className="h-full w-full" />
        {loaded && <span className="chip absolute top-2 right-2 border-fg text-fg">Loaded</span>}
        {c.character && <span className="label absolute bottom-2 left-3 text-[10px] text-fg-dim">{c.character.join(" · ")}</span>}
      </div>
      <div className="border-t border-line px-3 py-2.5">
        <div className="display truncate text-[20px] leading-none">{c.name}</div>
        <div className="mt-1 flex items-baseline justify-between gap-3 text-[12px] text-fg-muted">
          <span className="truncate">{c.location}</span>
          <span className="mono shrink-0 text-[11px]">{fmtKm(a.length)} km · {a.turnCount} turns · {fmtLap(a.lapTime)}</span>
        </div>
      </div>
    </button>
  );
}

/** Track outline at consistent visual weight regardless of the circuit's real scale. */
export function Schematic({ circuit: c, className }: { circuit: Circuit; className?: string }) {
  const g = useMemo(() => buildGeometry(c.turns), [c.turns]);
  const { minX, minY, maxX, maxY } = g.bounds;
  const ext = Math.max(maxX - minX, maxY - minY), pad = ext * 0.08, sf = startFinish(g);
  const w = Math.max(c.trackWidth, ext / 60);
  return (
    <svg viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`} className={className} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <path d={g.path} fill="none" stroke="var(--asphalt-edge)" strokeWidth={w * 1.15} strokeLinejoin="round" opacity={0.7} />
      <path d={g.path} fill="none" stroke="var(--asphalt)" strokeWidth={w} strokeLinejoin="round" />
      <line x1={sf.x - sf.nx * w * 0.8} y1={sf.y - sf.ny * w * 0.8} x2={sf.x + sf.nx * w * 0.8} y2={sf.y + sf.ny * w * 0.8} stroke="var(--fg)" strokeWidth={w * 0.25} />
    </svg>
  );
}
