/**
 * ============================================================================
 *  File    : js/ui/components/toast.js
 *  Project : Hash Forge (NIE Mysuru, Dept. of CSE, Batch 09)
 *  Module  : Toast notifications (small popups for errors and feedback)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Shows short, non-blocking messages in a corner of the screen, for example:
 *    - "Target hash must be 2 byte(s) (16 bits) but is 4 byte(s)."
 *    - "Need at least two different blocks to swap."
 *    - "Copied!" / "Forgery verified."
 *  The error messages thrown by the core and attack files (bitUtils.js,
 *  forgery.js, collision.js, ...) are written to be shown directly here:
 *      try { ... } catch (err) { toast.error(err); }
 *
 *  It builds DOM with createElement/textContent only (never innerHTML), so
 *  messages containing user text can never inject HTML.
 *
 *  WHAT I IMPLEMENTED (exported)
 *  -----------------------------
 *  1. showToast(message, options = {}) -> HTMLElement
 *       message   string or Error (an Error shows its .message)
 *       options   type      'info' | 'success' | 'warning' | 'error'
 *                           (default 'info')
 *                 duration  milliseconds before auto-dismiss; 0 = stays until
 *                           closed. Defaults: info/success 3500, warning 5000,
 *                           error 6000.
 *
 *  2. toast  (shortcut object)
 *       toast.info(msg, opts)   toast.success(msg, opts)
 *       toast.warning(msg, opts) toast.error(msg, opts)
 *
 *  3. dismissToast(toastElement)   close one toast (with exit animation)
 *  4. clearToasts()                close all toasts
 *
 *  BEHAVIOUR
 *  ---------
 *  - Max 4 toasts at once; the oldest is closed when a fifth arrives.
 *  - The same message and type shown again while still visible does NOT stack
 *    a duplicate; its timer is simply restarted (so clicking "Forge" five
 *    times does not create five identical toasts).
 *  - The auto-dismiss timer PAUSES while the mouse is over the toast or it
 *    has keyboard focus, and resumes afterwards.
 *  - Every toast has a close button (works with the keyboard).
 *
 *  ACCESSIBILITY
 *  -------------
 *  - Errors use role="alert" (announced immediately); other types use
 *    role="status" (announced politely).
 *  - Each type has its own icon glyph (info, check, warning, cross), so the
 *    type is not conveyed by colour alone.
 *
 *  CSS CLASSES (style them in css/components.css, animate in animations.css)
 *  -------------------------------------------------------------------------
 *    .toast-container            fixed-position stack (bottom-right suggested)
 *    .toast                      one toast
 *      .toast-info .toast-success .toast-warning .toast-error
 *      .toast-show               added on the next frame (enter animation)
 *      .toast-hide               added when closing (exit animation, 250 ms)
 *    .toast-icon                 the glyph
 *    .toast-message              the text
 *    .toast-close                the close button
 *  Remember a @media (prefers-reduced-motion: reduce) rule that removes the
 *  transitions; removal still happens after 250 ms either way.
 *
 *  USED BY : forgeryView.js, collisionView.js, analyzerView.js,
 *            visualizerView.js, hashCard-related error handling
 *  DEPENDS : nothing (standalone module)
 * ============================================================================
 */

const MAX_TOASTS = 4;
const EXIT_MS = 250;

const DEFAULT_DURATION = Object.freeze({
  info: 3500,
  success: 3500,
  warning: 5000,
  error: 6000,
});

const ICONS = Object.freeze({
  info: '\u2139', // i
  success: '\u2714', // check mark
  warning: '\u26A0', // warning sign
  error: '\u2718', // cross mark
});

/** Per-toast timer state, keyed by the toast element. */
const entries = new WeakMap();

let container = null;

/** Create an element with an optional class name and text. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Get (or lazily create) the fixed container that holds all toasts. */
function getContainer() {
  if (!container || !container.isConnected) {
    container = el('div', 'toast-container');
    document.body.appendChild(container);
  }
  return container;
}

