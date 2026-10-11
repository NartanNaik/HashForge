/**
 * ============================================================================
 *  File    : js/charts/charts.js
 *  Project : Hash Forge
 *  Module  : Chart wrappers (Chart.js) for the Collision and Avalanche Lab
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Thin wrappers around Chart.js so the views never touch Chart.js options
 *  directly. It draws the two charts used in collisionView.js:
 *
 *    1. AVALANCHE CHART  (bar)
 *         Average % of output bits that change when ONE input bit is flipped.
 *         Bars: XOR, RXOR, SHA-256. A dashed line marks the ideal 50%.
 *         Shows XOR and RXOR barely move while SHA-256 sits near 50%.
 *
 *    2. COLLISION CHART  (bars + line, log scale)
 *         Attempts needed to find a collision on truncated SHA-256 versus
 *         hash size (8, 16, 24, 32 bits). Bars = measured attempts,
 *         line = expected birthday bound (~1.25 * 2^(bits/2)).
 *         The y-axis is logarithmic, so exponential growth looks like a
 *         steady climb.
 *
 *  WHAT I IMPLEMENTED (exported functions)
 *  ---------------------------------------
 *  1. renderAvalancheChart(canvas, data)
 *       data = output of toChartData() in attacks/avalanche.js:
 *              { labels:string[], values:number[], changedBits:number[] }
 *       Tooltips also show the average number of changed bits.
 *
 *  2. renderCollisionChart(canvas, results)
 *       results = array from birthdaySweep() in attacks/collision.js
 *       (objects with bits, attempts, expectedAttempts, elapsedMs, found).
 *       Only results with found === true are plotted.
 *
 *  3. destroyChart(canvas)
 *       Destroys the chart on a canvas. Call it when a view is closed.
 *
 *  Internal helpers: assertChartJs(), themeColors(), mountChart().
 *
 *  DESIGN NOTES
 *  ------------
 *  - Uses the GLOBAL `Chart` object from the UMD build loaded in index.html
 *    (<script src="node_modules/chart.js/dist/chart.umd.js">). No import.
 *  - Re-rendering on the same canvas destroys the old chart first, so there
 *    is no "Canvas is already in use" error.
 *  - Text/grid colors are read from CSS variables (--text, --muted, --border)
 *    with safe fallbacks, so the charts follow the dark/light theme once
 *    base.css defines them.
 *  - Meaning is never carried by color alone: every bar has a text label on
 *    the axis and a tooltip with the exact numbers.
 *
 *  USED BY : js/ui/collisionView.js
 *  DEPENDS : Chart.js (global), a <canvas> element passed by the caller
 * ============================================================================
 */

/** One chart instance per canvas, so we can destroy before re-rendering. */
const chartsByCanvas = new WeakMap();

/** Bar colors in the fixed order XOR, RXOR, SHA-256. */
const AVALANCHE_COLORS = ['#e5484d', '#f5a524', '#30a46c'];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Fail with a clear message if Chart.js was not loaded. */
function assertChartJs() {
  if (typeof Chart === 'undefined') {
    throw new Error(
      'Chart.js is not loaded. Add <script src="node_modules/chart.js/dist/chart.umd.js"></script> ' +
        'before js/main.js in index.html.'
    );
  }
}

/** Read theme colors from CSS variables, with fallbacks. */
function themeColors() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    text: read('--text', '#888888'),
    muted: read('--muted', '#888888'),
    grid: read('--border', 'rgba(128,128,128,0.25)'),
  };
}

