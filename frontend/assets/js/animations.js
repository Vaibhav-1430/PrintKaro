// Print Karo frontend — progressive-enhancement animations.
// Uses Lenis (smooth scroll) + GSAP if present on window; otherwise falls back to
// IntersectionObserver reveals and instant counters. Everything respects
// prefers-reduced-motion.
import { $$ } from './utils.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initAnimations() {
  document.documentElement.classList.add('js');
  if (reduced) {
    // Reveal everything immediately.
    $$('[data-reveal],[data-stagger]').forEach((n) => n.classList.add('in-view'));
    runCounters(true);
    return;
  }

  initSmoothScroll();
  initReveals();
  runCounters(false);
}

function initSmoothScroll() {
  if (typeof window.Lenis !== 'function') return;
  const lenis = new window.Lenis({ duration: 1.05, smoothWheel: true });
  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
  // Anchor links → smooth scroll via Lenis.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      lenis.scrollTo(target, { offset: -80 });
    }
  });
}

function initReveals() {
  const items = $$('[data-reveal],[data-stagger]');
  if (!('IntersectionObserver' in window) || items.length === 0) {
    items.forEach((n) => n.classList.add('in-view'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
  );
  items.forEach((n) => io.observe(n));
}

/** Animate [data-count] numbers from 0 to their target when in view. */
function runCounters(instant) {
  const nums = $$('[data-count]');
  if (nums.length === 0) return;

  const animate = (node) => {
    const target = parseFloat(node.dataset.count);
    const suffix = node.dataset.suffix || '';
    const decimals = node.dataset.decimals ? parseInt(node.dataset.decimals, 10) : 0;
    if (instant) {
      node.textContent = target.toFixed(decimals) + suffix;
      return;
    }
    const dur = 1400;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = (target * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if (!('IntersectionObserver' in window)) {
    nums.forEach(animate);
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animate(entry.target);
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.6 },
  );
  nums.forEach((n) => io.observe(n));
}

/** Play a Lottie animation into a container if lottie-web is present. */
export function playLottie(container, path, loop = false) {
  if (!container || typeof window.lottie === 'undefined') return null;
  return window.lottie.loadAnimation({
    container,
    renderer: 'svg',
    loop,
    autoplay: true,
    path,
  });
}

/**
 * Apple-style hero timeline (landing only). Uses GSAP when present; otherwise the
 * existing IO reveals already show everything. Fully skipped under reduced-motion.
 */
export function heroTimeline() {
  if (reduced || typeof window.gsap === 'undefined') return;
  const gsap = window.gsap;
  const q = (s) => document.querySelector(s);

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('.hero .announce', { y: 16, opacity: 0, duration: 0.6 })
    .from('.hero h1', { y: 28, opacity: 0, duration: 0.8 }, '-=0.3')
    .from('.hero .lead', { y: 20, opacity: 0, duration: 0.7 }, '-=0.5')
    .from('.hero-cta > *', { y: 16, opacity: 0, stagger: 0.12, duration: 0.5 }, '-=0.4')
    .from('.printer', { y: 40, opacity: 0, scale: 0.96, duration: 0.9 }, '-=0.3');

  // The ticket "prints out" of the slot.
  const ticket = q('#hero-ticket');
  if (ticket) {
    tl.from(ticket, { yPercent: -60, scaleY: 0.6, opacity: 0, duration: 0.9, ease: 'power2.out' }, '-=0.4');
  }

  // Parallax the hero blobs on scroll (subtle) via ScrollTrigger if available.
  if (window.ScrollTrigger) {
    gsap.registerPlugin(window.ScrollTrigger);
    gsap.to('.hero-blob.a', {
      yPercent: 30,
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
    gsap.to('.hero-blob.b', {
      yPercent: 18,
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
    // Gentle float on the printer as you scroll past.
    gsap.to('.printer', {
      y: -12,
      scrollTrigger: { trigger: '.hero-stage', start: 'top 80%', end: 'bottom top', scrub: 1 },
    });
  }
}
