/**
 * Numbers about your lives (see the Skills page, K): how far you've walked,
 * swum and glided, what you've brought down and caught and felled and made,
 * the nights slept, the highest you've stood and the deepest you've gone.
 * This life's, kept with its save; and every life's together, in this
 * browser.
 */
const KEY = 'facet-lands:stats';
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const m1 = (m) => `${Math.round(m)} m`;
const n0 = (n) => Math.floor(n).toLocaleString();
/** [id, label, how it's shown, 'max' if it's the most rather than a sum, true if every life's only] */
export const STATS = [
  ['days', 'Days survived', (d) => d.toFixed(1)],
  ['walked', 'Distance walked', km],
  ['swum', 'Distance swum', km],
  ['glided', 'Distance glided', km],
  ['ridden', 'Distance ridden', km],
  ['hunted', 'Animals brought down', n0],
  ['beasts', 'Great beasts brought down', n0],
  ['fish', 'Fish caught', n0],
  ['trees', 'Trees felled', n0],
  ['crafted', 'Things made', n0],
  ['nights', 'Nights slept', n0],
  ['highest', 'Highest point stood on', m1, 'max'],
  ['deepest', 'Deepest underground', m1, 'max'],
  ['deaths', 'Lives lost', n0, null, true],
];

export class Stats {
  constructor() {
    this.life = {};
    try {
      this.total = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
    } catch {
      this.total = {};
    }
    this.unsaved = false;
  }

  reset() {
    this.life = {};
  }

  /** `n` more of `id`, this life and all of them. */
  add(id, n = 1) {
    if (!(n > 0)) return;
    this.life[id] = (this.life[id] ?? 0) + n;
    this.total[id] = (this.total[id] ?? 0) + n;
    this.unsaved = true;
  }

  /** The most of `id` so far (a height, a depth), if `v` beats it. */
  max(id, v) {
    if (!Number.isFinite(v)) return;
    if (v > (this.life[id] ?? -Infinity)) this.life[id] = v;
    if (v > (this.total[id] ?? -Infinity)) (this.total[id] = v), (this.unsaved = true);
  }

  /** Every life's numbers into the browser's store (now and then: see Game's saving). */
  saveTotals() {
    if (!this.unsaved) return;
    this.unsaved = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.total));
    } catch {
      // (For this visit only.)
    }
  }

  /** Rows to show: [label, this life's, every life's]. */
  rows() {
    return STATS.map(([id, label, show, , totalOnly]) => [label, totalOnly ? '' : this.life[id] !== undefined ? show(this.life[id]) : '—', this.total[id] !== undefined ? show(this.total[id]) : '—']);
  }

  toJSON() {
    return this.life;
  }

  load(data) {
    this.life = data && typeof data === 'object' ? { ...data } : {};
  }
}
