"use client";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Tiny localStorage-backed store usable with useSyncExternalStore.
 * Returns null on the server and before hydration so there's no mismatch.
 */
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function readLocal(key: string, init?: () => string): string | null {
  try {
    let v = localStorage.getItem(key);
    if (v === null && init) {
      v = init();
      localStorage.setItem(key, v);
    }
    return v;
  } catch {
    return init ? init() : null;
  }
}

export function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
  emit();
}

export function useLocalValue(key: string, init?: () => string) {
  const get = useCallback(() => readLocal(key, init), [key, init]);
  const value = useSyncExternalStore(subscribe, get, () => null);
  const set = useCallback((v: string) => writeLocal(key, v), [key]);
  return [value, set] as const;
}
