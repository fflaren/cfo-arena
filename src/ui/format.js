/** Number formatting: Indian digit grouping, INR crore, per-share rupees, percentages. */
const nf = new Map();
function fmt(decimals) {
  if (!nf.has(decimals)) {
    nf.set(decimals, new Intl.NumberFormat('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  }
  return nf.get(decimals);
}

const MINUS = '−';

/** 1,23,456.7 with a true minus sign. */
export function num(x, decimals = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  const v = fmt(decimals).format(Math.abs(x));
  return x < -0.5 * 10 ** -decimals ? `${MINUS}${v}` : v;
}

/** INR crore: "₹1,234.5 cr". */
export function crore(x, decimals = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  const v = fmt(decimals).format(Math.abs(x));
  return `${x < -0.5 * 10 ** -decimals ? MINUS : ''}₹${v} cr`;
}

/** Rupees per share: "₹101.52". */
export function rupees(x, decimals = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  const v = fmt(decimals).format(Math.abs(x));
  return `${x < -0.5 * 10 ** -decimals ? MINUS : ''}₹${v}`;
}

/** Percentage from a decimal: 0.1234 -> "12.3%". */
export function pct(x, decimals = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  return `${num(x * 100, decimals)}%`;
}

/** Signed percentage: "+2.4%" / "−1.0%". */
export function signedPct(x, decimals = 1) {
  if (!Number.isFinite(x)) return 'n/a';
  const v = num(Math.abs(x) * 100, decimals);
  if (Math.abs(x) < 0.5 * 10 ** -(decimals + 2)) return `${v}%`;
  return `${x > 0 ? '+' : MINUS}${v}%`;
}

/** Signed crore: "+₹12.3 cr". */
export function signedCrore(x, decimals = 1) {
  if (!Number.isFinite(x)) return 'n/a';
  const v = crore(Math.abs(x), decimals);
  if (Math.abs(x) < 0.5 * 10 ** -decimals) return v;
  return `${x > 0 ? '+' : MINUS}${v}`;
}

export function signedRupees(x, decimals = 2) {
  if (!Number.isFinite(x)) return 'n/a';
  const v = rupees(Math.abs(x), decimals);
  if (Math.abs(x) < 0.5 * 10 ** -decimals) return v;
  return `${x > 0 ? '+' : MINUS}${v}`;
}

export function times(x, decimals = 2) {
  if (x === Infinity) return 'no interest';
  if (!Number.isFinite(x)) return 'n/a';
  return `${num(x, decimals)}x`;
}

export function years(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'never';
  return `${num(x, 1)} yrs`;
}

export function fy(n) {
  return `FY${n}`;
}

/** Rating class for badges. */
export function ratingTone(rating) {
  if (['AAA', 'AA', 'A+', 'A', 'A-'].includes(rating)) return 'good';
  if (['BBB', 'BB+', 'BB'].includes(rating)) return 'ok';
  return 'bad';
}
