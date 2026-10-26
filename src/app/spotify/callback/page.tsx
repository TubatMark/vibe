"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { completeAuth } from "@/lib/spotify-auth";
import { Button } from "@/components/ui/button";

/** Where Spotify sends the listener back to after they approve (or don't). */
export default function SpotifyCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    // The exchange burns the one-time code, so never run it twice.
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const denied = params.get("error");
        if (denied) {
          throw new Error(
            denied === "access_denied" ? "You didn't approve the connection." : denied,
          );
        }
        const code = params.get("code");
        const state = params.get("state");
        if (!code || !state) throw new Error("Spotify didn't send a code back.");
        router.replace(await completeAuth(code, state));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
    })();
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
      {error ? (
        <>
          <p className="text-foreground">{error}</p>
          <Button asChild variant="secondary">
            <Link href="/">go home</Link>
          </Button>
        </>
      ) : (
        <p>connecting spotify…</p>
      )}
    </main>
  );
}
