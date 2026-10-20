"use client";
import { useLocalValue } from "./local-store";

const DEFAULT = "80";
const init = () => DEFAULT;

/**
 * Per-listener volume. Lives only in this browser — never synced to the room —
 * so one person can turn it down to talk while everyone else keeps it loud.
 */
export function useLocalVolume(): [number, (v: number) => void] {
  const [raw, setRaw] = useLocalValue("vibe:volume", init);
  const volume = raw === null ? Number(DEFAULT) : Number(raw);
  const set = (v: number) => setRaw(String(Math.max(0, Math.min(100, Math.round(v)))));
  return [volume, set];
}
