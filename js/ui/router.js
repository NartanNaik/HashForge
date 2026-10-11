/**
 * ============================================================================
 *  File    : js/ui/router.js
 *  Project : Hash Forge
 *  Module  : Tiny hash-based router (swaps the module views into #view)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Connects the navbar to the five module views. The address bar holds the
 *  current page after a "#" (for example  index.html#/forgery ), so there is
 *  no server, no page reload, and every demo has a shareable link.
 *
 *  On every route change the router:
 *    1. runs the cleanup function of the view that is being left (this stops
 *       timers, cancels the birthday search, destroys charts),
 *    2. loads the new view's file,
 *    3. empties the #view element and calls the new view with it,
 *    4. highlights the matching navbar tab,
 *    5. updates the browser tab title,
 *    6. moves keyboard focus to the new page heading (after the first page).
 *
 *  ROUTES
 *  ------
 *    #/visualizer   js/ui/visualizerView.js   renderVisualizerView
 *    #/forgery      js/ui/forgeryView.js      renderForgeryView
 *    #/analyzer     js/ui/analyzerView.js     renderAnalyzerView
 *    #/collision    js/ui/collisionView.js    renderCollisionView
 *    #/learn        js/ui/learnView.js        renderLearnView
 *  An empty hash (or "#/") goes to #/visualizer. An unknown hash shows a
 *  "Page not found" message with a link back to the default page.
 *
 *  WHAT I IMPLEMENTED (exported)
 *  -----------------------------
 *  1. initRouter(options = {}) -> destroy function
 *       Starts the router and shows the page for the current hash.
 *         options.view    the element views are drawn into
 *                         (default: document.getElementById('view'))
 *         options.nav     the element that contains the tab links
 *                         (default: the first <nav> in the page; pass null
 *                         to skip tab highlighting)
 *         options.title   app name used in the browser tab title
 *                         (default 'Hash Forge')
 *       The returned function stops the router (removes the listener and
 *       runs the current view's cleanup). Calling initRouter() a second time
 *       stops the first router automatically.
 *
 *  2. navigate(path)
 *       Goes to a route from code, for example navigate('/forgery').
 *       A leading "#" is optional.
 *
 *  3. getCurrentPath() -> string
 *       The current route path, for example '/collision'. Falls back to the
 *       default path for an empty hash.
 *
 *  4. ROUTES (frozen array)
 *       { path, label, exportName, load } for each page, in navbar order, so
 *       main.js can build or check the navbar from the same list.
 *
 *  5. DEFAULT_PATH   '/visualizer'
 *
 *  VIEW CONTRACT (the same for every view file)
 *  --------------------------------------------
 *     export function renderXxxView(container) { ...; return cleanup; }
 *  The router passes the EMPTY #view element and calls the returned cleanup
 *  before leaving. If a view returns nothing, that is tolerated.
 *
 *  WHAT index.html MUST CONTAIN
 *  ----------------------------
 *    <nav aria-label="Modules">
 *      <a href="#/visualizer">Visualizer</a>
 *      <a href="#/forgery">Forgery</a>
 *      <a href="#/analyzer">Analyzer</a>
 *      <a href="#/collision">Collision</a>
 *      <a href="#/learn">Learn</a>
 *    </nav>
 *    <main id="view"></main>
 *  Any link inside the nav whose href starts with "#/" is treated as a tab.
 *  The active tab gets the class "active" and aria-current="page"
 *  (style .active in css/components.css or layout.css).
 *
 *  BEHAVIOUR NOTES
 *  ---------------
 *  - Views are loaded with dynamic import(), one file per page, the first
 *    time it is visited. A file that is missing or has an error only breaks
 *    its own page: the router shows an error message and a toast, and the
 *    other pages keep working. (This is also handy while the project is being
 *    built file by file.)
 *  - If the user clicks tabs quickly, a slow earlier load is ignored (a run
 *    token), so a stale view can never replace the newest one.
 *  - The old view is cleaned up BEFORE the new one loads, so for example a
 *    running birthday search stops the moment the user clicks away.
 *  - Errors thrown while a view renders, or by a view's cleanup, are caught:
 *    they never crash the router.
 *  - While a page loads, #view has aria-busy="true".
 *  - The page scrolls to the top after a navigation (not on the first load).
 *  - Everything is built with createElement/textContent (no innerHTML).
 *  - ES modules and dynamic import() need http(s), not file://. Use Live
 *    Server, npx serve, GitHub Pages or Netlify.
 *
 *  ASSUMPTIONS ABOUT YOUR OTHER FILES (please check)
 *  -------------------------------------------------
 *    - Each view file exports the function named in ROUTES above. If you
 *      rename one, change exportName here.
 *    - toast.js exports `toast` with toast.error(err), as in its header.
 *
 *  CSS CLASSES (style them in css/components.css and css/layout.css)
 *  -----------------------------------------------------------------
 *    .active                 on the current navbar tab
 *    .router-message         the "Page not found" / error panel
 *    .router-message-title   its heading
 *    .router-message-text    its explanation
 *    .router-message-link    its link back to the default page
 *
 *  USED BY : js/main.js (calls initRouter once at start-up)
 *  DEPENDS : ui/components/toast.js and the five view files (loaded lazily)
 * ============================================================================
 */

import { toast } from './components/toast.js';

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const DEFAULT_PATH = '/visualizer';

