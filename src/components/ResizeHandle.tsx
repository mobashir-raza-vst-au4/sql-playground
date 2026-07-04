"use client";

import { useEffect, useRef, useState } from "react";

/** A number persisted to localStorage — used for remembered panel sizes. */
export function usePersistedSize(key: string, fallback: number): [number, (n: number) => void] {
  const [value, setValue] = useState(fallback);
  // Read once on mount (avoids SSR/hydration mismatch).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(key);
    const n = raw == null ? NaN : Number(raw);
    if (Number.isFinite(n)) setValue(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = (n: number) => {
    setValue(n);
    try {
      window.localStorage.setItem(key, String(Math.round(n)));
    } catch {
      /* ignore quota */
    }
  };
  return [value, set];
}

/**
 * A thin draggable divider. `axis="x"` resizes width (col-resize), `axis="y"`
 * resizes height (row-resize). `invert` subtracts the drag delta instead of
 * adding it — used for panels anchored to the right/bottom, where dragging
 * toward the panel should grow it.
 */
export default function ResizeHandle({
  axis,
  value,
  min,
  max,
  invert = false,
  onChange,
  label,
}: {
  axis: "x" | "y";
  value: number;
  min: number;
  max: number;
  invert?: boolean;
  onChange: (n: number) => void;
  label?: string;
}) {
  const base = useRef(value);
  const startPos = useRef(0);
  const [dragging, setDragging] = useState(false);

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    base.current = value;
    startPos.current = axis === "x" ? e.clientX : e.clientY;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
  };

  const move = (e: React.PointerEvent) => {
    if (!dragging) return;
    const pos = axis === "x" ? e.clientX : e.clientY;
    let delta = pos - startPos.current;
    if (invert) delta = -delta;
    onChange(Math.max(min, Math.min(max, base.current + delta)));
  };

  const up = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };

  const isX = axis === "x";
  return (
    <div
      role="separator"
      aria-orientation={isX ? "vertical" : "horizontal"}
      aria-label={label}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={() => onChange(base.current)}
      className={`relative shrink-0 z-20 group ${
        isX ? "w-1 h-full cursor-col-resize" : "h-1 w-full cursor-row-resize"
      }`}
      style={{ background: dragging ? "var(--accent)" : "var(--border)" }}
    >
      {/* wider invisible hit area so the 1px line is easy to grab */}
      <span
        className={`absolute ${
          isX ? "inset-y-0 -left-1.5 -right-1.5" : "inset-x-0 -top-1.5 -bottom-1.5"
        }`}
      />
      <span
        className={`absolute transition-opacity ${dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"} ${
          isX ? "inset-y-0 -left-0.5 -right-0.5" : "inset-x-0 -top-0.5 -bottom-0.5"
        }`}
        style={{ background: "var(--accent)" }}
      />
    </div>
  );
}
