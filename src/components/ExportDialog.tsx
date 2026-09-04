"use client";
import { useMemo, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { buildGeometry } from "@/lib/circuit";
import { EXPORT_STYLE_INFO, EXPORT_STYLES, exportJSON, exportSVG, type ExportStyle } from "@/lib/export";
import { download, exportDrawing } from "@/lib/tools";
import { getState, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";

type Fmt = "png" | "svg" | "json";
const FMT: Record<Fmt, { label: string; blurb: string }> = {
  png: { label: "PNG", blurb: "2400 px raster drawing" },
  svg: { label: "SVG", blurb: "Vector drawing" },
  json: { label: "JSON", blurb: "Definition and analysis" },
};

/** Export: pick a style, see it, choose a format once, download. Transparency is a switch that applies to drawings. */
export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const circuit = useStore((s) => s.circuit);
  const analysis = useStore((s) => s.analysis);
  const [style, setStyle] = useState<ExportStyle>("technical");
  const [fmt, setFmt] = useState<Fmt>("png");
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (open ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(exportSVG(circuit, analysis, buildGeometry(circuit.turns), style, { transparent }))}` : ""), [open, circuit, analysis, style, transparent]);
  const save = async () => {
    if (fmt === "json") { const { circuit: c, analysis: a } = getState(); download(`${c.id}.json`, exportJSON(c, a), "application/json"); return; }
    setBusy(true);
    try { await exportDrawing(circuit, analysis, fmt, style, transparent); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[920px] rounded-xl">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>{circuit.name}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_260px] gap-5 p-5">
          <div className={cn("flex items-center justify-center rounded-lg border border-line p-2", transparent ? "bg-[#151515]" : "bg-bg")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview of the export itself */}
            {preview && <img src={preview} alt={`${EXPORT_STYLE_INFO[style].name} export preview`} className="max-h-[440px] w-full object-contain" />}
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <div className="label mb-1.5">Style</div>
              <div className="flex flex-col gap-1">
                {EXPORT_STYLES.map((s) => (
                  <button key={s} onClick={() => setStyle(s)} aria-pressed={style === s} className={cn("rounded-sm border px-2.5 py-2 text-left outline-none transition-colors duration-120 hover:border-line-strong focus-visible:bg-surface-2", style === s ? "border-fg bg-surface-2" : "border-line")}>
                    <div className="text-[12px] font-medium text-fg">{EXPORT_STYLE_INFO[s].name}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-fg-muted">{EXPORT_STYLE_INFO[s].blurb}</div>
                  </button>
                ))}
              </div>
            </div>
            <label className={cn("flex items-center justify-between gap-3 text-[12px] transition-opacity", fmt === "json" ? "opacity-40" : "cursor-pointer")}>
              <span className="text-fg">Transparent background</span>
              <Switch checked={transparent} onCheckedChange={setTransparent} disabled={fmt === "json"} aria-label="Transparent background" />
            </label>
            <div className="flex">
              <Button variant="primary" className="flex-1 rounded-r-none" disabled={busy} onClick={save}><Download />{busy ? "Rendering…" : `Export ${FMT[fmt].label}`}</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="primary" size="icon" className="-ml-px rounded-l-none border-l-bg/30" aria-label="Choose export format"><ChevronDown /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px]">
                  {(Object.keys(FMT) as Fmt[]).map((f) => (
                    <DropdownMenuItem key={f} onSelect={() => setFmt(f)} className={cn(f === fmt && "bg-surface-2")}>
                      <span className="w-10 font-medium">{FMT[f].label}</span><span className="text-fg-muted">{FMT[f].blurb}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <DialogFooter>
          <span className="text-[11px] text-fg-dim">Design analysis from a point-mass model · not survey data or a certified assessment</span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
