/**
 * Company model: opening position, cost of capital and valuation.
 *
 * Valuation uses value additivity:
 *   Enterprise value = PV(base business FCFF at the base-business WACC)
 *                    + sum of PV(each project's remaining cash flows at that project's own WACC)
 * Each WACC uses the firm's market-value capital structure, with beta relevered by Hamada.
 * Because the market discounts every cash flow at its own risk, accepting a project changes
 * value by (approximately) its NPV at its risk-adjusted rate. That is the lesson the WACC
 * trap teaches.
 */
import * as F from '../finance.js';
import { CONFIG } from './config.js';

const T = CONFIG.market.taxRate;
const WC = CONFIG.workingCapital;
const OPS = CONFIG.operations;
const FIN = CONFIG.financing;
const VAL = CONFIG.valuation;

/* ------------------------------------------------------------------ */
/* Policy helpers                                                      */
/* ------------------------------------------------------------------ */

export function creditRow(days) {
  const row = WC.creditDays[days];
  if (!row) throw new F.FinanceError(`Credit period of ${days} days is not an option.`);
  return row;
}
export function inventoryRow(days) {
  const row = WC.inventoryDays[days];
  if (!row) throw new F.FinanceError(`Inventory level of ${days} days is not an option.`);
  return row;
}
export function payableRow(days) {
  const row = WC.payableDays[days];
  if (!row) throw new F.FinanceError(`Payment period of ${days} days is not an option.`);
  return row;
}

/** Revenue multiplier from credit and inventory policy. */
export function salesFactor(policy) {
  return (1 + creditRow(policy.creditDays).sales) * (1 + inventoryRow(policy.inventoryDays).sales);
}

/** Variable costs as a share of revenue, including any supplier premium for slow payment. */
export function cogsRatio(vcRatio, policy) {
  return vcRatio * (1 + payableRow(policy.payableDays).premium);
}

/** Working-capital balances for a given revenue and cost of goods sold. */
export function wcBalances(revenue, cogs, policy) {
  return F.workingCapitalFromDays({
    revenue,
    cogs,
    dsoDays: policy.creditDays,
    dioDays: policy.inventoryDays,
    dpoDays: policy.payableDays,
  });
}

export function totalDebt(state) {
  return state.debt + state.emergencyDebt;
}

export function activeProjects(state) {
  return state.projects.filter((p) => p.age < p.life);
}

/* ------------------------------------------------------------------ */
/* Cost of debt                                                        */
/* ------------------------------------------------------------------ */

/**
 * Pre-tax cost of normal debt from the synthetic rating.
 * Coverage = EBIT / interest, where interest itself depends on the rate, so iterate.
 * Emergency debt costs the normal rate plus the emergency premium.
 */
export function costOfDebt({ ebit, debt, emergencyDebt = 0, riskFree }) {
  const totalD = debt + emergencyDebt;
  if (totalD <= 1e-9) {
    const r = F.syntheticRating(Infinity);
    return { kd: riskFree + r.spread, rating: r.rating, spread: r.spread, coverage: Infinity, interest: 0 };
  }
  let kd = riskFree + 0.01;
  let rating = null;
  for (let i = 0; i < 40; i += 1) {
    const interest = debt * kd + emergencyDebt * (kd + FIN.emergencyPremium);
    const cov = interest > 0 ? ebit / interest : Infinity;
    rating = F.syntheticRating(cov);
    const next = riskFree + rating.spread;
    if (Math.abs(next - kd) < 1e-12) break;
    kd = next;
  }
  const interest = debt * kd + emergencyDebt * (kd + FIN.emergencyPremium);
  return { kd, rating: rating.rating, spread: rating.spread, coverage: interest > 0 ? ebit / interest : Infinity, interest };
}

/** Expected indirect cost of financial distress for a year, from the rating implied by coverage. */
export function distressCost(coverage, revenue) {
  const { rating } = F.syntheticRating(coverage);
  return (FIN.distressCostByRating[rating] ?? 0) * revenue;
}

