// UI primitives — Slider, Toggle, HoldToggle.
//
// Slider: drag-to-set, used by light brightness + speaker volume.
// Toggle: standard power switch (immediate flip).
// HoldToggle: safe version of the master toggle — destructive direction (off)
// requires a 500ms press-and-hold. Prevents one-handed accidental taps from
// killing all lights mid-dinner.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { I } from './icons.jsx';

export function Slider({ value, onChange, disabled, compact }) {
  const ref = useRef(null);
  const dragging = useRef(false);

  const set = useCallback((clientX) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
    onChange(Math.round(pct));
  }, [onChange]);

  useEffect(() => {
    const mv = (e) => { if (!dragging.current) return; set(e.clientX ?? e.touches?.[0]?.clientX ?? 0); };
    const up = () => { dragging.current = false; document.body.style.cursor = ''; };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  }, [set]);

  return (
    <div
      ref={ref}
      className={compact ? 'slider slider--compact' : 'slider'}
      style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      onPointerDown={(e) => {
        if (disabled) return;
        dragging.current = true;
        document.body.style.cursor = 'grabbing';
        set(e.clientX);
      }}
    >
      <div className="slider-fill" style={{ transform: `scaleX(${value / 100})` }} />
      <div className="slider-thumb" style={{ left: `${value}%` }} />
    </div>
  );
}

export function Toggle({ on, onToggle, ariaLabel }) {
  return (
    <button
      type="button"
      className="power-toggle"
      data-on={on}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    />
  );
}

export function HoldToggle({ on, onToggle, ariaLabel, holdMs = 500 }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  const startHold = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const pct = Math.min(1, elapsed / holdMs);
      setProgress(pct);
      if (pct < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setProgress(0);
        onToggle();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const cancelHold = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setProgress(0);
  };

  if (!on) return <Toggle on={on} onToggle={onToggle} ariaLabel={ariaLabel} />;

  return (
    <button
      className="hold-btn"
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      aria-label="Hold to turn all lights off"
      title="Hold 0.5 s to turn all lights off"
    >
      <div className="hold-btn-fill" style={{ transform: `scaleX(${progress})` }} />
      <I.PowerOff size={16} />
    </button>
  );
}
