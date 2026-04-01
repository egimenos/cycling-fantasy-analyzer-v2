import { useEffect, useRef, useState } from 'react';

export function useAnimatedNumber(target: number, duration = 800): number {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;

    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setDisplay(from + (target - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}
