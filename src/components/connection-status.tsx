"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { useConvex } from "convex/react";
import { WifiOff } from "lucide-react";

const ConnectionContext = createContext(true);
export function useRoomConnected() { return useContext(ConnectionContext); }

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => { window.removeEventListener("online", listener); window.removeEventListener("offline", listener); };
}
function browserOnline() { return navigator.onLine; }
function serverOnline() { return true; }
function serverConnection() { return "connecting" as const; }

/** The real socket state matters even when the browser says it is online. */
export function ConnectionStatus({ children }: { children: React.ReactNode }) {
  const convex = useConvex();
  const subscribeConnection = useCallback((listener: () => void) => convex.subscribeToConnectionState(listener), [convex]);
  // Primitive snapshots remain stable between socket updates. The server
  // snapshot avoids opening a WebSocket while Next prerenders this component.
  const readConnection = useCallback(() => {
    const state = convex.connectionState();
    return state.isWebSocketConnected ? "connected" : state.hasEverConnected ? "reconnecting" : "connecting";
  }, [convex]);
  const connection = useSyncExternalStore(subscribeConnection, readConnection, serverConnection);
  const online = useSyncExternalStore(subscribe, browserOnline, serverOnline);
  const connected = online && connection === "connected";
  return <ConnectionContext value={connected}>
    {!connected && <div className="connection-notice" role="status"><WifiOff size={16} /><span>{!online ? "You’re offline." : connection === "reconnecting" ? "Reconnecting to the room…" : "Connecting to the room…"} Your name and drafts stay here. Changes will be available when the connection returns.</span></div>}
    {children}
  </ConnectionContext>;
}
