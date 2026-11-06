/**
 * Accessible SVG charts drawn at the container's real pixel width, so text stays
 * readable on phones and projectors. Colours come from CSS classes (theme-aware).
 * Every chart carries a title, a description and a data table for screen readers.
 */
import { h, s, uid } from './dom.js';

const PAD = { top: 18, right: 16, bottom: 34, left: 56 };

function niceTicks(min, max, count = 5) {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/** Wrap a draw function so it re-renders when the container is resized. */
function responsive(draw, { height: heightOpt = 260, ariaLabel, description, table }) {
  const id = uid('chart');
  const holder = h('div', { class: 'chart-holder' });
  const figure = h('figure', { class: 'chart-figure' }, holder);
  let lastWidth = 0;
  const render = () => {
    const width = Math.max(280, Math.floor(holder.clientWidth || 600));
    if (width === lastWidth) return;
    lastWidth = width;
    const height = typeof heightOpt === 'function' ? heightOpt(width) : heightOpt;
    const svg = s('svg', {
      class: 'chart',
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-labelledby': `${id}-t ${id}-d`,
    });
    svg.append(s('title', { id: `${id}-t` }, ariaLabel), s('desc', { id: `${id}-d` }, description ?? ''));
    draw(svg, width, height);
    holder.replaceChildren(svg);
  };
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => render());
    ro.observe(holder);
  }
  requestAnimationFrame(render);
  if (table) {
    figure.append(
      h('details', { class: 'disclosure small no-print' }, h('summary', null, 'Show the data'), h('div', null, table)),
    );
  }
  return figure;
}

export function dataTable(headers, rows) {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'ledger' },
      h('thead', null, h('tr', null, headers.map((x, i) => h('th', { class: i ? 'n' : '' }, x)))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h('td', { class: i ? 'n' : '' }, c))))),
    ),
  );
}

/**
 * Line chart over categories.
 * @param series [{ name, values:number[], cls: 1|2|3 }]
 * @param labels category labels
 * @param markers [{ index, label }] vertical markers at a category
 */
