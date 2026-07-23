"use client";

import { useEffect } from "react";

export type UndoState = { label: string; undo: () => Promise<void> | void } | null;

// Действие уже применено к моменту показа тоста; undo только откатывает.
export function UndoToast({ toast, onDone }: { toast: UndoState; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [toast, onDone]);

  if (!toast) return null;
  return (
    <div className="undo-toast" role="status">
      <span className="ut-label">{toast.label}</span>
      <button
        className="ut-btn"
        onClick={async () => {
          try {
            await toast.undo();
          } finally {
            onDone();
          }
        }}
      >
        Отменить
      </button>
    </div>
  );
}