export const ROUTES = Object.freeze([
  Object.freeze({
    path: '/visualizer',
    label: 'Hash Visualizer',
    exportName: 'renderVisualizerView',
    load: () => import('./visualizerView.js'),
  }),
  Object.freeze({
    path: '/forgery',
    label: 'Forgery Attack Lab',
    exportName: 'renderForgeryView',
    load: () => import('./forgeryView.js'),
  }),
  Object.freeze({
    path: '/analyzer',
    label: 'Predictable-Data Analyzer',
    exportName: 'renderAnalyzerView',
    load: () => import('./analyzerView.js'),
  }),
  Object.freeze({
    path: '/collision',
    label: 'Collision and Avalanche Lab',
    exportName: 'renderCollisionView',
    load: () => import('./collisionView.js'),
  }),
  Object.freeze({
    path: '/learn',
    label: 'Learn',
    exportName: 'renderLearnView',
    load: () => import('./learnView.js'),
  }),
]);

const DEFAULT_TITLE = 'Hash Forge';

// ---------------------------------------------------------------------------
// Small helpers (pure)
// ---------------------------------------------------------------------------

/** "#/forgery?x=1" -> "/forgery". Empty or "/" -> the default path. */
function pathFromHash(hash) {
  let path = hash.startsWith('#') ? hash.slice(1) : hash;
  path = path.split('?')[0];
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path === '' || path === '/') return DEFAULT_PATH;
  return path;
}

function findRoute(path) {
  return ROUTES.find((route) => route.path === path);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function errorText(err) {
  return err instanceof Error ? err.message : String(err);
}

/** Builds the panel used for "Page not found" and for load errors. */
function buildMessage(headingText, bodyText) {
  const panel = el('section', 'router-message');
  const heading = el('h2', 'router-message-title', headingText);
  const body = el('p', 'router-message-text', bodyText);
  const link = el('a', 'router-message-link', 'Go to the Hash Visualizer');
  link.href = `#${DEFAULT_PATH}`;
  panel.append(heading, body, link);
  return panel;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** The current route path, for example '/collision'. */
export function getCurrentPath() {
  return pathFromHash(window.location.hash);
}

/** Goes to a route from code. A leading "#" is optional. */
export function navigate(path) {
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
}

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

let stopCurrentRouter = null;

export function initRouter(options = {}) {
  // A second call replaces the first router instead of doubling it up.
  if (stopCurrentRouter) stopCurrentRouter();

  const view = options.view || document.getElementById('view');
  if (!view) {
    throw new Error('Router: the #view element was not found. Add <main id="view"></main> to index.html.');
  }
  const nav = options.nav !== undefined ? options.nav : document.querySelector('nav');
  const appTitle = options.title || DEFAULT_TITLE;

  let destroyed = false;
  let token = 0;
  let cleanup = null;
  let firstRender = true;

  // ----- cleanup of the view that is being left -----
  function runCleanup() {
    const fn = cleanup;
    cleanup = null;
    if (typeof fn === 'function') {
      try {
        fn();
      } catch (err) {
        console.error('Router: a view cleanup failed.', err);
      }
    }
  }

  // ----- navbar highlighting -----
  function updateNav(path) {
    if (!nav) return;
    const links = nav.querySelectorAll('a[href^="#/"]');
    links.forEach((link) => {
      const active = pathFromHash(link.getAttribute('href')) === path;
      link.classList.toggle('active', active);
      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function afterNavigation() {
    if (firstRender) {
      firstRender = false;
      return;
    }
    window.scrollTo(0, 0);
    const heading = view.querySelector('h2');
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }

  // ----- show one page -----
  async function show(path) {
    token += 1;
    const myToken = token;

    // Stop the old view first (timers, searches, charts).
    runCleanup();
    updateNav(path);

    const route = findRoute(path);
    if (!route) {
      document.title = `Page not found • ${appTitle}`;
      view.setAttribute('aria-busy', 'false');
      view.replaceChildren(buildMessage('Page not found', `There is no page at "${path}".`));
      afterNavigation();
      return;
    }

    document.title = `${route.label} • ${appTitle}`;
    view.setAttribute('aria-busy', 'true');

    let module;
    try {
      module = await route.load();
    } catch (err) {
      if (destroyed || myToken !== token) return;
      view.setAttribute('aria-busy', 'false');
      view.replaceChildren(
        buildMessage(
          'This page could not be loaded',
          `The file for "${route.label}" failed to load: ${errorText(err)}`,
        ),
      );
      toast.error(err);
      afterNavigation();
      return;
    }
    if (destroyed || myToken !== token) return;

    const render = module[route.exportName];
    if (typeof render !== 'function') {
      view.setAttribute('aria-busy', 'false');
      view.replaceChildren(
        buildMessage(
          'This page could not be loaded',
          `The file for "${route.label}" does not export ${route.exportName}().`,
        ),
      );
      afterNavigation();
      return;
    }

    view.replaceChildren();
    try {
      const result = render(view);
      cleanup = typeof result === 'function' ? result : null;
    } catch (err) {
      view.replaceChildren(
        buildMessage('This page crashed while drawing', `${route.label}: ${errorText(err)}`),
      );
      toast.error(err);
    }
    view.setAttribute('aria-busy', 'false');
    afterNavigation();
  }

  // ----- react to the address bar -----
  function onHashChange() {
    show(getCurrentPath());
  }
  window.addEventListener('hashchange', onHashChange);

  // An empty hash is rewritten to the default route (no extra history entry).
  const startHash = window.location.hash;
  if (startHash === '' || startHash === '#' || startHash === '#/') {
    window.history.replaceState(null, '', `#${DEFAULT_PATH}`);
  }
  show(getCurrentPath());

  // ----- stop function -----
  function destroy() {
    destroyed = true;
    token += 1;
    window.removeEventListener('hashchange', onHashChange);
    runCleanup();
    view.setAttribute('aria-busy', 'false');
    if (stopCurrentRouter === destroy) stopCurrentRouter = null;
  }
  stopCurrentRouter = destroy;
  return destroy;
}