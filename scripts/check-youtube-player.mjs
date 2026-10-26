/** Deterministic player regressions. No provider requests or actual playback. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/youtube-player.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

function fixture(overrides = {}) {
  let cursor = 0;
  let dirty = false;
  let tree;
  const hooks = [];
  const pending = [];
  const scripts = [];
  const players = [];
  const timeouts = new Map();
  const intervals = new Map();
  let timerId = 0;
  const container = { replaceChildren() {} };
  const nodes = () => {
    const result = [];
    const visit = (node) => {
      if (node == null || typeof node === "boolean") return;
      if (Array.isArray(node)) return node.forEach(visit);
      result.push(node);
      if (typeof node === "object") visit(node.props?.children);
    };
    visit(tree);
    return result;
  };
  const hook = (init) => { const i = cursor++; return [hooks[i] ??= init(), i]; };
  const react = {
    useRef(value) { return hook(() => ({ current: value }))[0]; },
    useState(value) {
      const [slot] = hook(() => ({ value: typeof value === "function" ? value() : value }));
      return [slot.value, (next) => {
        const value = typeof next === "function" ? next(slot.value) : next;
        if (!Object.is(slot.value, value)) { slot.value = value; dirty = true; }
      }];
    },
    useCallback(fn, deps) {
      const [slot] = hook(() => ({}));
      if (!same(slot.deps, deps)) { slot.fn = fn; slot.deps = deps; }
      return slot.fn;
    },
    useEffect(fn, deps) {
      const [slot] = hook(() => ({}));
      if (!same(slot.deps, deps)) {
        slot.deps = deps;
        pending.push(() => { slot.cleanup?.(); slot.cleanup = fn(); });
      }
    },
  };
  const states = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  class Player {
    constructor(_mount, options) { this.events = options.events; this.state = -1; this.calls = []; this.muted = false; players.push(this); }
    cueVideoById(id, at) { this.calls.push(["cue", id, at]); this.state = states.CUED; }
    loadVideoById(id, at) { this.calls.push(["load", id, at]); this.state = states.PLAYING; }
    seekTo(at) {
      this.calls.push(["seek", at]);
      // YouTube's documented behavior: seeking a cued video starts playback.
      if (this.state !== states.PAUSED) this.state = states.PLAYING;
    }
    getPlayerState() { return this.state; }
    getCurrentTime() { return 0; }
    playVideo() { this.calls.push(["play"]); this.state = states.PLAYING; }
    pauseVideo() { this.calls.push(["pause"]); this.state = states.PAUSED; }
    stopVideo() { this.calls.push(["stop"]); this.state = states.UNSTARTED; }
    setVolume(value) { this.calls.push(["volume", value]); }
    isMuted() { return this.muted; }
    mute() { this.muted = true; }
    unMute() { this.muted = false; }
    destroy() { this.calls.push(["destroy"]); }
  }
  const window = { location: { origin: "https://vibe.test" } };
  const context = vm.createContext({
    exports: {}, window,
    document: {
      createElement: () => ({ remove() { this.removed = true; } }),
      head: { appendChild(script) { scripts.push(script); } },
    },
    setTimeout(fn, ms) { const id = ++timerId; timeouts.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    setInterval(fn, ms) { const id = ++timerId; intervals.set(id, { fn, ms }); return id; },
    clearInterval(id) { intervals.delete(id); },
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === "lucide-react") return new Proxy({}, { get: (_, name) => name });
      if (name === "@/components/ui/button") return { Button: "button" };
      throw new Error(`Unexpected module ${name}`);
    },
  });
  vm.runInContext(compiled, context);
  let props = { videoId: "first-track", isPlaying: false, syncKey: 0, getTargetMs: () => 32_000, volume: 80, onEnded() {}, ...overrides };
  function render() {
    cursor = 0;
    dirty = false;
    tree = context.exports.YouTubePlayer(props);
    for (const node of nodes()) if (node?.props?.ref) node.props.ref.current = container;
    while (pending.length) pending.shift()();
  }
  async function flush() {
    for (let i = 0; i < 6; i++) { await Promise.resolve(); if (dirty) render(); }
  }
  render();
  return {
    scripts, players, timeouts, intervals, nodes, flush,
    text: () => nodes().filter((node) => typeof node === "string").join(" "),
    async ready() {
      window.YT = context.YT = { Player, PlayerState: states };
      window.onYouTubeIframeAPIReady();
      await flush();
      players.at(-1).events.onReady({ target: players.at(-1) });
      await flush();
      return players.at(-1);
    },
    async update(next) { props = { ...props, ...next }; render(); await flush(); },
    async tick(ms) {
      for (const [id, timer] of [...timeouts]) if (timer.ms <= ms) { timeouts.delete(id); timer.fn(); }
      await flush();
    },
    button(label) {
      return nodes().find((node) => node?.type === "button" && (JSON.stringify(node.props.children) ?? "").toLowerCase().includes(label.toLowerCase()));
    },
    unmount() { for (const slot of hooks) slot.cleanup?.(); },
  };
}

test("an initially paused video stays cued without starting playback", async () => {
  const view = fixture();
  const player = await view.ready();
  assert.deepEqual(player.calls.filter(([call]) => ["cue", "load"].includes(call)), [["cue", "first-track", 32]]);
  assert.equal(player.state, 5, "seekTo from CUED must not start a paused room");
  view.unmount();
});

test("blocked autoplay offers a local listening gesture and follows the current track", async () => {
  let roomToggles = 0;
  const view = fixture({ isPlaying: true, onToggle() { roomToggles++; } });
  const player = await view.ready();
  assert.equal(typeof player.events.onAutoplayBlocked, "function");
  player.events.onAutoplayBlocked({ target: player });
  await view.flush();
  const button = view.button("Start listening");
  assert.ok(button, "blocked playback needs a visible local start control");
  const before = player.calls.length;
  button.props.onClick();
  assert.ok(player.calls.slice(before).some(([call]) => call === "play"));
  assert.equal(roomToggles, 0, "starting this listener must not change room playback");
  await view.update({ videoId: "next-track" });
  assert.equal(view.button("Start listening"), undefined, "a previous track's blocked state must not leak");
  view.unmount();
});

test("paused rooms cannot be started from a stale local listening control", async () => {
  const view = fixture({ isPlaying: true });
  const player = await view.ready();
  assert.equal(typeof player.events.onAutoplayBlocked, "function");
  player.events.onAutoplayBlocked({ target: player });
  await view.flush();
  const button = view.button("Start listening");
  await view.update({ isPlaying: false });
  const before = player.calls.length;
  button.props.onClick();
  assert.equal(player.calls.slice(before).some(([call]) => call === "play"), false);
  assert.equal(view.button("Start listening"), undefined);
  view.unmount();
});

test("failed API requests display recovery and a retry can load the current video", async () => {
  const view = fixture();
  assert.equal(typeof view.scripts[0].onerror, "function", "script loading must handle network failure");
  view.scripts[0].onerror();
  await view.flush();
  assert.match(view.text(), /couldn.t load/i);
  view.button("Try again").props.onClick();
  await view.flush();
  assert.equal(view.scripts.length, 2, "retry must request the API again");
  const player = await view.ready();
  assert.equal(player.calls.some(([call]) => call === "cue"), true);
  view.unmount();
  assert.equal(view.intervals.size, 0, "component intervals must be cleaned up");
  assert.equal(view.timeouts.size, 0, "loading timeout must be cleaned up after success");
});

test("an API load that never finishes times out with a usable retry", async () => {
  const view = fixture();
  await view.tick(15_000);
  assert.match(view.text(), /couldn.t load/i);
  assert.ok(view.button("Try again"));
  view.unmount();
});

test("leaving the player clears a scheduled resync and stops its polling", async () => {
  const view = fixture({ isPlaying: true });
  const player = await view.ready();
  player.events.onStateChange({ data: 2, target: player });
  assert.equal(view.timeouts.size, 1);
  view.unmount();
  assert.equal(view.timeouts.size, 0);
  assert.equal(view.intervals.size, 0);
});