/* ------------------------------------------------------------------ */
/* Growth path                                                         */
/* ------------------------------------------------------------------ */

/**
 * Expected nominal demand growth for a fiscal year. The business matures: growth fades
 * in a straight line from the start rate (FY27) to the terminal rate (FY36), and the
 * market's expectations follow the same calendar path, so prices are not biased.
 */
export function expectedGrowth(fy) {
  const G = OPS.growthPath;
  const w = Math.max(0, Math.min(1, (G.matureFy - fy) / (G.matureFy - G.startFy)));
  return VAL.terminalGrowth + (G.start - VAL.terminalGrowth) * w;
}

/** Expected growth of cash fixed costs: a little slower than demand until the business matures. */
export function fixedCostGrowth(fy) {
  const G = OPS.growthPath;
  const w = Math.max(0, Math.min(1, (G.matureFy - fy) / (G.matureFy - G.startFy)));
  return expectedGrowth(fy) - OPS.fixedCostGap * w;
}

/** Years of explicit forecast: at least five, and always out to the year the business matures. */
export function horizon(fy) {
  return Math.max(VAL.forecastYears, OPS.growthPath.matureFy - fy);
}

/** Expected revenue k years ahead under the current policy. */
export function expectedRevenue(state, k) {
  let demand = state.demand;
  for (let j = 1; j <= k; j += 1) demand *= 1 + expectedGrowth(state.fy + j);
  return demand * salesFactor(state.policy);
}

/* ------------------------------------------------------------------ */
/* Forecast                                                            */
/* ------------------------------------------------------------------ */

/** Expected EBITDA and depreciation of a project in forecast year k (k = 1 is next year). */
export function projectExpected(project, k, revenueK, policy) {
  const idx = project.age + k - 1;
  if (idx >= project.life) return { ebitda: 0, dep: 0, active: false };
  const dep = project.cost / project.life;
  if (project.kind === 'costShift') {
    const prem = 1 + payableRow(policy.payableDays).premium;
    const ebitda = revenueK * -project.vcDelta * prem - project.fixedDelta;
    return { ebitda: ebitda * project.quality, dep, active: true };
  }
  return { ebitda: project.ebitda[idx] * project.quality, dep, active: true };
}

/** Project cash flows as a NPV-ready array (t = 0 investment, then after-tax FCF). */
export function projectCashFlows(offer, expectedRevenuePath, policy) {
  const dep = offer.cost / offer.life;
  const flows = [-offer.cost];
  for (let t = 1; t <= offer.life; t += 1) {
    let ebitda;
    if (offer.kind === 'costShift') {
      const prem = 1 + payableRow(policy.payableDays).premium;
      ebitda = expectedRevenuePath(t) * -offer.vcDelta * prem - offer.fixedDelta;
    } else {
      ebitda = offer.ebitda[t - 1];
    }
    flows.push(ebitda * (1 - T) + dep * T);
  }
  return flows;
}

/**
 * Explicit forecast of the base business (years 1..N) and project streams,
 * given the debt level and cost of debt (for the distress test).
 */
