// ══════════════════════════════════════════════════════════════
// SUWE — Shared Tour Engine v2
// Provides an element-spotlight guided tour for all pages.
// Usage: import { initTour } from '../js/tour.js';
//        initTour(TOUR_STEPS, { onFinish: () => {} });
// ══════════════════════════════════════════════════════════════

let tourSteps  = [];
let tourIndex  = 0;
let onFinishCb = null;

// ── Inject tour HTML + CSS once ───────────────────────────────
function injectTourDOM() {
  if (document.getElementById('suwe-tour-overlay')) return;

  const style = document.createElement('style');
  style.textContent = `
    /* ── TOUR OVERLAY ── */
    #suwe-tour-overlay {
      position: fixed; inset: 0; z-index: 10000;
      pointer-events: none;
      display: none;
    }
    #suwe-tour-overlay.active { display: block; }

    /* Dark backdrop rendered via a large box-shadow on the spotlight ring */
    #suwe-tour-backdrop {
      position: fixed; inset: 0; z-index: 10001;
      background: rgba(10,46,26,0.78);
      pointer-events: all;
      display: none;
    }
    #suwe-tour-overlay.active #suwe-tour-backdrop { display: block; }

    /* The spotlight cutout — a transparent div that sits over the target */
    #suwe-tour-spotlight {
      position: fixed; z-index: 10002;
      border-radius: 12px;
      box-shadow:
        0 0 0 4px #c9a84c,
        0 0 0 8px rgba(201,168,76,0.25),
        0 0 0 9999px rgba(10,46,26,0.78);
      pointer-events: none;
      transition: all 0.35s cubic-bezier(.4,0,.2,1);
      display: none;
    }
    #suwe-tour-overlay.active #suwe-tour-spotlight { display: block; }

    /* ── TOOLTIP ── */
    #suwe-tour-tooltip {
      position: fixed; z-index: 10003;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.28);
      padding: 24px;
      width: 340px;
      max-width: calc(100vw - 32px);
      transition: all 0.3s cubic-bezier(.4,0,.2,1);
      font-family: 'DM Sans', sans-serif;
      pointer-events: all;
      display: none;
    }
    #suwe-tour-overlay.active #suwe-tour-tooltip { display: block; }

    .tour-tt-icon {
      font-size: 42px; margin-bottom: 12px; display: block;
      text-align: center;
    }
    .tour-tt-step {
      font-size: 11px; font-weight: 600; letter-spacing: 1.5px;
      text-transform: uppercase; color: #c9a84c;
      margin-bottom: 6px; text-align: center;
    }
    .tour-tt-title {
      font-family: 'Playfair Display', serif;
      font-size: 20px; font-weight: 700;
      color: #111a14; margin-bottom: 10px;
      text-align: center; line-height: 1.3;
    }
    .tour-tt-text {
      font-size: 14px; color: #3d5244; line-height: 1.65;
      margin-bottom: 20px; text-align: center;
    }
    .tour-tt-nav {
      display: flex; align-items: center;
      justify-content: space-between; gap: 10px;
    }
    .tour-tt-dots {
      display: flex; gap: 6px; align-items: center;
    }
    .tour-tt-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #eef0eb; transition: background 0.2s;
    }
    .tour-tt-dot.active { background: #c9a84c; width: 18px; border-radius: 4px; }
    .tour-btn-skip {
      padding: 9px 14px; border-radius: 8px; border: 1.5px solid #dde5df;
      background: none; color: #7a9485; font-family: 'DM Sans', sans-serif;
      font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s;
      white-space: nowrap;
    }
    .tour-btn-skip:hover { border-color: #7a9485; color: #3d5244; }
    .tour-btn-next {
      padding: 9px 20px; border-radius: 8px; border: none;
      background: #c9a84c; color: #0a2e1a;
      font-family: 'DM Sans', sans-serif;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: all 0.2s; white-space: nowrap;
    }
    .tour-btn-next:hover { background: #e8c96a; transform: translateY(-1px); }

    /* Arrow pointer on tooltip */
    #suwe-tour-tooltip::before {
      content: '';
      position: absolute;
      width: 0; height: 0;
      border: 10px solid transparent;
      display: none;
    }
    #suwe-tour-tooltip.arrow-top::before {
      display: block; top: -20px; left: 50%;
      transform: translateX(-50%);
      border-bottom-color: #fff;
    }
    #suwe-tour-tooltip.arrow-bottom::before {
      display: block; bottom: -20px; left: 50%;
      transform: translateX(-50%);
      border-top-color: #fff;
    }
    #suwe-tour-tooltip.arrow-left::before {
      display: block; left: -20px; top: 50%;
      transform: translateY(-50%);
      border-right-color: #fff;
    }
    #suwe-tour-tooltip.arrow-right::before {
      display: block; right: -20px; top: 50%;
      transform: translateY(-50%);
      border-left-color: #fff;
    }

    /* Mobile: always center horizontally at bottom */
    @media (max-width: 600px) {
      #suwe-tour-tooltip {
        left: 16px !important;
        right: 16px !important;
        width: auto !important;
        bottom: 88px !important;
        top: auto !important;
      }
      #suwe-tour-tooltip::before { display: none !important; }
    }

    /* ── TOUR LAUNCH BUTTON RIPPLE ── */
    .tour-highlight-pulse {
      animation: tourPulse 0.6s ease;
    }
    @keyframes tourPulse {
      0%   { box-shadow: 0 0 0 0   rgba(201,168,76,0.6); }
      100% { box-shadow: 0 0 0 20px rgba(201,168,76,0);   }
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'suwe-tour-overlay';
  overlay.innerHTML = `
    <div id="suwe-tour-backdrop"></div>
    <div id="suwe-tour-spotlight"></div>
    <div id="suwe-tour-tooltip">
      <span class="tour-tt-icon" id="tt-icon">🎯</span>
      <div class="tour-tt-step" id="tt-step">Step 1</div>
      <div class="tour-tt-title" id="tt-title">Welcome!</div>
      <div class="tour-tt-text"  id="tt-text">Loading...</div>
      <div class="tour-tt-nav">
        <button class="tour-btn-skip" id="tt-skip">Skip Tour</button>
        <div class="tour-tt-dots" id="tt-dots"></div>
        <button class="tour-btn-next" id="tt-next">Next →</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Close on backdrop click
  document.getElementById('suwe-tour-backdrop').addEventListener('click', endTour);
  document.getElementById('tt-skip').addEventListener('click', endTour);
  document.getElementById('tt-next').addEventListener('click', () => {
    if (tourIndex < tourSteps.length - 1) {
      tourIndex++;
      renderTourStep();
    } else {
      endTour(true);
    }
  });

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (!document.getElementById('suwe-tour-overlay').classList.contains('active')) return;
    if (e.key === 'Escape')      endTour();
    if (e.key === 'ArrowRight') { if (tourIndex < tourSteps.length - 1) { tourIndex++; renderTourStep(); } else endTour(true); }
    if (e.key === 'ArrowLeft' && tourIndex > 0) { tourIndex--; renderTourStep(); }
  });

  // Re-position on resize
  window.addEventListener('resize', () => {
    if (document.getElementById('suwe-tour-overlay').classList.contains('active')) {
      positionTourStep(tourSteps[tourIndex]);
    }
  });
}

