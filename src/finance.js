/**
 * CFO Arena finance library.
 *
 * Pure functions only: no DOM, no randomness, no global state.
 * Conventions (also stated on the How it works page):
 *   - Rates are decimals (0.12 means 12%).
 *   - Cash-flow arrays start at t = 0 (cfs[0] is today, usually the investment, negative).
 *   - Cash flows occur at the end of each period unless a function says otherwise.
 *   - Money is in INR crore unless a function says otherwise.
 * Invalid inputs throw a FinanceError with a plain-language message that the UI can show.
 */

export class FinanceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FinanceError';
  }
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function need(cond, message) {
  if (!cond) throw new FinanceError(message);
}

function needNums(obj) {
  for (const [k, v] of Object.entries(obj)) {
    need(isNum(v), `${k} must be a number.`);
  }
}

/* ------------------------------------------------------------------ */
/* Time value of money                                                 */
/* ------------------------------------------------------------------ */

/** Present value of a single amount received after n periods. */
export function pvLump(amount, rate, n) {
  needNums({ amount, rate, n });
  need(rate > -1, 'The rate must be greater than -100%.');
  return amount / (1 + rate) ** n;
}

/** Future value of a single amount invested for n periods. */
export function fvLump(amount, rate, n) {
  needNums({ amount, rate, n });
  need(rate > -1, 'The rate must be greater than -100%.');
  return amount * (1 + rate) ** n;
}

/** Present value of an annuity of `payment` for n periods (ordinary unless due = true). */
export function pvAnnuity(payment, rate, n, due = false) {
  needNums({ payment, rate, n });
  need(n >= 0, 'The number of periods cannot be negative.');
  need(rate > -1, 'The rate must be greater than -100%.');
  const base = rate === 0 ? payment * n : (payment * (1 - (1 + rate) ** -n)) / rate;
  return due ? base * (1 + rate) : base;
}

/** Future value of an annuity of `payment` for n periods (ordinary unless due = true). */
export function fvAnnuity(payment, rate, n, due = false) {
  needNums({ payment, rate, n });
  need(n >= 0, 'The number of periods cannot be negative.');
  need(rate > -1, 'The rate must be greater than -100%.');
  const base = rate === 0 ? payment * n : (payment * ((1 + rate) ** n - 1)) / rate;
  return due ? base * (1 + rate) : base;
}

/** Present value of a perpetuity paying `payment` from the end of period 1. */
export function pvPerpetuity(payment, rate) {
  needNums({ payment, rate });
  need(rate > 0, 'A perpetuity needs a discount rate above zero.');
  return payment / rate;
}

/** Present value of a growing perpetuity whose first payment (end of period 1) is `payment1`. */
export function pvGrowingPerpetuity(payment1, rate, growth) {
  needNums({ payment1, rate, growth });
  need(rate > growth, 'The discount rate must be higher than the growth rate.');
  return payment1 / (rate - growth);
}

/**
 * Equated monthly instalment (or any periodic instalment).
 * @param principal loan amount
 * @param annualRate nominal annual rate (decimal)
 * @param years loan term in years
 * @param periodsPerYear 12 for monthly
 */
export function emi(principal, annualRate, years, periodsPerYear = 12) {
  needNums({ principal, annualRate, years, periodsPerYear });
  need(years > 0 && periodsPerYear > 0, 'Term and payment frequency must be positive.');
  const r = annualRate / periodsPerYear;
  const n = Math.round(years * periodsPerYear);
  if (r === 0) return principal / n;
  return (principal * r * (1 + r) ** n) / ((1 + r) ** n - 1);
}

/** Effective annual rate from a nominal annual rate compounded m times a year. */
export function effectiveAnnualRate(nominalRate, m) {
  needNums({ nominalRate, m });
  need(m > 0, 'Compounding frequency must be positive.');
  return (1 + nominalRate / m) ** m - 1;
}