export function forecast(state, { interest }) {
  const N = horizon(state.fy);
  const pol = state.policy;
  const sf = salesFactor(pol);
  const cr = cogsRatio(state.vcRatio, pol);
  const bd = creditRow(pol.creditDays).badDebt;
  const rows = [];
  let demandPrev = state.demand;
  let fixedPrev = state.fixedCosts;
  let nfaPrev = state.baseNfa;
  let nwcPrev = state.receivables + state.inventory - state.payables;
  const projects = activeProjects(state);
  const projectRows = projects.map(() => []);
  for (let k = 1; k <= N; k += 1) {
    const demand = demandPrev * (1 + expectedGrowth(state.fy + k));
    const revenue = demand * sf;
    const cogs = revenue * cr;
    const badDebts = revenue * bd;
    const fixed = fixedPrev * (1 + fixedCostGrowth(state.fy + k));
    const wc = wcBalances(revenue, cogs, pol);
    const holding = WC.holdingCostRate * wc.inventory;
    const dep = nfaPrev * OPS.depreciationRate;
    const capex = dep + Math.max(0, demand - demandPrev) / OPS.salesToCapital;
    const nfa = nfaPrev + capex - dep;
    let projEbitda = 0;
    let projDep = 0;
    projects.forEach((p, i) => {
      const e = projectExpected(p, k, revenue, pol);
      projEbitda += e.ebitda;
      projDep += e.dep;
      projectRows[i].push(e);
    });
    const ebitdaPre = revenue - cogs - badDebts - fixed - holding;
    const ebitTotalPre = ebitdaPre - dep + projEbitda - projDep;
    const coverage = interest > 0 ? ebitTotalPre / interest : Infinity;
    const distress = distressCost(coverage, revenue);
    const ebitda = ebitdaPre - distress;
    const ebit = ebitda - dep;
    const nopat = ebit * (1 - T);
    const nwc = wc.netWorkingCapital;
    const fcff = nopat + dep - capex - (nwc - nwcPrev);
    rows.push({ k, demand, revenue, cogs, badDebts, fixed, holding, distress, ebitda, dep, ebit, nopat, capex, nwc, dNwc: nwc - nwcPrev, fcff, nfa, coverage });
    demandPrev = demand;
    fixedPrev = fixed;
    nfaPrev = nfa;
    nwcPrev = nwc;
  }
  return { rows, projects, projectRows };
}

/* ------------------------------------------------------------------ */
/* Valuation                                                           */
/* ------------------------------------------------------------------ */

/**
 * Value the company at the end of a year (or pro forma after start-of-year decisions).
 * @param state company state
 * @param opts.lastRevenue revenue used for the minimum cash buffer
 */