// ── spotlight helpers ─────────────────────────────────────────
function getRect(selector) {
  if (!selector) return null;
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height, el };
}

const PAD = 10; // spotlight padding around element

function positionTourStep(step) {
  const spotlight = document.getElementById('suwe-tour-spotlight');
  const tooltip   = document.getElementById('suwe-tour-tooltip');
  if (!spotlight || !tooltip) return;

  // Remove old arrow classes
  tooltip.className = '';

  const rect = getRect(step.target);

  if (!rect || rect.width === 0) {
    // No element — centre everything
    spotlight.style.cssText = 'display:none';
    tooltip.style.cssText   = `
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
    `;
    return;
  }

  // Scroll target into view smoothly
  rect.el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Spotlight box
  spotlight.style.cssText = `
    top:    ${rect.top  - PAD}px;
    left:   ${rect.left - PAD}px;
    width:  ${rect.width  + PAD * 2}px;
    height: ${rect.height + PAD * 2}px;
  `;

  // Tooltip positioning logic
  const TTW = 340, TTH = 220;
  const vw  = window.innerWidth, vh = window.innerHeight;
  let top, left;

  const spaceBelow = vh - (rect.top + rect.height + PAD);
  const spaceAbove = rect.top - PAD;
  const spaceRight = vw - (rect.left + rect.width + PAD);
  const spaceLeft  = rect.left - PAD;

  if (spaceBelow >= TTH + 20) {
    // Place below
    top  = rect.top + rect.height + PAD + 20;
    left = rect.left + rect.width / 2 - TTW / 2;
    tooltip.classList.add('arrow-top');
  } else if (spaceAbove >= TTH + 20) {
    // Place above
    top  = rect.top - PAD - TTH - 20;
    left = rect.left + rect.width / 2 - TTW / 2;
    tooltip.classList.add('arrow-bottom');
  } else if (spaceRight >= TTW + 20) {
    // Place to the right
    top  = rect.top + rect.height / 2 - TTH / 2;
    left = rect.left + rect.width + PAD + 20;
    tooltip.classList.add('arrow-left');
  } else if (spaceLeft >= TTW + 20) {
    // Place to the left
    top  = rect.top + rect.height / 2 - TTH / 2;
    left = rect.left - PAD - TTW - 20;
    tooltip.classList.add('arrow-right');
  } else {
    // Fallback — centre
    top  = vh / 2 - TTH / 2;
    left = vw / 2 - TTW / 2;
  }

  // Clamp within viewport
  left = Math.max(16, Math.min(left, vw - TTW - 16));
  top  = Math.max(16, Math.min(top,  vh - TTH - 16));

  tooltip.style.top       = `${top}px`;
  tooltip.style.left      = `${left}px`;
  tooltip.style.transform = 'none';
}

