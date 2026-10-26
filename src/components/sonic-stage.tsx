"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Pause, Play, Shuffle } from "lucide-react";
import { useLocalValue } from "@/lib/local-store";
import "./sonic-stage.css";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const FRAME_MS = 1000 / 30;
const TAU = Math.PI * 2;

function subscribeToReducedMotion(listener: () => void) {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function getReducedMotion() {
  return window.matchMedia(MOTION_QUERY).matches;
}
function getServerReducedMotion() {
  return false;
}

// Each remix is a small, deliberately limited print palette. No lighting,
// gradients or photographic textures: the moving geometry is the artwork.
const PALETTES = [
  ["#3f4ee8", "#f7f7f2", "#f2ed83", "#c5baf4", "#1c2331", "#f7f7f2"],
  ["#1c2331", "#c5baf4", "#f2ed83", "#f2ed83", "#1c2331", "#c5baf4"],
  ["#c5baf4", "#1c2331", "#f7f7f2", "#3f4ee8", "#f7f7f2", "#f2ed83"],
] as const;

/** An original optical duet. The animation is decorative, not audio analysis. */
export function SonicStage({ compact = false }: { compact?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reconcileRef = useRef<(() => void) | null>(null);
  const remixRef = useRef<(() => void) | null>(null);
  const [preference, setPreference] = useLocalValue("vibe:atmosphere-paused");
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    getServerReducedMotion,
  );
  const paused = preference === "true";
  const motionStopped = paused || reducedMotion;
  const stoppedRef = useRef(motionStopped);

  useEffect(() => {
    stoppedRef.current = motionStopped;
    reconcileRef.current?.();
  }, [motionStopped]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ctx = context;
    const surface = canvas;
    let width = 560;
    let height = 260;
    let pixelRatio = 1;
    let artworkScale = 1;
    let inView = true;
    let running = false;
    let frameId = 0;
    let lastPaint = 0;
    let previous = 0;
    let elapsed = 0;
    let remix = 0;
    let arrangement = 0;
    let arrangementTarget = 0;
    let arrangementVelocity = 0;
    let pointerX = 0;
    let pointerY = 0;
    let springX = 0;
    let springY = 0;
    let velocityX = 0;
    let velocityY = 0;
    let pressed = false;
    let compression = 0;
    let compressionVelocity = 0;

    function record(
      x: number,
      y: number,
      radius: number,
      rotation: number,
      squeeze: number,
      phase: number,
      right: boolean,
    ) {
      const palette = PALETTES[remix];
      const offset = right ? 3 : 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.scale(1, squeeze);
      ctx.fillStyle = palette[offset];
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 0.93, 0, 0, TAU);
      ctx.fill();

      // Nested ellipses drift around one shared centre. Small changes in their
      // aspect and eccentricity create an optical "breath", without particles.
      ctx.strokeStyle = palette[offset + 1];
      ctx.lineWidth = 2.2;
      for (let ring = 0; ring < 16; ring++) {
        const progress = ring / 15;
        const ringRadius = radius * (0.955 - progress * 0.67);
        const eccentricity = Math.sin(phase + progress * 2.1) * radius * 0.025;
        const aspect = 0.82 + Math.sin(phase * 0.8 + progress * 2.4) * 0.075;
        ctx.beginPath();
        ctx.ellipse(
          eccentricity,
          Math.cos(phase + progress * 2) * radius * 0.012,
          ringRadius,
          ringRadius * aspect,
          Math.sin(phase * 0.6) * 0.12 * progress,
          0,
          TAU,
        );
        ctx.stroke();
      }

      // The contrasting centre is flat ink, with a deliberate off-centre cut.
      ctx.fillStyle = palette[offset + 2];
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * (right ? 0.26 : 0.237), radius * 0.23, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      // Keep the social labels upright while their records turn around them.
      ctx.fillStyle = "#1c2331";
      ctx.font = `600 ${Math.max(right ? 10 : 12, 9.5 / artworkScale)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (right) {
        ctx.fillText("your", x, y - 5);
        ctx.fillText("people", x, y + 7);
      } else {
        ctx.fillText("you", x, y + 0.5);
      }
    }

    function draw() {
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const scale = Math.min(width / 560, height / 260);
      artworkScale = scale;
      ctx.translate((width - 560 * scale) / 2, (height - 260 * scale) / 2);
      ctx.scale(scale, scale);
      const phase = elapsed * 0.6;
      const remixAngle = arrangement * 0.7;
      const leftRotation = -0.28 + Math.sin(phase * 0.57) * 0.22 + remixAngle;
      const rightRotation = 0.36 - Math.cos(phase * 0.63) * 0.24 - remixAngle * 0.8;
      const leftSqueeze = 0.92 + Math.sin(phase) * 0.075 - compression * 0.12;
      const rightSqueeze = 0.95 + Math.sin(phase + 2.5) * 0.055 + compression * 0.1;

      record(
        175 + springX * 20 + Math.sin(phase * 0.7) * 5,
        126 + springY * 12,
        124,
        leftRotation,
        leftSqueeze,
        phase,
        false,
      );
      record(
        384 - springX * 17 + Math.sin(phase * 0.8 + 2) * 6,
        142 - springY * 15 + Math.sin(phase * 0.65) * 5,
        110,
        rightRotation,
        rightSqueeze,
        phase + 2.3,
        true,
      );
    }

    function frame(timestamp: number) {
      if (!running) return;
      if (timestamp - lastPaint >= FRAME_MS) {
        const delta = previous ? Math.min((timestamp - previous) / 1000, 0.05) : 1 / 30;
        lastPaint = timestamp - ((timestamp - lastPaint) % FRAME_MS);
        previous = timestamp;
        elapsed += delta;
        velocityX += ((pointerX - springX) * 58 - velocityX * 10) * delta;
        velocityY += ((pointerY - springY) * 58 - velocityY * 10) * delta;
        springX += velocityX * delta;
        springY += velocityY * delta;
        compressionVelocity += (((pressed ? 1 : 0) - compression) * 90 - compressionVelocity * 11) * delta;
        compression += compressionVelocity * delta;
        arrangementVelocity += ((arrangementTarget - arrangement) * 68 - arrangementVelocity * 11) * delta;
        arrangement += arrangementVelocity * delta;
        draw();
      }
      frameId = window.requestAnimationFrame(frame);
    }

    function reconcile() {
      const shouldRun = !stoppedRef.current && !document.hidden && inView;
      if (running === shouldRun) return;
      running = shouldRun;
      window.cancelAnimationFrame(frameId);
      lastPaint = previous = 0;
      if (running) frameId = window.requestAnimationFrame(frame);
    }

    function resize() {
      const bounds = surface.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
      surface.width = Math.round(width * pixelRatio);
      surface.height = Math.round(height * pixelRatio);
      draw();
    }

    function pointerMove(event: PointerEvent) {
      if (stoppedRef.current || (event.pointerType === "touch" && !pressed)) return;
      const bounds = surface.getBoundingClientRect();
      pointerX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
      pointerY = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
    }
    function pointerDown(event: PointerEvent) {
      if (stoppedRef.current) return;
      pressed = true;
      pointerMove(event);
    }
    function pointerReset() {
      pointerX = pointerY = 0;
      pressed = false;
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(surface);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      reconcile();
    }, { threshold: 0.01 });
    intersectionObserver.observe(surface);
    surface.addEventListener("pointermove", pointerMove, { passive: true });
    surface.addEventListener("pointerdown", pointerDown, { passive: true });
    surface.addEventListener("pointerleave", pointerReset);
    surface.addEventListener("pointercancel", pointerReset);
    window.addEventListener("pointerup", pointerReset);
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("resize", resize, { passive: true });
    reconcileRef.current = reconcile;
    remixRef.current = () => {
      remix = (remix + 1) % PALETTES.length;
      arrangementTarget += 1;
      if (stoppedRef.current) {
        arrangement = arrangementTarget;
        arrangementVelocity = 0;
      } else {
        compressionVelocity = -3.5;
      }
      draw();
    };
    resize();
    reconcile();

    return () => {
      running = false;
      window.cancelAnimationFrame(frameId);
      reconcileRef.current = null;
      remixRef.current = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      surface.removeEventListener("pointermove", pointerMove);
      surface.removeEventListener("pointerdown", pointerDown);
      surface.removeEventListener("pointerleave", pointerReset);
      surface.removeEventListener("pointercancel", pointerReset);
      window.removeEventListener("pointerup", pointerReset);
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const MotionIcon = motionStopped ? Play : Pause;

  return (
    <div className={`sonic-stage${compact ? " sonic-stage--compact" : ""}`}>
      <div
        className="sonic-stage__art"
        role="img"
        aria-label="Two colourful, concentric record shapes: you and your people, moving together."
      >
        <canvas ref={canvasRef} className="sonic-stage__canvas" aria-hidden="true" />
      </div>
      <div className="sonic-stage__controls">
        <button
          type="button"
          className="sonic-stage__remix"
          onClick={() => remixRef.current?.()}
        >
          <Shuffle size={14} strokeWidth={1.6} aria-hidden="true" />
          <span>Remix the shape</span>
        </button>
        <button
          type="button"
          className="sonic-stage__motion"
          disabled={reducedMotion}
          onClick={() => setPreference(paused ? "false" : "true")}
          aria-label={reducedMotion ? "Motion follows your reduced motion setting" : motionStopped ? "Resume animation" : "Pause animation"}
          aria-pressed={!motionStopped}
          title={reducedMotion ? "Your device prefers reduced motion" : undefined}
        >
          <MotionIcon size={13} strokeWidth={1.7} aria-hidden="true" />
          <span>{reducedMotion ? "Motion off" : motionStopped ? "Resume motion" : "Pause motion"}</span>
        </button>
      </div>
    </div>
  );
}
