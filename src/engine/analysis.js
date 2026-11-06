/**
 * Decision analysis: project appraisal at the start of a year and value-maximising
 * benchmarks used by the report card and by the Textbook CFO bot.
 */
import * as F from '../finance.js';
import { CONFIG } from './config.js';
import * as M from './model.js';
import { WC_OPTIONS, previewValue, validateDecisions } from './simulate.js';

const T = CONFIG.market.taxRate;

/** Discount rates available at the start of the year for a project with unlevered beta betaU. */
export function projectRate(state, betaU) {
  const v = state.valuation;
  const betaL = F.leverBeta(betaU, T, v.debtToEquity);
  const ke = F.capm(state.riskFree, betaL, CONFIG.market.erp);
  return { betaL, ke, wacc: v.weightEquity * ke + v.weightDebt * v.blendedKd * (1 - T) };
}

/** Full appraisal of each project on offer. */
export function analyseProjects(state, offers) {
  const companyWacc = state.valuation.wacc;
  const revenuePath = (t) => M.expectedRevenue(state, t);
  return offers.projects.map((offer) => {
    const flows = M.projectCashFlows(offer, revenuePath, state.policy);
    const own = projectRate(state, offer.betaU);
    const irr = F.irr(flows);
    return {
      uid: offer.uid,
      name: offer.name,
      cost: offer.cost,
      betaU: offer.betaU,
      flows,
      companyWacc,
      ownWacc: own.wacc,
      ownBetaL: own.betaL,
      npvCompany: F.npv(companyWacc, flows),
      npvOwn: F.npv(own.wacc, flows),
      irr: irr.status === 'ok' ? irr.value : null,
      mirr: F.mirr(flows, own.wacc, own.wacc),
      pi: F.profitabilityIndex(own.wacc, flows),
      payback: F.payback(flows),
      discountedPayback: F.discountedPayback(own.wacc, flows),
    };
  });
}

/** Feasible subsets of the offer list (respecting exclusivity and the budget). */
export function feasibleSets(offers) {
  const n = offers.projects.length;
  const sets = [];
  for (let mask = 0; mask < 1 << n; mask += 1) {
    const ids = offers.projects.filter((_, i) => mask & (1 << i)).map((p) => p.uid);
    const clash = offers.exclusive.some(([a, b]) => ids.includes(a) && ids.includes(b));
    const cost = offers.projects.filter((p) => ids.includes(p.uid)).reduce((a, p) => a + p.cost, 0);
    if (clash || (offers.budget != null && cost > offers.budget + 1e-9)) continue;
    sets.push(ids);
  }
  return sets;
}

/** The value-maximising project set using each project's own risk-adjusted NPV. */
export function bestProjectSet(offers, analysis, key = 'npvOwn') {
  const byId = Object.fromEntries(analysis.map((a) => [a.uid, a]));
  let best = { ids: [], npv: 0 };
  for (const ids of feasibleSets(offers)) {
    const total = ids.reduce((acc, id) => acc + byId[id][key], 0);
    if (total > best.npv + 1e-9 || (Math.abs(total - best.npv) <= 1e-9 && ids.length < best.ids.length)) {
      best = { ids, npv: total };
    }
  }
  return best;
}

/** Working-capital settings that maximise value, by coordinate search from a starting decision. */
export function bestWorkingCapital(state, offers, d) {
  let wc = { ...d.wc };
  let bestPrice = previewValue(state, offers, { ...d, wc }).price;
  for (let pass = 0; pass < 2; pass += 1) {
    let improved = false;
    for (const key of ['creditDays', 'inventoryDays', 'payableDays']) {
      for (const opt of WC_OPTIONS[key]) {
        if (opt === wc[key]) continue;
        const trial = { ...wc, [key]: opt };
        const price = previewValue(state, offers, { ...d, wc: trial }).price;
        if (price > bestPrice + 1e-9) {
          bestPrice = price;
          wc = trial;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { wc, price: bestPrice };
}

/** Value of each single working-capital lever at its best setting, holding the others. */
export function leverEffects(state, offers, d) {
  const base = previewValue(state, offers, d).price;
  const effects = {};
  for (const key of ['creditDays', 'inventoryDays', 'payableDays']) {
    let best = { option: d.wc[key], price: base };
    for (const opt of WC_OPTIONS[key]) {
      const price = previewValue(state, offers, { ...d, wc: { ...d.wc, [key]: opt } }).price;
      if (price > best.price + 1e-9) best = { option: opt, price };
    }
    effects[key] = { chosen: d.wc[key], best: best.option, gainPerShare: best.price - base };
  }
  return effects;
}

/** Debt level (via a borrowing/repayment amount) that maximises value, given the other decisions. */
export function bestDebt(state, offers, d) {
  const D = M.totalDebt(state);
  const capacity = Math.max(D, 5 * Math.max(0, state.lastEbitda));
  let best = null;
  const tryChange = (change) => {
    const c = Math.round(change * 100) / 100;
    const trial = { ...d, financing: { ...d.financing, debtChange: c } };
    if (!validateDecisions(state, offers, trial).ok) return;
    const v = previewValue(state, offers, trial);
    if (!best || v.price > best.price + 1e-9) {
      best = { debtChange: c, price: v.price, wacc: v.wacc, rating: v.rating, coverage: v.coverage, debtAfter: D + c };
    }
  };
  tryChange(0);
  tryChange(d.financing.debtChange);
  for (let target = 0; target <= capacity + 1e-9; target += 25) tryChange(target - D);
  const centre = D + best.debtChange;
  for (let target = Math.max(0, centre - 25); target <= Math.min(capacity, centre + 25) + 1e-9; target += 5) tryChange(target - D);
  return best;
}