/* ------------------------------------------------------------------ */
/* Capital budgeting                                                   */
/* ------------------------------------------------------------------ */

function needCashFlows(cfs) {
  need(Array.isArray(cfs) && cfs.length >= 2, 'Enter at least two cash flows (today and one future period).');
  cfs.forEach((c, i) => need(isNum(c), `Cash flow ${i} must be a number.`));
}

/** Net present value; cfs[0] occurs today and is not discounted. */
export function npv(rate, cfs) {
  needNums({ rate });
  needCashFlows(cfs);
  need(rate > -1, 'The rate must be greater than -100%.');
  return cfs.reduce((acc, cf, t) => acc + cf / (1 + rate) ** t, 0);
}

function signChanges(cfs) {
  let changes = 0;
  let last = 0;
  for (const c of cfs) {
    if (c === 0) continue;
    const s = Math.sign(c);
    if (last !== 0 && s !== last) changes += 1;
    last = s;
  }
  return changes;
}

function bisect(f, lo, hi, tol = 1e-10, maxIter = 300) {
  let flo = f(lo);
  for (let i = 0; i < maxIter; i += 1) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < tol || hi - lo < tol) return mid;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Internal rate of return.
 * Scans a wide grid of rates for sign changes of NPV and refines each with bisection,
 * so it never diverges.
 * @returns {{status:'ok', value:number} | {status:'none', reason:string} | {status:'multiple', values:number[], reason:string}}
 */
export function irr(cfs) {
  needCashFlows(cfs);
  if (signChanges(cfs) === 0) {
    return { status: 'none', reason: 'The cash flows never change sign, so there is no IRR.' };
  }
  const f = (r) => cfs.reduce((acc, cf, t) => acc + cf / (1 + r) ** t, 0);
  const grid = [];
  for (let r = -0.99; r < 1; r += 0.005) grid.push(r);
  for (let r = 1; r <= 10; r += 0.05) grid.push(r);
  const roots = [];
  for (let i = 0; i < grid.length - 1; i += 1) {
    const a = grid[i];
    const b = grid[i + 1];
    const fa = f(a);
    const fb = f(b);
    if (fa === 0) roots.push(a);
    else if (Math.sign(fa) !== Math.sign(fb)) roots.push(bisect(f, a, b));
  }
  const unique = roots.filter((r, i) => i === 0 || Math.abs(r - roots[i - 1]) > 1e-6);
  if (unique.length === 0) {
    return { status: 'none', reason: 'No rate between -99% and 1000% makes NPV zero.' };
  }
  if (unique.length > 1) {
    return {
      status: 'multiple',
      values: unique,
      reason: 'The cash flows change sign more than once, so there are several IRRs. Use NPV instead.',
    };
  }
  return { status: 'ok', value: unique[0] };
}

/**
 * Modified IRR: negative flows discounted to t = 0 at the finance rate,
 * positive flows compounded to the final period at the reinvestment rate.
 */
export function mirr(cfs, financeRate, reinvestRate) {
  needCashFlows(cfs);
  needNums({ financeRate, reinvestRate });
  const n = cfs.length - 1;
  let pvNeg = 0;
  let fvPos = 0;
  cfs.forEach((cf, t) => {
    if (cf < 0) pvNeg += cf / (1 + financeRate) ** t;
    else fvPos += cf * (1 + reinvestRate) ** (n - t);
  });
  need(pvNeg < 0 && fvPos > 0, 'MIRR needs at least one negative and one positive cash flow.');
  return (fvPos / -pvNeg) ** (1 / n) - 1;
}

/** Profitability index: PV of future cash flows divided by the initial investment. */
export function profitabilityIndex(rate, cfs) {
  needCashFlows(cfs);
  need(cfs[0] < 0, 'The first cash flow must be the investment (negative).');
  const pvFuture = npv(rate, cfs) - cfs[0];
  return pvFuture / -cfs[0];
}