export function lineChart({ series, labels, yFormat = (v) => String(v), height = 260, ariaLabel, description, markers = [], xTitle }) {
  const table = dataTable(['', ...series.map((x) => x.name)], labels.map((l, i) => [l, ...series.map((x) => yFormat(x.values[i]))]));
  const figure = responsive(
    (svg, width, hgt) => {
      const all = series.flatMap((x) => x.values.filter(Number.isFinite));
      const ticks = niceTicks(Math.min(...all), Math.max(...all));
      const y0 = ticks[0];
      const y1 = ticks[ticks.length - 1];
      const plotW = width - PAD.left - PAD.right;
      const plotH = hgt - PAD.top - PAD.bottom - (xTitle ? 14 : 0);
      const x = (i) => PAD.left + (labels.length === 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
      const y = (v) => PAD.top + plotH - ((v - y0) / (y1 - y0)) * plotH;
      for (const t of ticks) {
        svg.append(s('line', { class: 'grid-line', x1: PAD.left, x2: width - PAD.right, y1: y(t), y2: y(t) }));
        svg.append(s('text', { x: PAD.left - 8, y: y(t) + 4, 'text-anchor': 'end' }, yFormat(t)));
      }
      const every = Math.ceil(labels.length / Math.max(2, Math.floor(plotW / 64)));
      labels.forEach((l, i) => {
        if (i % every === 0 || i === labels.length - 1) {
          svg.append(s('text', { x: x(i), y: PAD.top + plotH + 18, 'text-anchor': 'middle' }, l));
        }
      });
      if (xTitle) svg.append(s('text', { x: PAD.left + plotW / 2, y: hgt - 4, 'text-anchor': 'middle' }, xTitle));
      for (const m of markers) {
        svg.append(s('line', { class: 'marker', x1: x(m.index), x2: x(m.index), y1: PAD.top, y2: PAD.top + plotH }));
        if (m.label) svg.append(s('text', { class: 'label-strong', x: x(m.index) + 6, y: PAD.top + 10 }, m.label));
      }
      series.forEach((ser) => {
        const pts = ser.values.map((v, i) => [x(i), Number.isFinite(v) ? y(v) : null]).filter((p) => p[1] !== null);
        svg.append(s('path', { class: `series-${ser.cls ?? 1}`, d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') }));
        if (labels.length <= 12) {
          for (const p of pts) svg.append(s('circle', { class: `dot-${ser.cls ?? 1}`, cx: p[0], cy: p[1], r: 3.5 }));
        }
      });
      for (const m of markers) {
        if (m.value !== undefined) svg.append(s('circle', { class: 'marker-dot', cx: x(m.index), cy: y(m.value), r: 5 }));
      }
    },
    { height, ariaLabel, description, table },
  );
  if (series.length > 1) {
    figure.insertBefore(
      h('div', { class: 'legend' }, series.map((ser) => h('span', { class: 'key' }, h('span', { class: `swatch s${ser.cls ?? 1}` }), ser.name))),
      figure.lastChild,
    );
  }
  return figure;
}

/**
 * Line chart over a numeric x axis (for NPV profiles, EBIT-EPS lines, price-yield curves).
 * @param series [{ name, points:[{x,y}], cls }]
 */
export function xyChart({ series, xFormat = (v) => String(v), yFormat = (v) => String(v), height = 260, ariaLabel, description, markers = [], xTitle, zeroLine = false }) {
  const first = series[0].points;
  const table = dataTable(['x', ...series.map((x) => x.name)], first.map((p, i) => [xFormat(p.x), ...series.map((ser) => yFormat(ser.points[i]?.y))]));
  const figure = responsive(
    (svg, width, hgt) => {
      const xs = series.flatMap((ser) => ser.points.map((p) => p.x));
      const ys = series.flatMap((ser) => ser.points.map((p) => p.y)).filter(Number.isFinite);
      if (zeroLine) ys.push(0);
      const xt = niceTicks(Math.min(...xs), Math.max(...xs), 6);
      const yt = niceTicks(Math.min(...ys), Math.max(...ys));
      const plotW = width - PAD.left - PAD.right;
      const plotH = hgt - PAD.top - PAD.bottom - (xTitle ? 14 : 0);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const x = (v) => PAD.left + ((v - xMin) / (xMax - xMin || 1)) * plotW;
      const y = (v) => PAD.top + plotH - ((v - yt[0]) / (yt[yt.length - 1] - yt[0])) * plotH;
      for (const t of yt) {
        svg.append(s('line', { class: t === 0 && zeroLine ? 'zero-line' : 'grid-line', x1: PAD.left, x2: width - PAD.right, y1: y(t), y2: y(t) }));
        svg.append(s('text', { x: PAD.left - 8, y: y(t) + 4, 'text-anchor': 'end' }, yFormat(t)));
      }
      const every = Math.ceil(xt.length / Math.max(2, Math.floor(plotW / 70)));
      xt.forEach((t, i) => {
        if (t < xMin - 1e-9 || t > xMax + 1e-9 || i % every) return;
        svg.append(s('text', { x: x(t), y: PAD.top + plotH + 18, 'text-anchor': 'middle' }, xFormat(t)));
      });
      if (xTitle) svg.append(s('text', { x: PAD.left + plotW / 2, y: hgt - 4, 'text-anchor': 'middle' }, xTitle));
      series.forEach((ser) => {
        const pts = ser.points.filter((p) => Number.isFinite(p.y));
        svg.append(s('path', { class: `series-${ser.cls ?? 1}`, d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ') }));
      });
      markers.forEach((m, k) => {
        if (m.x < xMin || m.x > xMax) return;
        svg.append(s('line', { class: 'marker', x1: x(m.x), x2: x(m.x), y1: PAD.top, y2: PAD.top + plotH }));
        if (m.y !== undefined) svg.append(s('circle', { class: 'marker-dot', cx: x(m.x), cy: y(m.y), r: 5 }));
        if (m.label) {
          const right = x(m.x) > width - 150;
          svg.append(s('text', { class: 'label-strong', x: x(m.x) + (right ? -6 : 6), y: PAD.top + 10 + k * 15, 'text-anchor': right ? 'end' : 'start' }, m.label));
        }
      });
    },
    { height, ariaLabel, description, table },
  );
  if (series.length > 1) {
    figure.insertBefore(
      h('div', { class: 'legend' }, series.map((ser) => h('span', { class: 'key' }, h('span', { class: `swatch s${ser.cls ?? 1}` }), ser.name))),
      figure.lastChild,
    );
  }
  return figure;
}

/**
 * Waterfall: start total, signed steps, end total.
 * @param steps [{ label, value }]
 */
export function waterfallChart({ start, startLabel = 'Start', steps, endLabel = 'End', format = (v) => String(v), height = 300, ariaLabel, description }) {
  const end = start + steps.reduce((a, x) => a + x.value, 0);
  const rows = [[startLabel, format(start)], ...steps.map((x) => [x.label, `${x.value >= 0 ? '+' : '−'}${format(Math.abs(x.value))}`]), [endLabel, format(end)]];
  const table = dataTable(['Step', 'Value'], rows);
  const bars = [{ label: startLabel, from: 0, to: start, kind: 'total' }];
  let run = start;
  for (const st of steps) {
    bars.push({ label: st.label, from: run, to: run + st.value, kind: st.value >= 0 ? 'pos' : 'neg', value: st.value });
    run += st.value;
  }
  bars.push({ label: endLabel, from: 0, to: end, kind: 'total' });
  const levels = bars.flatMap((b) => (b.kind === 'total' ? [b.to] : [b.from, b.to]));
  const lo = Math.min(...levels);
  const hi = Math.max(...levels);
  const spread = hi - lo || 1;
  const valueText = (b) => (b.kind === 'total' ? format(b.to) : `${b.value >= 0 ? '+' : '\u2212'}${format(Math.abs(b.value))}`);
  const barClass = (b) => (b.kind === 'total' ? 'bar-total' : b.kind === 'pos' ? 'bar-pos' : 'bar-neg');
  const NARROW = 600;
  return responsive(
    (svg, width, hgt) => {
      const ticks = niceTicks(Math.max(0, lo - spread * 0.6), hi + spread * 0.12, 4);
      const t0 = ticks[0];
      const t1 = ticks[ticks.length - 1];
      if (width < NARROW) {
        // Horizontal layout for phones: one row per step, labels on the left.
        const labelW = Math.min(150, width * 0.4);
        const plotW = width - labelW - 64;
        const rowH = 34;
        const x = (v) => labelW + ((v - t0) / (t1 - t0)) * plotW;
        bars.forEach((b, i) => {
          const yy = 6 + i * rowH;
          const left = b.kind === 'total' ? x(t0) : x(Math.min(b.from, b.to));
          const right = x(Math.max(b.from, b.to));
          svg.append(s('text', { x: labelW - 8, y: yy + 18, 'text-anchor': 'end' }, b.label.length > 24 ? `${b.label.slice(0, 22)}\u2026` : b.label));
          svg.append(s('rect', { class: barClass(b), x: left, y: yy + 5, width: Math.max(1.5, right - left), height: rowH - 12, rx: 2 }));
          svg.append(s('text', { class: 'label-strong', x: right + 6, y: yy + 18 }, valueText(b)));
          if (i < bars.length - 1) svg.append(s('line', { class: 'connector', x1: x(b.to), x2: x(b.to), y1: yy + rowH - 7, y2: yy + rowH + 5 }));
        });
        return;
      }
      const padBottom = 46;
      const plotW = width - PAD.left - PAD.right;
      const plotH = hgt - PAD.top - padBottom;
      const y = (v) => PAD.top + plotH - ((v - t0) / (t1 - t0)) * plotH;
      const slot = plotW / bars.length;
      const bw = Math.min(56, slot * 0.62);
      for (const t of ticks) {
        svg.append(s('line', { class: 'grid-line', x1: PAD.left, x2: width - PAD.right, y1: y(t), y2: y(t) }));
        svg.append(s('text', { x: PAD.left - 8, y: y(t) + 4, 'text-anchor': 'end' }, format(t)));
      }
      bars.forEach((b, i) => {
        const cx = PAD.left + slot * i + slot / 2;
        const top = y(Math.max(b.from, b.to));
        const bottom = b.kind === 'total' ? y(t0) : y(Math.min(b.from, b.to));
        svg.append(s('rect', { class: barClass(b), x: cx - bw / 2, y: top, width: bw, height: Math.max(1.5, bottom - top), rx: 2 }));
        svg.append(s('text', { class: 'label-strong', x: cx, y: top - 6, 'text-anchor': 'middle' }, valueText(b)));
        if (i < bars.length - 1) svg.append(s('line', { class: 'connector', x1: cx + bw / 2, x2: cx + slot - bw / 2, y1: y(b.to), y2: y(b.to) }));
        const words = b.label.split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
          if ((line + ' ' + w).trim().length > Math.max(6, Math.floor(slot / 6.2))) {
            if (line) lines.push(line);
            line = w;
          } else {
            line = (line + ' ' + w).trim();
          }
        }
        if (line) lines.push(line);
        lines.slice(0, 3).forEach((ln, k) => {
          svg.append(s('text', { x: cx, y: PAD.top + plotH + 16 + k * 13, 'text-anchor': 'middle' }, ln));
        });
      });
    },
    { height: (w) => (w < NARROW ? bars.length * 34 + 14 : height), ariaLabel, description, table },
  );
}

/** Horizontal bar chart for comparing a measure across items (e.g. bot strategies). */
export function barChart({ items, format = (v) => String(v), height, ariaLabel, description, highlight }) {
  const table = dataTable(['Item', 'Value'], items.map((it) => [it.label, format(it.value)]));
  const rowH = 34;
  const hgt = height ?? items.length * rowH + 30;
  return responsive(
    (svg, width) => {
      const labelW = Math.min(170, width * 0.38);
      const vals = items.map((it) => it.value);
      const lo = Math.min(0, ...vals);
      const hi = Math.max(0, ...vals);
      const plotW = width - labelW - 70;
      const x = (v) => labelW + ((v - lo) / (hi - lo || 1)) * plotW;
      svg.append(s('line', { class: 'zero-line', x1: x(0), x2: x(0), y1: 4, y2: hgt - 20 }));
      items.forEach((it, i) => {
        const yy = 8 + i * rowH;
        const x0 = x(Math.min(0, it.value));
        const x1 = x(Math.max(0, it.value));
        svg.append(s('text', { class: it.label === highlight ? 'label-strong' : '', x: labelW - 10, y: yy + 17, 'text-anchor': 'end' }, it.label));
        svg.append(s('rect', { class: it.label === highlight ? 'bar-total' : it.value >= 0 ? 'bar-pos' : 'bar-neg', x: x0, y: yy + 4, width: Math.max(1.5, x1 - x0), height: rowH - 12, rx: 2 }));
        svg.append(s('text', { class: 'label-strong', x: it.value >= 0 ? x1 + 6 : x0 - 6, y: yy + 17, 'text-anchor': it.value >= 0 ? 'start' : 'end' }, format(it.value)));
      });
    },
    { height: hgt, ariaLabel, description, table },
  );
}
