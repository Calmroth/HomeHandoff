// useFlicker — pulse-counter hook for CSS acknowledgement animations.
// Returns a key that increments on every change to the watched deps (after
// the first render), so callers can use it as a React key or in CSS to
// retrigger an animation each time state flips.

import { useState, useEffect, useRef } from 'react';

export function useFlicker(deps) {
  const [k, setK] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setK((x) => x + 1);
  }, deps);
  return k;
}