/** Payback period in years with straight-line interpolation; null if never paid back. */
export function payback(cfs) {
  needCashFlows(cfs);
  let cum = cfs[0];
  if (cum >= 0) return 0;
  for (let t = 1; t < cfs.length; t += 1) {
    const before = cum;
    cum += cfs[t];
    if (cum >= 0) return t - 1 + -before / cfs[t];
  }
  return null;
}

/** Discounted payback period; null if never paid back. */
export function discountedPayback(rate, cfs) {
  needCashFlows(cfs);
  const disc = cfs.map((cf, t) => cf / (1 + rate) ** t);
  return payback(disc);
}

/** NPV at each rate in `rates` (for an NPV profile chart). */
export function npvProfile(cfs, rates) {
  return rates.map((r) => ({ rate: r, npv: npv(r, cfs) }));
}

/** Crossover rate: the IRR of the difference between two projects' cash flows. */
export function crossoverRate(cfsA, cfsB) {
  needCashFlows(cfsA);
  needCashFlows(cfsB);
  const len = Math.max(cfsA.length, cfsB.length);
  const diff = [];
  for (let t = 0; t < len; t += 1) diff.push((cfsA[t] ?? 0) - (cfsB[t] ?? 0));
  return irr(diff);
}

/**
 * Capital rationing for indivisible projects.
 * Returns both the profitability-index ranking (the textbook rule of thumb)
 * and the true best combination found by checking every subset (fine for <= 15 projects).
 * @param projects [{id, cost, npv}]
 */
export function rationCapital(projects, budget) {
  needNums({ budget });
  need(projects.length <= 15, 'Too many projects to check every combination.');
  const withPi = projects.map((p) => ({ ...p, pi: (p.npv + p.cost) / p.cost }));
  const byPi = [...withPi].sort((a, b) => b.pi - a.pi);
  const greedy = [];
  let spent = 0;
  for (const p of byPi) {
    if (p.npv > 0 && spent + p.cost <= budget + 1e-9) {
      greedy.push(p.id);
      spent += p.cost;
    }
  }
  let best = { ids: [], npv: 0, cost: 0 };
  const n = withPi.length;
  for (let mask = 1; mask < 1 << n; mask += 1) {
    let cost = 0;
    let value = 0;
    const ids = [];
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) {
        cost += withPi[i].cost;
        value += withPi[i].npv;
        ids.push(withPi[i].id);
      }
    }
    if (cost <= budget + 1e-9 && value > best.npv + 1e-9) best = { ids, npv: value, cost };
  }
  const greedyNpv = withPi.filter((p) => greedy.includes(p.id)).reduce((a, p) => a + p.npv, 0);
  return { ranking: byPi, piChoice: greedy, piChoiceNpv: greedyNpv, best };
}

/* ------------------------------------------------------------------ */
/* Leverage                                                            */
/* ------------------------------------------------------------------ */

/** Degree of operating leverage = contribution / EBIT. */
export function dol(sales, variableCosts, fixedCosts) {
  needNums({ sales, variableCosts, fixedCosts });
  const contribution = sales - variableCosts;
  const ebit = contribution - fixedCosts;
  need(ebit !== 0, 'EBIT is zero, so operating leverage is undefined.');
  return contribution / ebit;
}

/** Degree of financial leverage = EBIT / (EBIT - interest - preference dividend grossed up for tax). */
export function dfl(ebit, interest, prefDividend = 0, taxRate = 0) {
  needNums({ ebit, interest, prefDividend, taxRate });
  const denom = ebit - interest - prefDividend / (1 - taxRate);
  need(denom !== 0, 'Profit before tax is zero, so financial leverage is undefined.');
  return ebit / denom;
}

/** Degree of combined leverage = DOL x DFL. */
export function dcl(sales, variableCosts, fixedCosts, interest, prefDividend = 0, taxRate = 0) {
  const ebit = sales - variableCosts - fixedCosts;
  return dol(sales, variableCosts, fixedCosts) * dfl(ebit, interest, prefDividend, taxRate);
}

