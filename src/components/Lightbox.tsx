"use client";

import { useEffect, useRef, useState } from "react";
import type { PhotoDto } from "@/lib/client";

type Props = {
  photos: PhotoDto[];
  index: number;
  setIndex: (i: number) => void;
  onClose: () => void;
  onMakeMain: (p: PhotoDto) => void;
  onDelete: (p: PhotoDto) => void;
};

/**
 * Полноэкранный просмотр: горизонтальный свайп — между фото,
 * pinch и double-tap — зум, свайп вниз (без зума) — закрыть.
 */
export function Lightbox({ photos, index, setIndex, onClose, onMakeMain, onDelete }: Props) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [anim, setAnim] = useState(false);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const base = useRef({ scale: 1, panX: 0, panY: 0, dist: 0, lastTap: 0 });
  const photo = photos[index];

  useEffect(() => {
    // фото сменилось — сбрасываем зум
    setScale(1);
    setPan({ x: 0, y: 0 });
    setDrag({ x: 0, y: 0 });
  }, [index]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function dist() {
    const [a, b] = Array.from(ptrs.current.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setAnim(false);
    if (ptrs.current.size === 1) {
      const now = Date.now();
      if (now - base.current.lastTap < 300) {
        // double-tap: 1 ↔ 2.2
        const next = scale > 1 ? 1 : 2.2;
        setAnim(true);
        setScale(next);
        setPan({ x: 0, y: 0 });
        base.current.lastTap = 0;
      } else {
        base.current.lastTap = now;
      }
      base.current.panX = pan.x;
      base.current.panY = pan.y;
    } else if (ptrs.current.size === 2) {
      base.current.dist = dist();
      base.current.scale = scale;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!ptrs.current.has(e.pointerId)) return;
    const prev = ptrs.current.get(e.pointerId)!;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (ptrs.current.size === 2) {
      const next = Math.min(4, Math.max(1, (base.current.scale * dist()) / base.current.dist));
      setScale(next);
      if (next === 1) setPan({ x: 0, y: 0 });
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (scale > 1) {
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else {
      setDrag((d) => ({ x: d.x + dx, y: d.y + dy }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size > 0) return;

    if (scale > 1) return; // зум-режим: панораму не сбрасываем
    const { x, y } = drag;
    setAnim(true);
    setDrag({ x: 0, y: 0 });
    if (y > 90 && Math.abs(y) > Math.abs(x)) {
      onClose();
    } else if (x < -70 && index < photos.length - 1) {
      setIndex(index + 1);
    } else if (x > 70 && index > 0) {
      setIndex(index - 1);
    }
  }

  if (!photo) return null;
  return (
    <div className="lb" role="dialog" aria-label="Просмотр фото">
      <div
        className="lb-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={photo.url}
          alt=""
          draggable={false}
          className={anim ? "anim" : ""}
          style={{
            transform: `translate(${pan.x + drag.x}px, ${pan.y + drag.y}px) scale(${scale})`,
            opacity: scale === 1 && drag.y > 0 ? Math.max(0.4, 1 - drag.y / 400) : 1,
          }}
        />
      </div>
      <button className="lb-close" onClick={onClose} aria-label="Закрыть">
        ✕
      </button>
      <div className="lb-count">
        {index + 1} / {photos.length}
      </div>
      <div className="lb-foot">
        <button
          className="lb-act"
          disabled={photo.isHoofdfoto}
          onClick={() => onMakeMain(photo)}
        >
          {photo.isHoofdfoto ? "★ Главное" : "☆ Сделать главным"}
        </button>
        <button className="lb-act danger" onClick={() => onDelete(photo)}>
          Удалить
        </button>
      </div>
    </div>
  );
}
