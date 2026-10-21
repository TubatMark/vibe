"use client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { isDemo } from "@/lib/demo";

const convex = isDemo ? null : new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  // In demo mode there is no deployment to talk to, so no provider is mounted —
  // the demo pages never call Convex hooks.
  if (!convex) return <>{children}</>;
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