export function valueCompany(state, opts = {}) {
  const rf = state.riskFree;
  const erp = CONFIG.market.erp;
  const lastRevenue = opts.lastRevenue ?? state.lastRevenue;
  const minCash = state.policy.cashBufferPct * lastRevenue;
  // A cash shortfall below the minimum buffer will have to be met with an emergency loan;
  // the market prices that in now.
  const shortfall = Math.max(0, minCash - state.cash);
  const emergencyDebt = state.emergencyDebt + shortfall;
  const D = state.debt + emergencyDebt;
  const cash = state.cash + shortfall;
  const excessCash = cash - minCash;
  // Cash earns the risk-free rate and is netted against debt (net debt), the usual practice.
  const netDebt = D - cash;

  // Cost of debt from expected next-year EBIT (before any distress cost).
  const pre = forecast(state, { interest: 0 });
  const ebit1 =
    pre.rows[0].ebit + pre.projectRows.reduce((acc, r) => acc + r[0].ebitda - r[0].dep, 0);
  const debtCost = costOfDebt({ ebit: ebit1, debt: state.debt, emergencyDebt, riskFree: rf });
  const blendedKd = D > 0 ? debtCost.interest / D : debtCost.kd;
  const fc = forecast(state, { interest: debtCost.interest });

  const g = VAL.terminalGrowth;
  const last = fc.rows[fc.rows.length - 1];
  const nopat6 = last.ebit * (1 + g) * (1 - T);
  const reinvest6 = g * (last.nfa + last.nwc);
  const fcff6 = nopat6 - reinvest6;

  const projFlows = fc.projects.map((p) => {
    const flows = [];
    for (let k = 1; k <= p.life - p.age; k += 1) {
      const revK = k <= fc.rows.length ? fc.rows[k - 1].revenue : last.revenue * (1 + g) ** (k - fc.rows.length);
      const e = projectExpected(p, k, revK, state.policy);
      flows.push(e.ebitda * (1 - T) + e.dep * T);
    }
    return flows;
  });

  const prevE = state.marketEquity > 0 ? state.marketEquity : Math.max(1, state.shares * 50);
  let E = prevE;
  let iterations = 0;
  let converged = false;
  let out = null;
  for (; iterations < VAL.maxIterations; iterations += 1) {
    const Ew = Math.max(E, 1);
    const nd = Math.max(netDebt, 0);
    const de = nd / Ew;
    const wE = Ew / (Ew + nd);
    const wD = nd / (Ew + nd);
    const rateFor = (betaU) => {
      const betaL = F.leverBeta(betaU, T, de);
      const ke = F.capm(rf, betaL, erp);
      return { betaL, ke, wacc: wE * ke + wD * blendedKd * (1 - T) };
    };
    const base = rateFor(CONFIG.company.unleveredBeta);
    const waccBase = Math.max(base.wacc, g + 0.005);
    let pvBase = 0;
    fc.rows.forEach((r) => {
      pvBase += r.fcff / (1 + waccBase) ** r.k;
    });
    const tv = fcff6 / (waccBase - g);
    const pvTv = tv / (1 + waccBase) ** fc.rows.length;
    pvBase += pvTv;
    const projVals = fc.projects.map((p, i) => {
      const r = rateFor(p.betaU);
      const pv = projFlows[i].reduce((acc, cf, j) => acc + cf / (1 + r.wacc) ** (j + 1), 0);
      return { uid: p.uid, name: p.name, pv, wacc: r.wacc, betaL: r.betaL };
    });
    const pvProjects = projVals.reduce((acc, v) => acc + v.pv, 0);
    const ev = pvBase + pvProjects;
    const Enew = ev - netDebt;
    out = { base, waccBase, pvBase, tv, pvTv, projVals, pvProjects, ev, de, wE, wD };
    if (Math.abs(Enew - E) <= VAL.tolerance * Math.max(1, Math.abs(E))) {
      E = Enew;
      converged = true;
      break;
    }
    E = 0.5 * E + 0.5 * Enew;
  }

  const equityValue = E;
  const fundamentalPrice = Math.max(equityValue, 0) / state.shares;
  const price = Math.max(0.01, fundamentalPrice * state.sentiment);
  const weightedWacc =
    out.ev > 0
      ? (out.pvBase * out.waccBase + out.projVals.reduce((a, v) => a + Math.max(v.pv, 0) * v.wacc, 0)) /
        (out.pvBase + out.projVals.reduce((a, v) => a + Math.max(v.pv, 0), 0))
      : out.waccBase;
  const assetBeta =
    out.ev > 0
      ? (out.pvBase * CONFIG.company.unleveredBeta +
          fc.projects.reduce((a, p, i) => a + Math.max(out.projVals[i].pv, 0) * p.betaU, 0)) /
        (out.pvBase + out.projVals.reduce((a, v) => a + Math.max(v.pv, 0), 0))
      : CONFIG.company.unleveredBeta;

  // Required return on the company's shares: CAPM with the value-weighted asset beta
  // (base business and projects) relevered at the market net-debt-to-equity ratio.
  // A company with more cash than debt holds a zero-beta asset alongside its operations.
  const betaEquity =
    netDebt >= 0 ? F.leverBeta(assetBeta, T, out.de) : (assetBeta * out.ev) / Math.max(out.ev - netDebt, 1);
  const keEquity = F.capm(rf, betaEquity, erp);

  return {
    price,
    fundamentalPrice,
    betaEquity,
    keEquity,
    equityValue,
    marketCap: price * state.shares,
    ev: out.ev,
    pvBase: out.pvBase,
    tv: out.tv,
    pvTv: out.pvTv,
    tvShare: out.pvTv / out.ev,
    pvProjects: out.pvProjects,
    projects: out.projVals,
    waccBase: out.waccBase,
    wacc: weightedWacc,
    ke: out.base.ke,
    betaL: out.base.betaL,
    assetBeta,
    kd: debtCost.kd,
    blendedKd,
    rating: debtCost.rating,
    spread: debtCost.spread,
    coverage: debtCost.coverage,
    interestNext: debtCost.interest,
    debtToEquity: out.de,
    weightEquity: out.wE,
    weightDebt: out.wD,
    excessCash,
    netDebt,
    minCash,
    anticipatedEmergencyLoan: shortfall,
    forecast: fc.rows,
    fcff6,
    iterations,
    converged,
  };
}