/** Earnings per share. */
export function eps(ebit, interest, taxRate, shares, prefDividend = 0) {
  needNums({ ebit, interest, taxRate, shares });
  need(shares > 0, 'Shares outstanding must be positive.');
  return ((ebit - interest) * (1 - taxRate) - prefDividend) / shares;
}

/**
 * EBIT at which two financing plans give the same EPS.
 * Plan = { interest, shares }.
 */
export function ebitEpsIndifference(planA, planB) {
  needNums({ aI: planA.interest, aN: planA.shares, bI: planB.interest, bN: planB.shares });
  need(planA.shares !== planB.shares, 'The plans have the same number of shares, so EPS lines never cross.');
  return (planA.interest * planB.shares - planB.interest * planA.shares) / (planB.shares - planA.shares);
}

/* ------------------------------------------------------------------ */
/* Working capital                                                     */
/* ------------------------------------------------------------------ */

export const DAYS_IN_YEAR = 365;

/** Days sales outstanding (receivable days). */
export function dso(receivables, revenue, days = DAYS_IN_YEAR) {
  needNums({ receivables, revenue });
  need(revenue > 0, 'Revenue must be positive.');
  return (receivables / revenue) * days;
}

/** Days inventory outstanding. */
export function dio(inventory, cogs, days = DAYS_IN_YEAR) {
  needNums({ inventory, cogs });
  need(cogs > 0, 'Cost of goods sold must be positive.');
  return (inventory / cogs) * days;
}

/** Days payables outstanding. */
export function dpo(payables, cogs, days = DAYS_IN_YEAR) {
  needNums({ payables, cogs });
  need(cogs > 0, 'Cost of goods sold must be positive.');
  return (payables / cogs) * days;
}

/** Operating cycle = DIO + DSO. */
export function operatingCycle(dioDays, dsoDays) {
  return dioDays + dsoDays;
}

/** Cash conversion cycle = DIO + DSO - DPO. */
export function cashConversionCycle(dioDays, dsoDays, dpoDays) {
  return dioDays + dsoDays - dpoDays;
}

/** Working-capital balances implied by day counts. */
export function workingCapitalFromDays({ revenue, cogs, dsoDays, dioDays, dpoDays, days = DAYS_IN_YEAR }) {
  needNums({ revenue, cogs, dsoDays, dioDays, dpoDays });
  const receivables = (revenue * dsoDays) / days;
  const inventory = (cogs * dioDays) / days;
  const payables = (cogs * dpoDays) / days;
  return { receivables, inventory, payables, netWorkingCapital: receivables + inventory - payables };
}

/* ------------------------------------------------------------------ */
/* Cost of capital                                                     */
/* ------------------------------------------------------------------ */

/** CAPM: Ke = Rf + beta x ERP. */
export function capm(riskFree, beta, equityRiskPremium) {
  needNums({ riskFree, beta, equityRiskPremium });
  return riskFree + beta * equityRiskPremium;
}

/** Hamada: levered beta = unlevered beta x [1 + (1 - t) x D/E]. */
export function leverBeta(unleveredBeta, taxRate, debtToEquity) {
  needNums({ unleveredBeta, taxRate, debtToEquity });
  need(debtToEquity >= 0, 'Debt-to-equity cannot be negative.');
  return unleveredBeta * (1 + (1 - taxRate) * debtToEquity);
}

/** Hamada: unlevered beta = levered beta / [1 + (1 - t) x D/E]. */
export function unleverBeta(leveredBeta, taxRate, debtToEquity) {
  needNums({ leveredBeta, taxRate, debtToEquity });
  need(debtToEquity >= 0, 'Debt-to-equity cannot be negative.');
  return leveredBeta / (1 + (1 - taxRate) * debtToEquity);
}

