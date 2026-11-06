/**
 * One financial year of CFO Arena.
 *
 * Timing (stated on the How it works page):
 *   1. Start of year: borrowing/repayment and any share issue happen; accepted projects are paid for.
 *   2. During the year: demand moves (expected growth + events + random variation), the year's
 *      working-capital policy applies, projects operate, interest is charged on the new debt.
 *   3. End of year: dividends are paid; if cash is below the minimum buffer, an emergency loan
 *      tops it up (within debt capacity). If cash is still negative, the company is bankrupt.
 *   4. The market values the company with the year-end position.
 */
import * as F from '../finance.js';
import { CONFIG } from './config.js';
import { eventsFor, combineEffects } from './events.js';
import { streamFor } from './rng.js';
import * as M from './model.js';

const T = CONFIG.market.taxRate;
const OPS = CONFIG.operations;
const FIN = CONFIG.financing;
const WC = CONFIG.workingCapital;
const DIV = CONFIG.dividend;

export const WC_OPTIONS = Object.freeze({
  creditDays: [15, 30, 45, 60],
  inventoryDays: [30, 45, 60],
  payableDays: [30, 40, 45, 60, 75],
  cashBufferPct: WC.cashBufferOptions,
});

export function defaultDecisions(state) {
  return {
    wc: { ...state.policy },
    accept: [],
    financing: { debtChange: 0, equityIssue: 0 },
    payoutRatio: state.payoutRatio,
  };
}

/** Debt capacity: maximum total debt allowed by the covenant (5x last EBITDA). */
export function debtCapacity(state) {
  return Math.max(0, FIN.maxDebtToEbitda * Math.max(0, state.lastEbitda));
}

/** Check a set of decisions. Returns { ok, errors: [{ field, message }] }. */
export function validateDecisions(state, offers, d) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  for (const key of ['creditDays', 'inventoryDays', 'payableDays', 'cashBufferPct']) {
    if (!WC_OPTIONS[key].includes(d.wc[key])) add(key, 'Choose one of the listed options.');
  }
  const ids = new Set(offers.projects.map((p) => p.uid));
  for (const uid of d.accept) if (!ids.has(uid)) add('accept', `Unknown project ${uid}.`);
  for (const [a, b] of offers.exclusive) {
    if (d.accept.includes(a) && d.accept.includes(b)) {
      add('accept', 'These two projects are mutually exclusive: choose one or neither.');
    }
  }
  const capex = offers.projects.filter((p) => d.accept.includes(p.uid)).reduce((a, p) => a + p.cost, 0);
  if (offers.budget != null && capex > offers.budget + 1e-9) {
    add('accept', `The board has capped capex at INR ${offers.budget.toFixed(0)} crore this year; your selection costs INR ${capex.toFixed(0)} crore.`);
  }
  const { debtChange, equityIssue } = d.financing;
  if (!Number.isFinite(debtChange)) add('debtChange', 'Enter a number.');
  if (!Number.isFinite(equityIssue) || equityIssue < 0) add('equityIssue', 'Enter zero or a positive amount.');
  const D = M.totalDebt(state);
  if (debtChange < 0 && -debtChange > D + 1e-9) add('debtChange', `You can repay at most INR ${D.toFixed(1)} crore (all your debt).`);
  const equityNet = equityIssue * (1 - FIN.flotationCost);
  if (debtChange < 0 && -debtChange > state.cash + equityNet + 1e-9) {
    add('debtChange', `Repayment is limited to the cash you have (INR ${(state.cash + equityNet).toFixed(1)} crore).`);
  }
  if (debtChange > 0 && D + debtChange > debtCapacity(state) + 1e-9) {
    add('debtChange', `Lenders cap total debt at ${FIN.maxDebtToEbitda}x last year's EBITDA: at most INR ${Math.max(0, debtCapacity(state) - D).toFixed(1)} crore more.`);
  }
  const maxIssue = FIN.maxIssueShareOfMarketCap * state.valuation.marketCap;
  if (equityIssue > maxIssue + 1e-9) add('equityIssue', `A share issue is limited to half the market value: INR ${maxIssue.toFixed(0)} crore.`);
  if (!(d.payoutRatio >= 0 && d.payoutRatio <= 1)) add('payoutRatio', 'Payout must be between 0% and 100%.');
  return { ok: errors.length === 0, errors };
}

