import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the production TypeScript with controlled browser storage failures.
// No browser, test framework, or additional runtime dependency is required.
const root = path.resolve(import.meta.dirname, "..");
function createStore({ server = false } = {}) {
  const disk = new Map();
  const events = new Map();
  const cleanup = [];
  let denyReads = false;
  let denyWrites = false;
  let getterBlocked = false;
  const storage = {
    getItem(key) {
      if (denyReads) throw new Error("Storage access denied");
      return disk.get(key) ?? null;
    },
    setItem(key, value) {
      if (denyWrites) throw new Error("Quota exceeded");
      disk.set(key, value);
    },
  };
  const browser = {
    get localStorage() {
      if (getterBlocked) throw new Error("Storage is disabled");
      return storage;
    },
    addEventListener(type, listener) {
      if (!events.has(type)) events.set(type, new Set());
      events.get(type).add(listener);
    },
    removeEventListener(type, listener) { events.get(type)?.delete(listener); },
  };
  const react = {
    useCallback: (fn) => fn,
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
      if (server) return getServerSnapshot();
      cleanup.push(subscribe(() => {}));
      return getSnapshot();
    },
  };
  function load(file, dependencies = {}) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const sandboxModule = { exports: {} };
    const context = { module: sandboxModule, exports: sandboxModule.exports, require: (name) => {
      if (name === "react") return react;
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    } };
    if (!server) context.window = browser;
    vm.runInNewContext(compiled, context, { filename: file });
    return sandboxModule.exports;
  }
  const store = load("src/lib/local-store.ts");
  return {
    ...store, disk, cleanup, load,
    block({ reads = false, writes = false, getter = false } = {}) {
      denyReads = reads; denyWrites = writes; getterBlocked = getter;
    },
    storageEvent(key) { for (const listener of events.get("storage") ?? []) listener({ key }); },
    listenerCount() { return events.get("storage")?.size ?? 0; },
  };
}

test("blocked storage keeps one anonymous identity and session preferences", () => {
  const store = createStore();
  store.block({ getter: true });
  let generated = 0;
  const initialId = () => `guest-${++generated}`;
  assert.equal(store.readLocal("vibe:userId", initialId), "guest-1");
  assert.equal(store.readLocal("vibe:userId", initialId), "guest-1");
  assert.equal(store.readLocal("vibe:userId", initialId), "guest-1");
  assert.equal(generated, 1);
  store.writeLocal("vibe:name", "Kitchen DJ");
  store.writeLocal("vibe:nameConfirmed", "true");
  store.writeLocal("vibe:theme", "dark");
  assert.equal(store.readLocal("vibe:name"), "Kitchen DJ");
  assert.equal(store.readLocal("vibe:nameConfirmed"), "true");
  assert.equal(store.readLocal("vibe:theme"), "dark");
  assert.equal(store.readLocal("missing"), null);
  store.block();
  assert.equal(store.readLocal("vibe:userId", initialId), "guest-1");
  assert.equal(store.disk.get("vibe:userId"), "guest-1");
  assert.equal(generated, 1);
});

test("a failed write remains visible instead of reverting to stale disk data", () => {
  const store = createStore();
  store.disk.set("vibe:theme", "light");
  assert.equal(store.readLocal("vibe:theme"), "light");
  store.block({ writes: true });
  store.writeLocal("vibe:theme", "dark");
  assert.equal(store.readLocal("vibe:theme"), "dark");
  assert.equal(store.disk.get("vibe:theme"), "light");
  store.block();
  assert.equal(store.readLocal("vibe:theme"), "dark");
  assert.equal(store.disk.get("vibe:theme"), "dark");
  store.writeLocal("vibe:spotify", "");
  assert.equal(store.readLocal("vibe:spotify", () => "unexpected"), "");
});

test("read failures retain the last known identity without rerunning its initializer", () => {
  const store = createStore();
  store.disk.set("vibe:userId", "existing-guest");
  assert.equal(store.readLocal("vibe:userId"), "existing-guest");
  store.block({ reads: true });
  assert.equal(store.readLocal("vibe:userId", () => { throw new Error("Identity changed"); }), "existing-guest");
  assert.equal(store.readLocal("vibe:userId", () => { throw new Error("Identity changed"); }), "existing-guest");
});

test("normal cross-tab updates, removals and clear invalidate session fallbacks", () => {
  const store = createStore();
  store.useLocalValue("vibe:theme", () => "light");
  store.useLocalValue("vibe:name", () => "Original");
  assert.equal(store.listenerCount(), 1);
  store.disk.set("vibe:theme", "dark");
  store.storageEvent("vibe:theme");
  assert.equal(store.readLocal("vibe:theme"), "dark");
  store.disk.delete("vibe:name");
  store.storageEvent("vibe:name");
  assert.equal(store.readLocal("vibe:name", () => "New guest"), "New guest");
  store.disk.clear();
  store.storageEvent(null);
  assert.equal(store.readLocal("vibe:theme", () => "light"), "light");
  for (const unsubscribe of store.cleanup) unsubscribe();
  assert.equal(store.listenerCount(), 0);
});

test("server snapshots never initialize or retain browser identities", () => {
  const store = createStore({ server: true });
  const init = () => { throw new Error("Server initialized an identity"); };
  assert.equal(store.readLocal("vibe:userId", init), null);
  assert.equal(store.useLocalValue("vibe:userId", init)[0], null);
  store.writeLocal("vibe:userId", "should-not-persist");
  assert.equal(store.disk.size, 0);
});

test("listener volume remains finite and within range when saved data is invalid", () => {
  const store = createStore();
  const { useLocalVolume: readVolume } = store.load("src/lib/volume.ts", { "./local-store": store });
  for (const [saved, expected] of [["invalid", 80], ["Infinity", 80], ["999", 100], ["-2", 0], ["42.7", 43]]) {
    store.writeLocal("vibe:volume", saved);
    assert.equal(readVolume()[0], expected);
  }
  const [, setVolume] = readVolume();
  setVolume(Number.NaN);
  assert.equal(readVolume()[0], 80);
  for (const unsubscribe of store.cleanup) unsubscribe();
});