/** After-tax cost of debt. */
export function afterTaxCostOfDebt(preTaxKd, taxRate) {
  needNums({ preTaxKd, taxRate });
  return preTaxKd * (1 - taxRate);
}

/** WACC with market-value weights. */
export function wacc({ equityValue, debtValue, costOfEquity, preTaxCostOfDebt, taxRate }) {
  needNums({ equityValue, debtValue, costOfEquity, preTaxCostOfDebt, taxRate });
  need(equityValue > 0, 'Equity value must be positive.');
  need(debtValue >= 0, 'Debt cannot be negative.');
  const v = equityValue + debtValue;
  return (equityValue / v) * costOfEquity + (debtValue / v) * preTaxCostOfDebt * (1 - taxRate);
}

/* ------------------------------------------------------------------ */
/* Bonds                                                               */
/* ------------------------------------------------------------------ */

function bondFlows({ face, couponRate, years, frequency }) {
  const n = Math.round(years * frequency);
  const coupon = (face * couponRate) / frequency;
  return { n, coupon };
}

/** Bond price given yield to maturity (annual rate, compounded `frequency` times a year). */
export function bondPrice({ face = 100, couponRate, ytm, years, frequency = 1 }) {
  needNums({ face, couponRate, ytm, years, frequency });
  need(years > 0 && frequency > 0, 'Years to maturity and coupon frequency must be positive.');
  const { n, coupon } = bondFlows({ face, couponRate, years, frequency });
  const y = ytm / frequency;
  need(y > -1, 'The yield must be greater than -100%.');
  let price = 0;
  for (let t = 1; t <= n; t += 1) price += coupon / (1 + y) ** t;
  price += face / (1 + y) ** n;
  return price;
}

/** Yield to maturity (annual, compounded `frequency` times a year) solved by bisection. */
export function bondYtm({ price, face = 100, couponRate, years, frequency = 1 }) {
  needNums({ price, face, couponRate, years, frequency });
  need(price > 0, 'Price must be positive.');
  const f = (ytm) => bondPrice({ face, couponRate, ytm, years, frequency }) - price;
  const lo = -0.5 * frequency + 1e-6;
  const hi = 5;
  need(Math.sign(f(lo)) !== Math.sign(f(hi)), 'No yield between -50% and 500% matches this price.');
  return bisect(f, lo, hi, 1e-12);
}

/** Current yield = annual coupon / price. */
export function currentYield({ price, face = 100, couponRate }) {
  needNums({ price, face, couponRate });
  need(price > 0, 'Price must be positive.');
  return (face * couponRate) / price;
}

/** Macaulay duration in years. */
export function macaulayDuration({ face = 100, couponRate, ytm, years, frequency = 1 }) {
  const price = bondPrice({ face, couponRate, ytm, years, frequency });
  const { n, coupon } = bondFlows({ face, couponRate, years, frequency });
  const y = ytm / frequency;
  let weighted = 0;
  for (let t = 1; t <= n; t += 1) {
    const cf = coupon + (t === n ? face : 0);
    weighted += (t * cf) / (1 + y) ** t;
  }
  return weighted / price / frequency;
}

/** Modified duration = Macaulay duration / (1 + ytm / frequency). */
export function modifiedDuration(params) {
  const frequency = params.frequency ?? 1;
  return macaulayDuration(params) / (1 + params.ytm / frequency);
}

/* ------------------------------------------------------------------ */
/* Equity valuation                                                    */
/* ------------------------------------------------------------------ */

/** Gordon growth model: P0 = D1 / (r - g). */
export function gordonPrice(nextDividend, requiredReturn, growth) {
  needNums({ nextDividend, requiredReturn, growth });
  need(requiredReturn > growth, 'The required return must be higher than the growth rate.');
  return nextDividend / (requiredReturn - growth);
}