function cloneState(state) {
  return {
    ...state,
    policy: { ...state.policy },
    projects: state.projects.map((p) => ({ ...p })),
  };
}

/**
 * Apply start-of-year actions (financing and project spending) and the new policies.
 * Used both by the real simulation and by previews.
 */
export function applyStartOfYear(state, offers, d) {
  const s = cloneState(state);
  const info = { repaidEmergency: 0, debtChange: d.financing.debtChange, equityGross: 0, equityNet: 0, newShares: 0, issuePrice: 0, projectCapex: 0 };
  // Sentiment from earlier years fades.
  s.sentiment = 1 + (state.sentiment - 1) * DIV.sentimentDecay;
  // Debt.
  const change = d.financing.debtChange;
  if (change > 0) {
    s.debt += change;
  } else if (change < 0) {
    const repay = -change;
    const fromEmergency = Math.min(s.emergencyDebt, repay);
    s.emergencyDebt -= fromEmergency;
    s.debt = Math.max(0, s.debt - (repay - fromEmergency));
    info.repaidEmergency = fromEmergency;
  }
  s.cash += change;
  // Equity issue.
  if (d.financing.equityIssue > 0) {
    const gross = d.financing.equityIssue;
    const issuePrice = state.valuation.price * (1 - FIN.issueDiscount);
    const newShares = gross / issuePrice;
    const net = gross * (1 - FIN.flotationCost);
    s.shares += newShares;
    s.cash += net;
    s.equityBook += net;
    s.sentiment *= 1 + FIN.issueAnnouncementEffect;
    Object.assign(info, { equityGross: gross, equityNet: net, newShares, issuePrice });
  }
  // Projects.
  for (const offer of offers.projects) {
    if (!d.accept.includes(offer.uid)) continue;
    s.cash -= offer.cost;
    info.projectCapex += offer.cost;
    s.projects.push({
      uid: offer.uid,
      templateId: offer.templateId,
      name: offer.name,
      kind: offer.kind,
      cost: offer.cost,
      life: offer.life,
      betaU: offer.betaU,
      noise: offer.noise,
      ebitda: offer.ebitda,
      vcDelta: offer.vcDelta,
      fixedDelta: offer.fixedDelta,
      age: 0,
      quality: 1,
      bookValue: offer.cost,
      yearAccepted: state.fy + 1,
    });
  }
  s.policy = { ...d.wc };
  s.payoutRatio = d.payoutRatio;
  return { state: s, info };
}

/** Pro-forma valuation after start-of-year actions (used for previews and by the bots). */
export function previewValue(state, offers, d) {
  const { state: s } = applyStartOfYear(state, offers, d);
  return M.valueCompany(s, { lastRevenue: state.lastRevenue });
}

/**
 * Simulate one year.
 * @returns {{ state, report }} new state (with year-end valuation) and a report for the results screen.
 */
