"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useLocalUser } from "@/lib/user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Home() {
  const router = useRouter();
  const [user] = useLocalUser();
  const createRoom = useMutation(api.rooms.create);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!user) return;
    setBusy(true);
    try {
      const slug = await createRoom({ name, hostId: user.id });
      router.push(`/r/${slug}`);
    } finally {
      setBusy(false);
    }
  }

  function onJoin() {
    const slug = code.trim().split("/").pop();
    if (slug) router.push(`/r/${slug}`);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 p-6">
      <div className="text-center space-y-2">
        <h1 className="text-6xl font-semibold tracking-tight">vibe</h1>
        <p className="text-muted-foreground">
          Listen together. Everyone hears the same song — at their own volume.
        </p>
      </div>

      <div className="grid w-full max-w-md gap-6">
        <section className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-medium">Start a room</h2>
          <Input
            placeholder="room name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCreate()}
          />
          <Button className="w-full" onClick={onCreate} disabled={!user || busy}>
            {busy ? "creating…" : "create room"}
          </Button>
        </section>

        <section className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-medium">Join a room</h2>
          <div className="flex gap-2">
            <Input
              placeholder="room code or link"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onJoin()}
            />
            <Button variant="secondary" onClick={onJoin} disabled={!code.trim()}>
              join
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
