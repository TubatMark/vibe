"use client";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Tiny localStorage-backed store usable with useSyncExternalStore.
 * Returns null on the server and before hydration so there's no mismatch.
 * When browser storage is unavailable, values last for this page session.
 */
const listeners = new Set<() => void>();
const sessionValues = new Map<string, string>();
const pendingWrites = new Set<string>();
function emit() {
  for (const l of listeners) l();
}
function onStorage(event: StorageEvent) {
  // A change from another tab supersedes this tab's cached value, including
  // removals and storage.clear(). Reads then use the browser's current value.
  if (event.key === null) {
    sessionValues.clear();
    pendingWrites.clear();
  } else {
    sessionValues.delete(event.key);
    pendingWrites.delete(event.key);
  }
  emit();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function persist(key: string, value: string) {
  sessionValues.set(key, value);
  try {
    window.localStorage.setItem(key, value);
    pendingWrites.delete(key);
  } catch {
    pendingWrites.add(key);
  }
}

export function readLocal(key: string, init?: () => string): string | null {
  // Never keep one server request's identity in module memory for another one.
  if (typeof window === "undefined") return null;
  if (pendingWrites.has(key)) {
    const value = sessionValues.get(key)!;
    // Storage may become available later. Preserve the same session identity
    // and retry persisting it rather than generating a second one.
    persist(key, value);
    return value;
  }
  try {
    const stored = window.localStorage.getItem(key);
    const value = stored ?? sessionValues.get(key) ?? init?.() ?? null;
    if (value !== null) {
      sessionValues.set(key, value);
      if (stored === null) persist(key, value);
    }
    return value;
  } catch {
    const value = sessionValues.get(key) ?? init?.() ?? null;
    if (value !== null) {
      sessionValues.set(key, value);
      pendingWrites.add(key);
    }
    return value;
  }
}

export function writeLocal(key: string, value: string) {
  if (typeof window === "undefined") return;
  persist(key, value);
  emit();
}

export function useLocalValue(key: string, init?: () => string) {
  const get = useCallback(() => readLocal(key, init), [key, init]);
  const value = useSyncExternalStore(subscribe, get, () => null);
  const set = useCallback((v: string) => writeLocal(key, v), [key]);
  return [value, set] as const;
}