/**
 * Two-stage dividend discount model.
 * Dividends grow at gHigh for nHigh years from D0, then at gStable for ever.
 */
export function twoStageDdm({ d0, gHigh, nHigh, gStable, requiredReturn }) {
  needNums({ d0, gHigh, nHigh, gStable, requiredReturn });
  need(requiredReturn > gStable, 'The required return must be higher than the stable growth rate.');
  need(nHigh >= 1 && Number.isInteger(nHigh), 'The high-growth period must be a whole number of years (at least 1).');
  let pv = 0;
  let d = d0;
  for (let t = 1; t <= nHigh; t += 1) {
    d *= 1 + gHigh;
    pv += d / (1 + requiredReturn) ** t;
  }
  const terminal = (d * (1 + gStable)) / (requiredReturn - gStable);
  const pvTerminal = terminal / (1 + requiredReturn) ** nHigh;
  return { price: pv + pvTerminal, pvHighGrowth: pv, terminalValue: terminal, pvTerminal };
}

/** Growth rate implied by a price: g = r - D1 / P0. */
export function impliedGrowth(price, nextDividend, requiredReturn) {
  needNums({ price, nextDividend, requiredReturn });
  need(price > 0, 'Price must be positive.');
  return requiredReturn - nextDividend / price;
}

/** Justified P/E from the Gordon model. Leading = payout / (r - g); trailing = payout x (1 + g) / (r - g). */
export function impliedPe(payoutRatio, requiredReturn, growth) {
  needNums({ payoutRatio, requiredReturn, growth });
  need(requiredReturn > growth, 'The required return must be higher than the growth rate.');
  const leading = payoutRatio / (requiredReturn - growth);
  return { leading, trailing: leading * (1 + growth) };
}

/* ------------------------------------------------------------------ */
/* Credit: synthetic rating                                            */
/* ------------------------------------------------------------------ */

/**
 * Interest coverage to rating and default spread.
 * Source: Aswath Damodaran, "Ratings, Interest Coverage Ratios and Default Spread",
 * January 2026 update (large non-financial firms).
 * Each row: coverage greater than `above` (and up to the next row) earns this rating.
 */
export const RATING_TABLE = Object.freeze([
  { above: 8.5, rating: 'AAA', spread: 0.004 },
  { above: 6.5, rating: 'AA', spread: 0.0055 },
  { above: 5.5, rating: 'A+', spread: 0.007 },
  { above: 4.25, rating: 'A', spread: 0.0078 },
  { above: 3.0, rating: 'A-', spread: 0.0089 },
  { above: 2.5, rating: 'BBB', spread: 0.0111 },
  { above: 2.25, rating: 'BB+', spread: 0.0138 },
  { above: 2.0, rating: 'BB', spread: 0.0184 },
  { above: 1.75, rating: 'B+', spread: 0.0275 },
  { above: 1.5, rating: 'B', spread: 0.0321 },
  { above: 1.25, rating: 'B-', spread: 0.0509 },
  { above: 0.8, rating: 'CCC', spread: 0.0885 },
  { above: 0.65, rating: 'CC', spread: 0.1261 },
  { above: 0.2, rating: 'C', spread: 0.16 },
  { above: -Infinity, rating: 'D', spread: 0.19 },
]);

/**
 * Synthetic rating from interest coverage (EBIT / interest expense).
 * A firm with no interest expense is treated as AAA.
 */
export function syntheticRating(coverage) {
  if (coverage === Infinity || Number.isNaN(coverage)) return { ...RATING_TABLE[0], coverage };
  needNums({ coverage });
  const row = RATING_TABLE.find((r) => coverage > r.above) ?? RATING_TABLE[RATING_TABLE.length - 1];
  return { rating: row.rating, spread: row.spread, coverage };
}

/** Rank of a rating (0 = AAA, larger = worse). */
export function ratingRank(rating) {
  return RATING_TABLE.findIndex((r) => r.rating === rating);
}