/** Destroy any chart on this canvas, then create the new one. */
function mountChart(canvas, config) {
  assertChartJs();
  if (!canvas) throw new Error('A <canvas> element is required');
  destroyChart(canvas);
  const chart = new Chart(canvas, config);
  chartsByCanvas.set(canvas, chart);
  return chart;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Destroy the chart attached to a canvas (if any).
 * @param {HTMLCanvasElement} canvas
 */
export function destroyChart(canvas) {
  const existing = chartsByCanvas.get(canvas);
  if (existing) {
    existing.destroy();
    chartsByCanvas.delete(canvas);
  }
}

/**
 * Draw the avalanche bar chart: % of output bits changed by a 1-bit input flip.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ labels:string[], values:number[], changedBits?:number[] }} data
 * @returns {Chart} the Chart.js instance
 */
export function renderAvalancheChart(canvas, data) {
  const theme = themeColors();
  const { labels, values, changedBits = [] } = data;

  return mountChart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Average % of output bits changed',
          data: values,
          backgroundColor: AVALANCHE_COLORS.slice(0, labels.length),
          borderRadius: 6,
          order: 2,
        },
        {
          // Reference line at the ideal 50% avalanche
          type: 'line',
          label: 'Ideal avalanche (50%)',
          data: labels.map(() => 50),
          borderColor: theme.muted,
          borderDash: [6, 6],
          borderWidth: 2,
          pointRadius: 0,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      aspectRatio: 2,
      plugins: {
        title: {
          display: true,
          text: 'Avalanche effect: one flipped input bit',
          color: theme.text,
        },
        legend: { labels: { color: theme.text } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.type === 'line') return `${ctx.dataset.label}`;
              const percent = ctx.parsed.y.toFixed(2);
              const bits = changedBits[ctx.dataIndex];
              const extra = bits === undefined ? '' : ` (avg ${bits.toFixed(2)} bits changed)`;
              return `${percent}%${extra}`;
            },
          },
        },
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: '% of output bits changed', color: theme.text },
          ticks: { color: theme.text, callback: (v) => `${v}%` },
          grid: { color: theme.grid },
        },
        x: {
          ticks: { color: theme.text },
          grid: { display: false },
        },
      },
    },
  });
}

/**
 * Draw the collision chart: attempts needed vs truncated SHA-256 size.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ bits:number, attempts:number, expectedAttempts:number,
 *           elapsedMs?:number, found?:boolean }[]} results
 *        Output of birthdaySweep() in attacks/collision.js
 * @returns {Chart} the Chart.js instance
 */
export function renderCollisionChart(canvas, results) {
  const theme = themeColors();
  const found = results.filter((r) => r.found);

  const labels = found.map((r) => `${r.bits}-bit`);
  const attempts = found.map((r) => r.attempts);
  const expected = found.map((r) => r.expectedAttempts);
  const times = found.map((r) => r.elapsedMs);

  return mountChart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Measured attempts',
          data: attempts,
          backgroundColor: '#3e63dd',
          borderRadius: 6,
          order: 2,
        },
        {
          type: 'line',
          label: 'Expected (birthday bound, ~1.25 x 2^(bits/2))',
          data: expected,
          borderColor: '#f5a524',
          borderDash: [6, 6],
          borderWidth: 2,
          pointRadius: 4,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      aspectRatio: 2,
      plugins: {
        title: {
          display: true,
          text: 'Birthday attack on truncated SHA-256',
          color: theme.text,
        },
        legend: { labels: { color: theme.text } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const value = ctx.parsed.y.toLocaleString();
              if (ctx.dataset.type === 'line') return `Expected: ~${value} attempts`;
              const ms = times[ctx.dataIndex];
              const time = ms === undefined ? '' : ` in ${ms.toFixed(0)} ms`;
              return `Measured: ${value} attempts${time}`;
            },
          },
        },
      },
      scales: {
        y: {
          type: 'logarithmic',
          title: { display: true, text: 'Attempts (log scale)', color: theme.text },
          ticks: { color: theme.text },
          grid: { color: theme.grid },
        },
        x: {
          title: { display: true, text: 'Truncated hash size', color: theme.text },
          ticks: { color: theme.text },
          grid: { display: false },
        },
      },
    },
  });
}