/**
 * ============================================================================
 *  File    : js/main.js
 *  Project : Hash Forge (NIE Mysuru, Dept. of CSE, Batch 09)
 *  Module  : Application entry point (start-up, theme, safety nets)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  The one file that index.html loads  (<script type="module" src="js/main.js">).
 *  It has no hashing or drawing logic. It only starts the app:
 *
 *    1. Applies the colour THEME (dark or light) before anything is drawn.
 *    2. Wires the theme toggle button in the navbar.
 *    3. Installs a safety net for unexpected errors (shown as a toast).
 *    4. Starts the ROUTER, which shows the page for the current address
 *       (an empty address opens #/visualizer, the default view).
 *    5. Checks the environment and warns the presenter BEFORE the demo if
 *       something would break it (SHA-256 needs a secure page; charts need
 *       Chart.js).
 *
 *  WHAT I IMPLEMENTED
 *  ------------------
 *  This file exports nothing; it runs when loaded. Internally:
 *
 *  THEME
 *    - The choice is stored in localStorage under "hash-forge-theme".
 *    - With no stored choice, the operating-system setting
 *      (prefers-color-scheme) is used, and the app FOLLOWS it live if the
 *      user changes it. Once the user presses the toggle, their choice wins.
 *    - The theme is set as  data-theme="dark" | "light"  on <html>, and as
 *      the CSS color-scheme, so native controls and scrollbars match.
 *    - Storage can fail (private window, blocked site data): every access is
 *      wrapped in try/catch and the app simply forgets the choice on reload.
 *
 *  ERROR SAFETY NET
 *    - window "error" and "unhandledrejection" events are shown with
 *      toast.error() and logged to the console, so a bug during a live demo
 *      is visible instead of silent. The toast already ignores a repeated
 *      identical message, so a loop cannot flood the screen.
 *    - Harmless browser noise is skipped: the "ResizeObserver loop" message
 *      and cancelled searches (AbortError).
 *
 *  ENVIRONMENT CHECKS (run once, after the page has fully loaded)
 *    - SHA-256 uses crypto.subtle, which browsers only provide on https://
 *      or http://localhost. If it is missing, a warning toast that stays
 *      until closed explains how to fix it (use Live Server, npx serve,
 *      GitHub Pages or Netlify, not a plain http://192.168.x.x address).
 *    - If the global Chart object is missing, a warning explains that the
 *      charts will not draw (Chart.js did not load).
 *
 *  START-UP FAILURE
 *    - If the router cannot start (for example index.html has no #view
 *      element), a plain message is written at the top of the page, because
 *      nothing else could display the error.
 *
 *  ABOUT "GLOBAL STATE" (a decision you should know about)
 *  -------------------------------------------------------
 *  The project spec mentioned main.js holding global state (selected block
 *  size, current message). The five views I wrote each keep their OWN
 *  message and block-size state and never import from main.js, so a shared
 *  store here would have no readers. I left it out on purpose rather than
 *  ship dead code. Practical effect: changing the block size in one lab does
 *  not change it in another, and each lab starts with its own demo message.
 *  If you want them shared later, add a small js/core/appState.js and make
 *  each view read and write it.
 *
 *  WHAT index.html MUST CONTAIN (for this file)
 *  --------------------------------------------
 *    - <nav> with the tab links and <main id="view"></main>  (see router.js).
 *    - Optional  <button id="theme-toggle" type="button" aria-label="Dark theme">
 *        <span data-theme-icon></span></button>
 *      The button gets aria-pressed="true" in dark mode; the optional
 *      [data-theme-icon] child gets a moon or a sun character.
 *    - The Chart.js <script> tag BEFORE the main.js tag, so the Chart object
 *      exists by the time a chart is drawn.
 *    - css/base.css must define the colour tokens under BOTH
 *      :root[data-theme="dark"] and :root[data-theme="light"], and
 *      charts.js reads --text, --muted and --border from them.
 *
 *  KNOWN LIMITATION
 *  ----------------
 *  A chart reads the theme colours when it is DRAWN. If the user toggles the
 *  theme while a chart is on screen, that chart keeps its old colours until
 *  it is drawn again (run the trials or the sweep once more). Everything
 *  else changes immediately.
 *
 *  ASSUMPTIONS ABOUT YOUR OTHER FILES (please check)
 *  -------------------------------------------------
 *    - ui/router.js exports initRouter(options) (as I wrote it).
 *    - ui/components/toast.js exports `toast` with toast.error(err) and
 *      toast.warning(msg, { duration }) where duration 0 means "stays until
 *      closed" (as its header says).
 *
 *  USED BY : index.html
 *  DEPENDS : ui/router.js, ui/components/toast.js
 * ============================================================================
 */

