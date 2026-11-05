'use client';

import { useEffect } from 'react';

const COUNT_MS = 1100;

function countUp(el: HTMLElement) {
  const to = Number(el.dataset.to);
  if (!Number.isFinite(to) || to === 0) return;
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / COUNT_MS);
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Reveals showcase blocks as they scroll in. The page renders everything visible; only this effect
 * adds html.sc-anim, the class that hides blocks still below the fold. So with JavaScript off, a
 * failed load, or reduced motion, every word and number is on screen from the start.
 */
export function ShowcaseMotion() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;
    const blocks = Array.from(document.querySelectorAll<HTMLElement>('.sc-reveal'));

    const show = (el: HTMLElement, animate: boolean) => {
      el.classList.add('is-in');
      if (animate) el.querySelectorAll<HTMLElement>('.sc-count').forEach(countUp);
    };

    // Blocks already in view stay as painted: hiding them now would flash.
    const below = blocks.filter((el) => el.getBoundingClientRect().top >= window.innerHeight);
    blocks.filter((el) => !below.includes(el)).forEach((el) => show(el, false));
    // The hero numbers are painted final; count them up once as the page opens.
    document.querySelectorAll<HTMLElement>('.sc-hero .sc-count').forEach(countUp);

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          show(e.target as HTMLElement, true);
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.1 },
    );
    below.forEach((el) => io.observe(el));
    root.classList.add('sc-anim');

    return () => {
      io.disconnect();
      root.classList.remove('sc-anim');
    };
  }, []);
  return null;
}
