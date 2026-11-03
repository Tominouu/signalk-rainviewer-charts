// Renders weekly npm downloads as an SVG bar chart for the README.
// Usage: node scripts/downloads-chart.mjs [output.svg]
// No dependencies: Node 18+ global fetch, data from api.npmjs.org.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PKG = 'signalk-rainviewer-charts';
const OUT = process.argv[2] ?? 'stats/downloads.svg';
const DAY = 86_400_000;

const iso = (t) => new Date(t).toISOString().slice(0, 10);

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const meta = await getJson(`https://registry.npmjs.org/${PKG}`);
const created = Date.parse(meta.time.created);
// npm publishes a day's count the next day, so stop at yesterday.
const end = Date.UTC(...iso(Date.now() - DAY).split('-').map((v, i) => (i === 1 ? v - 1 : +v)));

// The range endpoint caps a request at 18 months, so fetch in yearly slices.
const daily = [];
for (let from = created; from <= end; from += 365 * DAY) {
  const to = Math.min(from + 364 * DAY, end);
  const { downloads } = await getJson(
    `https://api.npmjs.org/downloads/range/${iso(from)}:${iso(to)}/${PKG}`
  );
  daily.push(...downloads);
}

// Weeks start on Monday.
const weeks = new Map();
for (const { day, downloads } of daily) {
  const t = Date.parse(day);
  const monday = iso(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY);
  weeks.set(monday, (weeks.get(monday) ?? 0) + downloads);
}
const data = [...weeks].map(([week, count]) => ({ week, count }));
const total = data.reduce((s, d) => s + d.count, 0);

// Layout
const W = 720, H = 240;
const pad = { top: 44, right: 16, bottom: 32, left: 48 };
const cw = W - pad.left - pad.right;
const ch = H - pad.top - pad.bottom;
const niceMax = (v) => {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
};
const max = niceMax(Math.max(...data.map((d) => d.count)));
const slot = cw / Math.max(data.length, 1);
const barW = Math.max(1, slot * 0.72);
const y = (v) => pad.top + ch - (v / max) * ch;

const grid = [0, 0.5, 1]
  .map((f) => {
    const v = Math.round(max * f);
    return `<line class="grid" x1="${pad.left}" x2="${W - pad.right}" y1="${y(v)}" y2="${y(v)}"/>` +
      `<text class="axis" x="${pad.left - 6}" y="${y(v) + 4}" text-anchor="end">${v.toLocaleString('en-US')}</text>`;
  })
  .join('');

const bars = data
  .map((d, i) => {
    const x = pad.left + i * slot + (slot - barW) / 2;
    const h = Math.max(d.count > 0 ? 1 : 0, (d.count / max) * ch);
    return `<rect class="bar" x="${x.toFixed(1)}" y="${(pad.top + ch - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>Week of ${d.week}: ${d.count}</title></rect>`;
  })
  .join('');

// Label the first week of each month, skipping labels that would overlap.
let lastLabelX = -Infinity;
const months = data
  .map((d, i) => {
    const prev = data[i - 1];
    if (prev && prev.week.slice(0, 7) === d.week.slice(0, 7)) return '';
    const x = pad.left + i * slot + slot / 2;
    if (x - lastLabelX < 44) return '';
    lastLabelX = x;
    const label = new Date(d.week).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    return `<text class="axis" x="${x.toFixed(1)}" y="${H - pad.bottom + 18}" text-anchor="middle">${label}</text>`;
  })
  .join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly npm downloads of ${PKG}: ${total} in total">
<style>
  .title { font: 600 14px system-ui, -apple-system, sans-serif; fill: #1f2328; }
  .sub, .axis { font: 11px system-ui, -apple-system, sans-serif; fill: #59636e; }
  .grid { stroke: #d1d9e0; stroke-width: 1; }
  .bar { fill: #0969da; }
  @media (prefers-color-scheme: dark) {
    .title { fill: #f0f6fc; }
    .sub, .axis { fill: #9198a1; }
    .grid { stroke: #3d444d; }
    .bar { fill: #4493f8; }
  }
</style>
<text class="title" x="${pad.left}" y="20">Weekly npm downloads</text>
<text class="sub" x="${pad.left}" y="36">${total.toLocaleString('en-US')} total · updated ${iso(end)}</text>
${grid}${bars}${months}
</svg>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log(`${OUT}: ${data.length} weeks, ${total} downloads`);
