"use client";

// Animierter PS-Zähler wie animCount() in docs/vorschau.html: easeOutCubic
// über 650ms, respektiert prefers-reduced-motion (dann sofort der Zielwert,
// keine requestAnimationFrame-Schleife).
import { useEffect, useRef, useState } from "react";

const DURATION_MS = 650;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Animiert von einem vorherigen Zielwert zu `to`. Start ist beim ersten Rendern `to` (kein Sprung von 0). */
export function usePsCounter(to: number): number {
  const [displayed, setDisplayed] = useState(to);
  const prevRef = useRef(to);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = to;
    if (from === to || prefersReducedMotion()) {
      setDisplayed(to);
      return;
    }
    const start = performance.now();
    function tick(now: number) {
      const k = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplayed(Math.round(from + (to - from) * eased));
      if (k < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [to]);

  return displayed;
}
