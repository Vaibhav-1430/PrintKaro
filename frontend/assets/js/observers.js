// Print Karo frontend — performance helpers built on IntersectionObserver.
import { $$ } from './utils.js';

/**
 * Lazy-load images tagged with data-src (and optional data-srcset). Swaps in the
 * real source when the image nears the viewport. No-op if IO is unavailable
 * (images load eagerly as a fallback).
 */
export function lazyImages(root = document) {
  const imgs = $$('img[data-src]', root);
  if (!imgs.length) return;
  if (!('IntersectionObserver' in window)) {
    imgs.forEach(swap);
    return;
  }
  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          swap(e.target);
          obs.unobserve(e.target);
        }
      });
    },
    { rootMargin: '200px' },
  );
  imgs.forEach((img) => io.observe(img));
}

function swap(img) {
  if (img.dataset.srcset) img.srcset = img.dataset.srcset;
  img.src = img.dataset.src;
  img.removeAttribute('data-src');
  img.removeAttribute('data-srcset');
  img.classList.add('img-loaded');
}

/**
 * Call `loader()` the first time any element matching `selector` scrolls near the
 * viewport. Returns a disconnect fn. Used to defer heavy work (e.g. a Swiper or a
 * PDF renderer) until it's actually needed.
 */
export function mountLazy(selector, loader, { rootMargin = '300px' } = {}) {
  const targets = $$(selector);
  if (!targets.length) return () => {};
  if (!('IntersectionObserver' in window)) {
    loader();
    return () => {};
  }
  let fired = false;
  const io = new IntersectionObserver(
    (entries) => {
      if (!fired && entries.some((e) => e.isIntersecting)) {
        fired = true;
        io.disconnect();
        loader();
      }
    },
    { rootMargin },
  );
  targets.forEach((t) => io.observe(t));
  return () => io.disconnect();
}

/** Dynamically load a CDN script once; resolves when ready. Cached per URL. */
const scriptCache = new Map();
export function loadScript(src) {
  if (scriptCache.has(src)) return scriptCache.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(s);
  });
  scriptCache.set(src, p);
  return p;
}
