"use client";
import { useLocalValue } from "./local-store";

const DEFAULT = "80";
const init = () => DEFAULT;
const normalize = (value: number) => Number.isFinite(value)
  ? Math.max(0, Math.min(100, Math.round(value)))
  : Number(DEFAULT);

/**
 * Per-listener volume. Lives only in this browser — never synced to the room —
 * so one person can turn it down to talk while everyone else keeps it loud.
 */
export function useLocalVolume(): [number, (v: number) => void] {
  const [raw, setRaw] = useLocalValue("vibe:volume", init);
  const volume = raw === null ? Number(DEFAULT) : normalize(Number(raw));
  const set = (v: number) => setRaw(String(normalize(v)));
  return [volume, set];
}
