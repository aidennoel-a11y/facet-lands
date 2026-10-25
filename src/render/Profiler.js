/**
 * Where each frame's time goes: the frame's work marked off, part by part
 * (see main's tick), averaged over half a second; and, where the browser
 * can tell, how long the graphics card took to draw it. Shown (testing,
 * U) in a panel at the top right, worst first; and kept on `last` for the
 * headless tests.
 */
export class Profiler {
  constructor(renderer) {
    this.sums = new Map();
    this.frames = 0;
    this.t = 0;
    this.last = { parts: [], frame: 0, gpu: null, longest: 0 };
    this.longest = 0;
    this.frameStart = 0;
    // (The graphics card's own time, by a timer query, where there's one to be had.)
    const gl = renderer.getContext();
    this.gl = gl;
    this.ext = gl.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null;
    this.queries = [];
    this.gpuSum = 0;
    this.gpuCount = 0;
    this.panel = null;
    this.shown = false;
  }

  begin() {
    this.frameStart = this.t = performance.now();
  }

  /** The time since the last mark, put down to `name`. */
  mark(name) {
    const now = performance.now();
    this.sums.set(name, (this.sums.get(name) ?? 0) + now - this.t);
    this.t = now;
  }

  gpuBegin() {
    if (!this.ext || this.queries.length > 4) return;
    const q = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.open = q;
  }

  gpuEnd() {
    if (!this.open) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.queries.push(this.open);
    this.open = null;
    // (The answers come a frame or two later.)
    while (this.queries.length) {
      const q = this.queries[0];
      if (!this.gl.getQueryParameter(q, this.gl.QUERY_RESULT_AVAILABLE)) break;
      if (!this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
        this.gpuSum += this.gl.getQueryParameter(q, this.gl.QUERY_RESULT) / 1e6;
        this.gpuCount++;
      }
      this.gl.deleteQuery(q);
      this.queries.shift();
    }
  }

  /** The frame done; every half second, the averages worked out (and shown, if the panel's up). */
  end(elapsed, extra) {
    this.longest = Math.max(this.longest, performance.now() - this.frameStart);
    this.frames++;
    this.span = (this.span ?? 0) + elapsed;
    if (this.span < 0.5) return;
    const n = this.frames;
    const parts = [...this.sums].map(([name, ms]) => [name, ms / n]);
    for (const [name, ms] of Object.entries(extra ?? {})) parts.push([name, ms / n]);
    parts.sort((a, b) => b[1] - a[1]);
    this.last = { parts, frame: parts.reduce((s, p) => s + (p[0].startsWith('  ') ? 0 : p[1]), 0), gpu: this.gpuCount ? this.gpuSum / this.gpuCount : null, longest: this.longest, fps: n / this.span };
    this.sums.clear();
    this.frames = 0;
    this.span = 0;
    this.longest = 0;
    this.gpuSum = 0;
    this.gpuCount = 0;
    if (this.shown) this.#draw();
  }

  toggle() {
    this.shown = !this.shown;
    if (!this.panel) {
      this.panel = document.createElement('pre');
      Object.assign(this.panel.style, {
        position: 'fixed', top: '64px', right: '12px', zIndex: 40, margin: 0, padding: '10px 12px', minWidth: '250px',
        background: 'rgba(20, 22, 18, 0.82)', color: '#f2ead8', font: '12px/1.45 ui-monospace, Menlo, monospace', borderRadius: '6px', pointerEvents: 'none',
      });
      document.body.appendChild(this.panel);
    }
    this.panel.hidden = !this.shown;
    if (this.shown) this.#draw();
  }

  #draw() {
    const L = this.last, bar = (ms) => '█'.repeat(Math.min(20, Math.round(ms * 2)));
    const rows = L.parts.filter((p) => p[1] >= 0.05).map(([name, ms]) => `${name.padEnd(22).slice(0, 22)} ${ms.toFixed(2).padStart(6)} ${bar(ms)}`);
    this.panel.textContent = [
      `FRAME WORK   ${L.frame.toFixed(1)} ms  (worst ${L.longest.toFixed(0)} ms)`,
      `GRAPHICS CARD ${L.gpu === null ? 'n/a' : `${L.gpu.toFixed(1)} ms`}   ${Math.round(L.fps ?? 0)} fps`,
      '',
      ...rows,
    ].join('\n');
  }
}
