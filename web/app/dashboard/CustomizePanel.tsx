"use client";

import { useEffect, useState } from "react";
import { WIDGETS, WidgetState } from "./widgets";

export default function CustomizePanel({
  open,
  onClose,
  state,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  state: WidgetState;
  onChange: (next: WidgetState) => void;
}) {
  const [localState, setLocalState] = useState<WidgetState>(state);

  useEffect(() => {
    setLocalState(state);
  }, [state]);

  if (!open) return null;

  function toggle(id: keyof WidgetState) {
    const next = { ...localState, [id]: !localState[id] };
    setLocalState(next);
    onChange(next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Customize metrics
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {WIDGETS.map((w) => (
            <label
              key={w.id}
              className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 hover:bg-gray-800"
            >
              <span className="text-sm text-gray-200">{w.label}</span>
              <input
                type="checkbox"
                checked={localState[w.id]}
                onChange={() => toggle(w.id)}
                className="h-4 w-4 accent-white"
              />
            </label>
          ))}
        </div>

        <div className="mt-6 text-right">
          <button
            onClick={onClose}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-200"
          >
            Luk
          </button>
        </div>
      </div>
    </div>
  );
}