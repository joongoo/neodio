"use client";

import { useEffect, useRef, useState } from "react";

// Fires once — the first time the element scrolls into view — then stops
// observing. Charts use this to defer their initial mount (and therefore
// recharts' mount-time draw-in animation) until the moment they're actually
// scrolled into the viewport, instead of animating off-screen at page load.
export function useInViewOnce<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, options ?? { threshold: 0.2 });

    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible, options]);

  return { ref, isVisible };
}