export function simulateYear(state, offers, d, code, yearIndex) {
  const { events, noise } = eventsFor(code, yearIndex);
  const fx = combineEffects(events);
  const { state: s, info } = applyStartOfYear(state, offers, d);

  // Realised quality of new projects: drawn from a stream keyed by the project, so it is
  // the same for everyone who accepts it in this scenario, and independent of other decisions.
  for (const p of s.projects) {
    if (p.age === 0 && p.quality === 1 && d.accept.includes(p.uid)) {
      const draw = streamFor(code, 'quality', p.uid).normal(0, p.noise);
      p.quality = Math.max(0.2, 1 + draw);
    }
  }

  // The market's start-of-year (pro forma) view sets this year's borrowing rate and the
  // return shareholders require for the year. Rates are fixed for the year; RBI moves
  // during the year change the risk-free rate from the next valuation onwards.
  const proForma = M.valueCompany(s, { lastRevenue: state.lastRevenue });
  const kd = proForma.kd;
  const debtCost = {
    kd,
    rating: proForma.rating,
    spread: proForma.spread,
    interest: s.debt * kd + s.emergencyDebt * (kd + FIN.emergencyPremium),
  };
  const riskFreeOpening = s.riskFree;
  const riskFree = Math.max(0.03, s.riskFree + fx.rf);
  s.riskFree = riskFree;

  // Demand and revenue.
  const expectedGrowth = M.expectedGrowth(state.fy + 1);
  const growth = expectedGrowth + fx.demand + noise;
  const marketShock = growth - expectedGrowth;
  const demand = s.demand * (1 + growth);
  const pol = s.policy;
  const revenue = demand * M.salesFactor(pol) * (1 + fx.price) * (1 + fx.revenue);

  // Costs.
  const active = M.activeProjects(s);
  const shift = active.filter((p) => p.kind === 'costShift');
  const vcDelta = shift.reduce((a, p) => a + p.vcDelta * p.quality, 0);
  const fixedProjects = shift.reduce((a, p) => a + p.fixedDelta, 0);
  const premium = M.payableRow(pol.payableDays).premium;
  const cogs = revenue * (s.vcRatio + vcDelta + fx.vc) * (1 + premium);
  const badDebts = revenue * M.creditRow(pol.creditDays).badDebt;
  const fixedBase = s.fixedCosts * (1 + M.fixedCostGrowth(state.fy + 1)) * (1 + fx.fixedPct);
  const wcEnd = M.wcBalances(revenue, cogs, pol);
  const holding = WC.holdingCostRate * wcEnd.inventory;
  // Distress costs follow the credit rating the company carries into the year.
  const distress = (FIN.distressCostByRating[debtCost.rating] ?? 0) * revenue;
  const oneOff = (fx.oneOff * revenue) / 1000;
  let projectEbitda = 0;
  const projectResults = [];
  for (const p of active) {
    if (p.kind !== 'ebitda') continue;
    const expected = p.ebitda[p.age];
    const sensitivity = OPS.projectMarketSensitivity * (p.betaU / CONFIG.company.unleveredBeta) * marketShock;
    const realised = expected * p.quality * (1 + sensitivity);
    projectEbitda += realised;
    projectResults.push({ uid: p.uid, name: p.name, expected, realised });
  }
  for (const p of shift) {
    const saving = revenue * -p.vcDelta * p.quality * (1 + premium) - p.fixedDelta;
    projectResults.push({ uid: p.uid, name: p.name, expected: null, realised: saving, costShift: true });
  }
  const ebitda = revenue - cogs - badDebts - fixedBase - fixedProjects - holding - distress - oneOff + projectEbitda;

  // Depreciation and investment.
  const baseDep = s.baseNfa * OPS.depreciationRate;
  let projectDep = 0;
  for (const p of active) {
    const dep = p.cost / p.life;
    projectDep += dep;
    p.bookValue = Math.max(0, p.bookValue - dep);
    p.age += 1;
  }
  const dep = baseDep + projectDep;
  const ebit = ebitda - dep;
  const interest = debtCost.interest;
  // Cash held during the year earns the risk-free rate.
  const interestIncome = Math.max(0, s.cash) * riskFreeOpening;
  const ebt = ebit + interestIncome - interest;
  const tax = Math.max(0, ebt) * T;
  const pat = ebt - tax;
  const capexBase = baseDep + Math.max(0, demand - s.demand) / OPS.salesToCapital;
  const baseNfa = s.baseNfa + capexBase - baseDep;

  // Working capital and cash.
  const nwcBegin = s.receivables + s.inventory - s.payables;
  const dNwc = wcEnd.netWorkingCapital - nwcBegin;
  const dividends = d.payoutRatio * Math.max(0, pat);
  const dps = dividends / s.shares;
  let cash = s.cash + pat + dep - dNwc - capexBase - dividends;
  const minCash = pol.cashBufferPct * revenue;
  let emergencyLoan = 0;
  if (cash < minCash) {
    const capacity = Math.max(0, FIN.maxDebtToEbitda * Math.max(0, ebitda) - (s.debt + s.emergencyDebt));
    emergencyLoan = Math.min(minCash - cash, capacity);
    s.emergencyDebt += emergencyLoan;
    cash += emergencyLoan;
  }
  const bankrupt = cash < -1e-9;

  // Dividend signalling.
  let sentiment = s.sentiment;
  const dividendCut = state.lastDps > 0 && dps < (1 - DIV.cutThreshold) * state.lastDps;
  if (dividendCut) sentiment *= 1 + DIV.cutEffect;

  const equityBook = s.equityBook + pat - dividends;
  const coverage = interest > 0 ? ebit / interest : Infinity;

  const next = {
    ...s,
    fy: state.fy + 1,
    riskFree,
    demand,
    fixedCosts: fixedBase,
    baseNfa,
    receivables: wcEnd.receivables,
    inventory: wcEnd.inventory,
    payables: wcEnd.payables,
    cash,
    equityBook,
    lastDps: dps,
    lastRevenue: revenue,
    lastEbitda: ebitda,
    lastEbit: ebit,
    sentiment,
    bankrupt,
  };

  const income = { revenue, cogs, badDebts, fixed: fixedBase + fixedProjects, holding, distress, oneOff, projectEbitda, ebitda, dep, ebit, interestIncome, interest, ebt, tax, pat, dividends, dps };
  const balance = M.balanceSheet({ cash, ...wcEnd, baseNfa, projects: next.projects, debt: next.debt, emergencyDebt: next.emergencyDebt, equityBook });
  const cfo = pat + dep - dNwc;
  const cfi = -capexBase - info.projectCapex;
  const cff = info.debtChange + info.equityNet - dividends + emergencyLoan;
  const cashFlow = {
    opening: state.cash,
    pat,
    dep,
    dNwc,
    cfo,
    baseCapex: capexBase,
    projectCapex: info.projectCapex,
    cfi,
    debtChange: info.debtChange,
    equityNet: info.equityNet,
    dividends,
    emergencyLoan,
    cff,
    closing: cash,
    check: state.cash + cfo + cfi + cff - cash,
  };
  next.statements = { income, balance, cashFlow };

  let valuation;
  if (bankrupt) {
    valuation = { ...M.valueCompany({ ...next, cash: Math.max(cash, 0) }), price: 0, equityValue: 0, marketCap: 0, bankrupt: true };
  } else {
    valuation = M.valueCompany(next);
  }
  next.valuation = valuation;
  next.marketEquity = Math.max(valuation.equityValue, 1);

  const report = {
    events,
    effects: fx,
    growth,
    expectedGrowth,
    noise,
    marketShock,
    debtCost,
    requiredReturn: proForma.keEquity,
    proFormaPrice: proForma.price,
    info,
    projectResults,
    emergencyLoan,
    dividendCut,
    bankrupt,
    coverage,
  };
  return { state: next, report };
}

/** Annualised total shareholder return. */
export function annualisedTsr(startPrice, endPrice, totalDps, years, bankrupt = false) {
  if (bankrupt) return -1;
  const wealth = (endPrice + totalDps) / startPrice;
  return wealth > 0 ? wealth ** (1 / years) - 1 : -1;
}

/** Re-export for convenience. */
export { F };