import { initRouter } from './ui/router.js';
import { toast } from './ui/components/toast.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THEME_KEY = 'hash-forge-theme';
const THEMES = ['dark', 'light'];
const FALLBACK_THEME = 'dark';

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function readStoredTheme() {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return THEMES.includes(value) ? value : null;
  } catch (err) {
    return null;
  }
}

function storeTheme(theme) {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    // Storage is blocked: the choice just will not survive a reload.
  }
}

function systemTheme() {
  if (typeof window.matchMedia !== 'function') return FALLBACK_THEME;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateToggleButton(theme) {
  const button = document.getElementById('theme-toggle');
  if (!button) return;
  button.setAttribute('aria-pressed', String(theme === 'dark'));
  button.title = 'Toggle dark theme';
  const icon = button.querySelector('[data-theme-icon]');
  if (icon) icon.textContent = theme === 'dark' ? '☾' : '☀';
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  updateToggleButton(theme);
}

function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function initTheme() {
  applyTheme(readStoredTheme() || systemTheme());

  const button = document.getElementById('theme-toggle');
  if (button) {
    button.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      storeTheme(next);
      applyTheme(next);
    });
  }

  // Follow the operating system until the user has chosen for themselves.
  if (typeof window.matchMedia === 'function') {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', (event) => {
        if (readStoredTheme() === null) applyTheme(event.matches ? 'dark' : 'light');
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Error safety net
// ---------------------------------------------------------------------------

function isHarmlessMessage(message) {
  return typeof message === 'string' && message.includes('ResizeObserver loop');
}

function installErrorHandlers() {
  window.addEventListener('error', (event) => {
    const problem = event.error || event.message;
    if (isHarmlessMessage(event.message)) return;
    console.error('Unexpected error:', problem);
    toast.error(problem instanceof Error ? problem : String(problem || 'Unexpected error'));
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason && reason.name === 'AbortError') return;
    console.error('Unhandled promise rejection:', reason);
    toast.error(reason instanceof Error ? reason : String(reason || 'Unexpected error'));
  });
}

// ---------------------------------------------------------------------------
// Environment checks
// ---------------------------------------------------------------------------

function checkEnvironment() {
  const hasSubtle =
    window.isSecureContext && globalThis.crypto && globalThis.crypto.subtle;
  if (!hasSubtle) {
    toast.warning(
      'SHA-256 is unavailable on this page. Browsers only allow it on https:// or http://localhost. ' +
        'Open the app through Live Server, "npx serve", GitHub Pages or Netlify.',
      { duration: 0 },
    );
  }

  if (typeof globalThis.Chart === 'undefined') {
    toast.warning(
      'Charts will not draw because Chart.js did not load. Check the script tag in index.html ' +
        'and your internet connection.',
      { duration: 8000 },
    );
  }
}

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------

function showStartupFailure(err) {
  const message = err instanceof Error ? err.message : String(err);
  const panel = document.createElement('p');
  panel.className = 'router-message-text';
  panel.setAttribute('role', 'alert');
  panel.textContent = `Hash Forge could not start: ${message}`;
  document.body.prepend(panel);
}

function start() {
  initTheme();
  installErrorHandlers();

  try {
    initRouter({
      view: document.getElementById('view'),
      nav: document.querySelector('nav'),
    });
  } catch (err) {
    console.error(err);
    showStartupFailure(err);
    return;
  }

  // Run the checks once every script (including Chart.js) has finished.
  if (document.readyState === 'complete') {
    checkEnvironment();
  } else {
    window.addEventListener('load', checkEnvironment, { once: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}