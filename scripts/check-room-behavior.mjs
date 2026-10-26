/** RoomView regressions against its actual source. No server, provider requests, or playback. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/r/[slug]/room.tsx", import.meta.url), "utf8");
// Expose the existing view only inside this test's VM; production exports stay unchanged.
const compiled = ts.transpileModule(`${source}\nexport { RoomView };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const message = (id, userId = "friend") => ({ _id: id, userId, name: userId, text: `Message ${id}` });

function fixture({ connected = true, actions: actionOverrides = {} } = {}) {
  let cursor = 0, dirty = false, tree;
  const hooks = [], effects = [], observers = [];
  const domNodes = new Map();
  const events = new Map();
  const document = {
    hidden: false,
    addEventListener(name, listener) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(listener); },
    removeEventListener(name, listener) { events.get(name)?.delete(listener); },
    querySelector() { return null; },
  };
  const hook = init => { const index = cursor++; return hooks[index] ??= init(); };
  const memo = (fn, deps) => {
    const slot = hook(() => ({}));
    if (!same(slot.deps, deps)) { slot.value = fn(); slot.deps = deps; }
    return slot.value;
  };
  const react = {
    useRef(value) { return hook(() => ({ current: value })); },
    useState(value) {
      const slot = hook(() => ({ value: typeof value === "function" ? value() : value }));
      return [slot.value, next => {
        const value = typeof next === "function" ? next(slot.value) : next;
        if (!Object.is(slot.value, value)) { slot.value = value; dirty = true; }
      }];
    },
    useMemo: memo,
    useCallback(fn, deps) { return memo(() => fn, deps); },
    useEffect(fn, deps) {
      const slot = hook(() => ({}));
      if (!same(slot.deps, deps)) {
        slot.deps = deps;
        effects.push(() => { slot.cleanup?.(); slot.cleanup = fn(); });
      }
    },
  };
  class IntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  }
  const components = {
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/slider": { Slider: "slider" },
    "@/components/youtube-player": { YouTubePlayer: "YouTubePlayer" },
    "@/components/spotify-player": { SpotifyPlayer: "SpotifyPlayer" },
    "@/components/room-invite": { RoomInvite: "RoomInvite" },
    "@/components/demo-banner": { DemoBanner: "DemoBanner" },
    "@/components/app-chrome": { Avatar: "Avatar", Brand: "Brand", NameGate: "NameGate", ThemeToggle: "ThemeToggle" },
    "@/components/connection-status": { useRoomConnected: () => connected },
    "@/lib/volume": { useLocalVolume: () => [80, () => {}] },
    "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
  };
  const context = vm.createContext({
    exports: {}, document, IntersectionObserver,
    window: { matchMedia: () => ({ matches: true }) },
    requestAnimationFrame: fn => fn(),
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === "lucide-react") return new Proxy({}, { get: (_, key) => key });
      if (name === "next/link") return { default: "a" };
      if (components[name]) return components[name];
      // These imports are used only by other components in the same module.
      if (["convex/react", "../../../../convex/_generated/api", "@/lib/user", "@/lib/host-token", "@/lib/demo", "@/lib/spotify-auth", "@/lib/track-source", "./room.css"].includes(name)) return {};
      throw new Error(`Unexpected import ${name}`);
    },
  });
  vm.runInContext(compiled, context);
  const actions = {
    play() {}, pause() {}, skip() {}, ended() {}, setMode() {},
    async addTrack() { return "queued"; }, removeTrack() {}, moveTrack() {}, approve() {}, reject() {}, sendMessage() {},
    ...actionOverrides,
  };
  let props = {
    room: { _id: "room", slug: "testroom", name: "Test room", hostId: "host", mode: "open", current: { videoId: "track", title: "Track", author: "Artist", thumbnail: "" }, isPlaying: true, startedAt: 0, pausedAt: 0, serverNow: Date.now() },
    contents: { queue: [], requests: [], listeners: [], messages: [message("first")] },
    actions, user: { id: "host", name: "Host" }, rename() {},
  };
  function nodes() {
    const result = [];
    const visit = node => {
      if (node == null || typeof node === "boolean") return;
      if (Array.isArray(node)) return node.forEach(visit);
      result.push(node);
      if (typeof node === "object") visit(node.props?.children);
    };
    visit(tree);
    return result;
  }
  function render() {
    cursor = 0;
    dirty = false;
    tree = context.exports.RoomView(props);
    for (const node of nodes()) {
      const ref = node?.props?.ref;
      if (!ref) continue;
      if (!domNodes.has(ref)) domNodes.set(ref, {
        scrollTop: 0, scrollHeight: 1000, clientHeight: 300,
        focus() {}, scrollIntoView() {},
      });
      ref.current = domNodes.get(ref);
    }
    while (effects.length) effects.shift()();
  }
  async function flush() {
    for (let i = 0; i < 12; i++) { await Promise.resolve(); if (dirty) render(); }
    assert.equal(dirty, false, "view must settle after updates");
  }
  const input = () => nodes().find(node => node?.props?.["aria-label"] === "Message the room");
  const form = () => nodes().find(node => node?.type === "form" && node.props.className === "room-chat-form");
  const unread = () => nodes().filter(node => node?.props?.className === "room-unread").map(node => node.props["aria-label"]);
  render();
  return {
    nodes, flush, input, unread,
    text: () => nodes().filter(node => typeof node === "string").join(" "),
    submit() { form().props.onSubmit({ preventDefault() {} }); },
    async type(value) { input().props.onChange({ target: { value } }); await flush(); },
    async messages(messages) { props = { ...props, contents: { ...props.contents, messages } }; render(); await flush(); },
    async intersect(visible) {
      const observer = observers.find(observer => !observer.disconnected);
      assert.ok(observer, "chat visibility must be observed");
      observer.callback([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]);
      await flush();
    },
    async hidden(hidden) { document.hidden = hidden; for (const listener of events.get("visibilitychange") ?? []) listener(); await flush(); },
    player: () => nodes().find(node => node?.type === "YouTubePlayer"),
    unmount() { for (const slot of hooks) slot.cleanup?.(); assert.ok(observers.every(observer => observer.disconnected), "visibility observers must be cleaned up"); assert.equal(events.get("visibilitychange")?.size ?? 0, 0); },
  };
}

test("pending chat rejects duplicate submissions and keeps the draft after rejection", async () => {
  const request = deferred();
  const sent = [];
  const view = fixture({ actions: { sendMessage(text) { sent.push(text); return request.promise; } } });
  await view.type("Keep my draft");
  view.submit();
  view.submit(); // Same render: this also checks the synchronous duplicate guard.
  await view.flush();
  assert.deepEqual(sent, ["Keep my draft"]);
  assert.equal(view.input().props.value, "Keep my draft");
  assert.equal(view.nodes().find(node => node?.props?.["aria-label"] === "Sending message")?.props.disabled, true);
  request.reject(new Error("Network unavailable"));
  await view.flush();
  assert.equal(view.input().props.value, "Keep my draft");
  assert.match(view.text(), /Message not sent/);
  assert.equal(view.nodes().find(node => node?.props?.["aria-label"] === "Send message")?.props.disabled, false);
  view.unmount();
});

test("successful chat clears only the submitted draft, preserving edits made during the request", async () => {
  const request = deferred();
  const sent = [];
  const view = fixture({ actions: { sendMessage(text) { sent.push(text); return request.promise; } } });
  await view.type("First thought");
  view.submit();
  await view.flush();
  await view.type("A second thought");
  request.resolve();
  await view.flush();
  assert.deepEqual(sent, ["First thought"]);
  assert.equal(view.input().props.value, "A second thought");
  assert.doesNotMatch(view.text(), /Message not sent/);
  view.unmount();
});

test("successful chat clears an unchanged submitted draft", async () => {
  const view = fixture({ actions: { async sendMessage() {} } });
  await view.type("Send this");
  view.submit();
  await view.flush();
  assert.equal(view.input().props.value, "");
  view.unmount();
});

test("messages arriving while chat is outside the viewport remain unread until chat returns", async () => {
  const view = fixture();
  await view.intersect(true);
  await view.intersect(false); // For example, Chat → Player on a phone.
  await view.messages([message("first"), message("outside")]);
  assert.ok(view.unread().includes("1 unread messages"));
  await view.intersect(true);
  assert.equal(view.unread().length, 0);
  view.unmount();
});

test("a background tab does not read incoming messages even when chat intersects the viewport", async () => {
  const view = fixture();
  await view.intersect(true);
  await view.hidden(true);
  await view.messages([message("first"), message("background")]);
  assert.ok(view.unread().includes("1 unread messages"));
  await view.hidden(false);
  assert.equal(view.unread().length, 0);
  view.unmount();
});

test("an offline provider end event still reaches room advancement and pending duplicates are locked", async () => {
  const request = deferred();
  const ended = [];
  let pauses = 0;
  const view = fixture({ connected: false, actions: {
    ended(id) { ended.push(id); return request.promise; },
    pause() { pauses++; },
  } });
  view.player().props.onEnded();
  view.player().props.onEnded();
  view.player().props.onToggle();
  await view.flush();
  assert.deepEqual(ended, ["track"], "automatic completion must survive a disconnected socket");
  assert.equal(pauses, 0, "interactive room changes must still wait for reconnection");
  request.resolve();
  await view.flush();
  view.unmount();
});
