"use client";
import { useMemo, useState } from "react";
import { buildGeometry } from "@/lib/circuit";
import { EXPORT_STYLE_INFO, EXPORT_STYLES, exportJSON, exportSVG, type ExportStyle } from "@/lib/export";
import { download, exportDrawing } from "@/lib/tools";
import { getState, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Export: pick a presentation style, see it, download as SVG, PNG (opaque or transparent) or JSON. */
export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const circuit = useStore((s) => s.circuit);
  const analysis = useStore((s) => s.analysis);
  const [style, setStyle] = useState<ExportStyle>("technical");
  const [busy, setBusy] = useState<string | null>(null);
  const preview = useMemo(() => (open ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(exportSVG(circuit, analysis, buildGeometry(circuit.turns), style))}` : ""), [open, circuit, analysis, style]);
  const save = async (fmt: "svg" | "png" | "png-transparent") => {
    setBusy(fmt);
    try { await exportDrawing(circuit, analysis, fmt, style); } finally { setBusy(null); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[920px] rounded-xl">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>{circuit.name} · drawings are 2400 px wide; JSON carries the definition and analysis.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_260px] gap-5 p-5">
          <div className="flex items-center justify-center border border-line bg-bg p-2">
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
            <div>
              <div className="label mb-1.5">Download</div>
              <div className="grid grid-cols-2 gap-1">
                <Button variant="primary" disabled={!!busy} onClick={() => save("png")}>{busy === "png" ? "Rendering…" : "PNG"}</Button>
                <Button disabled={!!busy} onClick={() => save("png-transparent")}>{busy === "png-transparent" ? "Rendering…" : "PNG · transparent"}</Button>
                <Button disabled={!!busy} onClick={() => save("svg")}>SVG</Button>
                <Button disabled={!!busy} onClick={() => { const { circuit: c, analysis: a } = getState(); download(`${c.id}.json`, exportJSON(c, a), "application/json"); }}>JSON</Button>
              </div>
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
