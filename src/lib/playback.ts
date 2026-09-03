// Simulation playback clock. Kept apart from the design store so 60 fps ticks re-render only the car markers.
import { useSyncExternalStore } from "react";

export const PLAYBACK_RATE = 8; // simulated seconds per real second

type Playback = { playing: boolean; t: number; run: number };
let s: Playback = { playing: false, t: 0, run: 0 };
const listeners = new Set<() => void>();
const set = (p: Partial<Playback>) => { s = { ...s, ...p }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export const getPlayback = () => s;
export function usePlayback<T>(sel: (p: Playback) => T): T {
  return useSyncExternalStore(subscribe, () => sel(s), () => sel(s));
}
export const play = () => set({ playing: true });
export const pause = () => set({ playing: false });
export const restart = (run: number) => set({ t: 0, playing: true, run });
// rAF timestamps can precede a performance.now() sampled between frames, so never step backwards.
export const advance = (dt: number, end: number) => { const t = Math.max(0, s.t + Math.max(0, dt)); set(t >= end ? { t: end, playing: false } : { t }); };