/** Turn a string, Error or anything else into display text. */
function toText(message) {
  if (typeof message === 'string') return message;
  if (message && typeof message.message === 'string') return message.message;
  return String(message);
}

/** Start (or restart) the auto-dismiss timer. */
function schedule(entry, ms) {
  clearTimeout(entry.timerId);
  entry.timerId = null;
  entry.remaining = ms;
  if (ms > 0) {
    entry.startedAt = performance.now();
    entry.timerId = setTimeout(() => dismissToast(entry.element), ms);
  }
}

/** Pause the timer while the user is hovering / focused on the toast. */
function pause(entry) {
  if (entry.timerId === null) return;
  clearTimeout(entry.timerId);
  entry.timerId = null;
  entry.remaining = Math.max(0, entry.remaining - (performance.now() - entry.startedAt));
}

/** Resume a paused timer. */
function resume(entry) {
  if (entry.timerId !== null || entry.remaining <= 0 || entry.closing) return;
  schedule(entry, entry.remaining);
}

/**
 * Close one toast with its exit animation.
 * @param {HTMLElement} toastElement
 */
export function dismissToast(toastElement) {
  const entry = entries.get(toastElement);
  if (!entry || entry.closing) return;
  entry.closing = true;
  clearTimeout(entry.timerId);
  toastElement.classList.remove('toast-show');
  toastElement.classList.add('toast-hide');
  setTimeout(() => {
    toastElement.remove();
    entries.delete(toastElement);
  }, EXIT_MS);
}

/** Close every toast. */
export function clearToasts() {
  if (!container) return;
  Array.from(container.children).forEach((child) => dismissToast(child));
}

/**
 * Show a toast.
 *
 * @param {string|Error} message
 * @param {{ type?: 'info'|'success'|'warning'|'error', duration?: number }} [options]
 * @returns {HTMLElement} the toast element
 */
export function showToast(message, options = {}) {
  const type = DEFAULT_DURATION[options.type] !== undefined ? options.type : 'info';
  const duration = options.duration !== undefined ? options.duration : DEFAULT_DURATION[type];
  const text = toText(message);
  const host = getContainer();

  // Same message + type already visible: restart its timer instead of stacking.
  for (const child of host.children) {
    const entry = entries.get(child);
    if (entry && !entry.closing && entry.type === type && entry.text === text) {
      schedule(entry, duration);
      return child;
    }
  }

  // Keep the stack small: close the oldest toast(s) if we are at the limit.
  const open = Array.from(host.children).filter((c) => entries.get(c) && !entries.get(c).closing);
  while (open.length >= MAX_TOASTS) {
    dismissToast(open.shift());
  }

  const toastEl = el('div', `toast toast-${type}`);
  toastEl.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const icon = el('span', 'toast-icon', ICONS[type]);
  icon.setAttribute('aria-hidden', 'true');

  const body = el('span', 'toast-message', text);

  const close = el('button', 'toast-close', '\u00D7');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.addEventListener('click', () => dismissToast(toastEl));

  toastEl.append(icon, body, close);
  host.appendChild(toastEl);

  const entry = { element: toastEl, type, text, timerId: null, remaining: 0, startedAt: 0, closing: false };
  entries.set(toastEl, entry);

  toastEl.addEventListener('mouseenter', () => pause(entry));
  toastEl.addEventListener('mouseleave', () => resume(entry));
  toastEl.addEventListener('focusin', () => pause(entry));
  toastEl.addEventListener('focusout', () => resume(entry));

  // Add the "show" class on the next frame so the enter transition plays.
  requestAnimationFrame(() => toastEl.classList.add('toast-show'));

  schedule(entry, duration);
  return toastEl;
}

/** Shortcuts: toast.error(err), toast.success('Copied!'), ... */
export const toast = Object.freeze({
  info: (message, options = {}) => showToast(message, { ...options, type: 'info' }),
  success: (message, options = {}) => showToast(message, { ...options, type: 'success' }),
  warning: (message, options = {}) => showToast(message, { ...options, type: 'warning' }),
  error: (message, options = {}) => showToast(message, { ...options, type: 'error' }),
});