"use client";

import { useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  rightLabel: string;
  rightColor?: string;
  onRight: () => void;
  onLeft: () => void;
};

const THRESHOLD = 64;
const MAX = 104;

/** Свайп вправо — действие (продано/вернуть), влево — открыть карточку. */
export function SwipeCard({ children, rightLabel, rightColor, onRight, onLeft }: Props) {
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const mode = useRef<"none" | "h" | "v">("none");
  const suppressClick = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    mode.current = "none";
    suppressClick.current = false;
    setAnim(false);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.touches[0];
    const ddx = t.clientX - start.current.x;
    const ddy = t.clientY - start.current.y;
    if (mode.current === "none") {
      if (Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy) * 1.3) mode.current = "h";
      else if (Math.abs(ddy) > 10) mode.current = "v";
    }
    if (mode.current === "h") {
      suppressClick.current = true;
      setDx(Math.max(-MAX, Math.min(MAX, ddx)));
    }
  }

  function onTouchEnd() {
    start.current = null;
    if (mode.current !== "h") return;
    const d = dx;
    setAnim(true);
    setDx(0);
    if (d > THRESHOLD) onRight();
    else if (d < -THRESHOLD) onLeft();
  }

  return (
    <div className="swipe" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        className="swipe-bg swipe-bg-r"
        style={{ opacity: dx > 0 ? Math.min(1, dx / THRESHOLD) : 0, background: rightColor }}
      >
        {rightLabel}
      </div>
      <div className="swipe-bg swipe-bg-l" style={{ opacity: dx < 0 ? Math.min(1, -dx / THRESHOLD) : 0 }}>
        Открыть
      </div>
      <div
        className={`swipe-fg ${anim ? "anim" : ""}`}
        style={{ transform: `translateX(${dx}px)` }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
