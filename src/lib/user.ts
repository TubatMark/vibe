"use client";
import { nanoid } from "nanoid";
import { useLocalValue } from "./local-store";

const ADJ = ["mellow", "neon", "lofi", "velvet", "static", "cosmic", "dusty", "midnight"];
const NOUN = ["fox", "owl", "koi", "moth", "lynx", "otter", "crane", "wolf"];
function randomName() {
  return `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`;
}
const newId = () => nanoid(12);

export type LocalUser = { id: string; name: string };

const initialNameConfirmation = () => "false";

/** A chosen name is all a guest needs; this is never an account or password. */
export function useGuestNameConfirmed() {
  const [value, setValue] = useLocalValue("vibe:nameConfirmed", initialNameConfirmation);
  return [value === "true", () => setValue("true")] as const;
}

/** Anonymous guest identity persisted in localStorage. No sign-up needed. */
export function useLocalUser(): [LocalUser | null, (name: string) => void] {
  const [id] = useLocalValue("vibe:userId", newId);
  const [name, setName] = useLocalValue("vibe:name", randomName);
  const rename = (n: string) => setName(n.trim().slice(0, 24) || randomName());
  if (!id || !name) return [null, rename];
  return [{ id, name }, rename];
}
