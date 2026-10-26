"use client";
import { Button } from "@/components/ui/button";

/** Shown on every page while the app runs without a Convex deployment. */
export function DemoBanner({ asHost, onToggle }: { asHost?: boolean; onToggle?: () => void }) {
  return (
    <div className="demo-banner flex items-center justify-between gap-3 border-b bg-card/50 px-4 py-2 text-xs text-muted-foreground">
      <span>Preview · room activity is illustrative and resets on reload.</span>
      {onToggle && (
        <Button size="sm" variant="outline" onClick={onToggle}>
          viewing as {asHost ? "host" : "guest"}
        </Button>
      )}
    </div>
  );
}