// ── render current step ───────────────────────────────────────
function renderTourStep() {
  const step = tourSteps[tourIndex];
  if (!step) return;

  document.getElementById('tt-icon').textContent  = step.icon  || '🎯';
  document.getElementById('tt-step').textContent  = `Step ${tourIndex + 1} of ${tourSteps.length}`;
  document.getElementById('tt-title').textContent = step.title || '';
  document.getElementById('tt-text').textContent  = step.text  || '';
  document.getElementById('tt-next').textContent  = tourIndex === tourSteps.length - 1 ? 'Finish ✓' : 'Next →';
  document.getElementById('tt-skip').style.display = tourIndex === tourSteps.length - 1 ? 'none' : '';

  // Dots
  const dots = document.getElementById('tt-dots');
  dots.innerHTML = tourSteps.map((_, i) =>
    `<div class="tour-tt-dot ${i === tourIndex ? 'active' : ''}"></div>`
  ).join('');

  // Wait a tick for smooth scroll then position
  setTimeout(() => positionTourStep(step), 50);
}

// ── public API ────────────────────────────────────────────────
export function startTour() {
  injectTourDOM();
  tourIndex = 0;
  document.getElementById('suwe-tour-overlay').classList.add('active');
  renderTourStep();
}

export function endTour(finished = false) {
  document.getElementById('suwe-tour-overlay')?.classList.remove('active');
  localStorage.setItem('suwe_tour_done', 'true');
  if (finished && typeof onFinishCb === 'function') onFinishCb();
}

/**
 * initTour(steps, options)
 * steps: array of { icon, title, text, target }
 *   target: CSS selector string (or null for centred)
 * options: { onFinish, autoShow }
 *   onFinish: callback when tour completes (not skipped)
 *   autoShow: { hoursSince (number), profileCreatedAt (ISO string) }
 *             — auto-shows if user is new and tour not done
 */
export function initTour(steps, { onFinish, autoShow } = {}) {
  injectTourDOM();
  tourSteps  = steps;
  onFinishCb = onFinish || null;

  // Wire Quick Tour sidebar button (any page)
  document.querySelectorAll('.quick-tour-btn, #quick-tour-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tourIndex = 0;
      startTour();
    });
  });

  // Auto-show for brand-new users
  if (autoShow) {
    const done = localStorage.getItem('suwe_tour_done') === 'true';
    if (!done) {
      const created     = new Date(autoShow.profileCreatedAt);
      const hoursSince  = (Date.now() - created) / 3600000;
      if (hoursSince < 24) {
        setTimeout(startTour, 1500);
      }
    }
  }
}