/* ------------------------------------------------------------------ */
/* Opening position (FY26)                                             */
/* ------------------------------------------------------------------ */

export function openingState() {
  const C = CONFIG.company;
  const policy = { ...C.policy };
  const revenue = C.demand * salesFactor(policy);
  const cogs = revenue * cogsRatio(C.vcRatio, policy);
  const badDebts = revenue * creditRow(policy.creditDays).badDebt;
  const wc = wcBalances(revenue, cogs, policy);
  const holding = WC.holdingCostRate * wc.inventory;
  const ebitda = revenue - cogs - badDebts - C.fixedCosts - holding;
  const dep = C.baseNfa * OPS.depreciationRate;
  const ebit = ebitda - dep;
  const rf = CONFIG.market.riskFree;
  const debtCost = costOfDebt({ ebit, debt: C.debt, emergencyDebt: 0, riskFree: rf });
  const interest = debtCost.interest;
  const interestIncome = C.cash * rf;
  const ebt = ebit + interestIncome - interest;
  const tax = Math.max(0, ebt) * T;
  const pat = ebt - tax;
  const dividends = C.payoutRatio * Math.max(0, pat);
  const equityBook = C.cash + wc.receivables + wc.inventory + C.baseNfa - wc.payables - C.debt;

  const state = {
    fy: C.startFy,
    riskFree: rf,
    demand: C.demand,
    vcRatio: C.vcRatio,
    fixedCosts: C.fixedCosts,
    baseNfa: C.baseNfa,
    cash: C.cash,
    debt: C.debt,
    emergencyDebt: 0,
    shares: C.shares,
    receivables: wc.receivables,
    inventory: wc.inventory,
    payables: wc.payables,
    equityBook,
    policy,
    payoutRatio: C.payoutRatio,
    lastDps: dividends / C.shares,
    lastRevenue: revenue,
    lastEbitda: ebitda,
    lastEbit: ebit,
    sentiment: 1,
    projects: [],
    marketEquity: 0,
    bankrupt: false,
    statements: {
      income: { revenue, cogs, badDebts, fixed: C.fixedCosts, holding, distress: 0, oneOff: 0, projectEbitda: 0, ebitda, dep, ebit, interestIncome, interest, ebt, tax, pat, dividends, dps: dividends / C.shares },
      balance: balanceSheet({ cash: C.cash, ...wc, baseNfa: C.baseNfa, projects: [], debt: C.debt, emergencyDebt: 0, equityBook }),
      cashFlow: null,
    },
  };
  const v = valueCompany(state);
  state.marketEquity = v.equityValue;
  state.valuation = v;
  return state;
}

export function balanceSheet({ cash, receivables, inventory, baseNfa, projects, payables, debt, emergencyDebt, equityBook }) {
  const projectAssets = projects.reduce((a, p) => a + p.bookValue, 0);
  const totalAssets = cash + receivables + inventory + baseNfa + projectAssets;
  const totalLiabilitiesEquity = payables + debt + emergencyDebt + equityBook;
  return {
    cash,
    receivables,
    inventory,
    fixedAssets: baseNfa + projectAssets,
    totalAssets,
    payables,
    debt,
    emergencyDebt,
    equity: equityBook,
    totalLiabilitiesEquity,
    difference: totalAssets - totalLiabilitiesEquity,
  };
}
