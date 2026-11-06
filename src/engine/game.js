/**
 * Game controller: a game is fully described by its scenario code, its length and the
 * player's decisions, so it is saved and shared as just those, and rebuilt by replaying.
 */
import { CONFIG } from './config.js';
import * as M from './model.js';
import { offersFor } from './projects.js';
import { eventsFor } from './events.js';
import { simulateYear, validateDecisions, defaultDecisions, annualisedTsr, previewValue } from './simulate.js';
import { analyseProjects, bestProjectSet, bestWorkingCapital, bestDebt, leverEffects } from './analysis.js';

const T = CONFIG.market.taxRate;

export function newGame({ code, years = CONFIG.game.fullYears, nickname = '' }) {
  const state = M.openingState();
  return {
    version: 1,
    code,
    years,
    nickname,
    startPrice: state.valuation.price,
    state,
    history: [],
    status: 'playing',
  };
}

export function currentYearIndex(game) {
  return game.history.length + 1;
}

export function currentOffers(game) {
  return offersFor(game.code, currentYearIndex(game));
}

export function decisionsTemplate(game) {
  return defaultDecisions(game.state);
}

/** Value bridge: decompose (price + DPS) change into decision areas by sequential counterfactuals. */
export function valueBridge(prev, offers, d, code, yearIndex) {
  const neutral = {
    wc: { ...prev.policy },
    accept: [],
    financing: { debtChange: 0, equityIssue: 0 },
    payoutRatio: prev.payoutRatio,
  };
  const stages = [
    neutral,
    { ...neutral, wc: { ...d.wc } },
    { ...neutral, wc: { ...d.wc }, accept: [...d.accept] },
    { ...neutral, wc: { ...d.wc }, accept: [...d.accept], financing: { ...d.financing } },
    d,
  ];
  const values = stages.map((dec) => {
    const { state } = simulateYear(prev, offers, dec, code, yearIndex);
    return state.valuation.price + state.statements.income.dps;
  });
  const start = prev.valuation.price;
  return {
    start,
    end: values[4],
    components: [
      { key: 'luck', label: 'Market, events and carry-over', value: values[0] - start },
      { key: 'workingCapital', label: 'Working capital', value: values[1] - values[0] },
      { key: 'investment', label: 'Investment', value: values[2] - values[1] },
      { key: 'financing', label: 'Financing', value: values[3] - values[2] },
      { key: 'dividend', label: 'Dividend', value: values[4] - values[3] },
    ],
  };
}

/**
 * Play one year.
 * @param opts.analyse compute report-card benchmarks (slower; off for bots)
 * @param opts.bridge compute the value bridge (slower; off for bots)
 */
export function playYear(game, decisions, opts = { analyse: true, bridge: true }) {
  if (game.status !== 'playing') throw new Error('This game has finished.');
  const yearIndex = currentYearIndex(game);
  const offers = offersFor(game.code, yearIndex);
  const check = validateDecisions(game.state, offers, decisions);
  if (!check.ok) {
    const err = new Error(check.errors.map((e) => e.message).join(' '));
    err.errors = check.errors;
    throw err;
  }
  const prev = game.state;
  let analysis = null;
  if (opts.analyse) {
    const projects = analyseProjects(prev, offers);
    analysis = {
      projects,
      bestSet: bestProjectSet(offers, projects),
      bestWc: bestWorkingCapital(prev, offers, decisions),
      levers: leverEffects(prev, offers, decisions),
      bestDebt: bestDebt(prev, offers, decisions),
      chosenPrice: previewValue(prev, offers, decisions).price,
    };
  }
  const { state, report } = simulateYear(prev, offers, decisions, game.code, yearIndex);
  const bridge = opts.bridge ? valueBridge(prev, offers, decisions, game.code, yearIndex) : null;
  const inc = state.statements.income;
  const investedCapital = prev.baseNfa + prev.projects.reduce((a, p) => a + p.bookValue, 0) + prev.receivables + prev.inventory - prev.payables;
  const eva = inc.ebit * (1 - T) - prev.valuation.wacc * investedCapital;
  const entry = {
    before: snapshot(prev),
    after: snapshot(state),
    yearIndex,
    fy: state.fy,
    decisions: structuredCloneSafe(decisions),
    offers,
    report,
    analysis,
    bridge,
    eva,
    investedCapital,
    openingWacc: prev.valuation.wacc,
    requiredReturn: report.requiredReturn,
    price: state.valuation.price,
    dps: inc.dps,
    priceBefore: prev.valuation.price,
  };
  const history = [...game.history, entry];
  let status = 'playing';
  if (state.bankrupt) status = 'bankrupt';
  else if (history.length >= game.years) status = 'finished';
  return { ...game, state, history, status };
}

/**
 * Scorecard.
 * TSR: dividends reinvested in the shares (wealth index W).
 * Required return: the company's cost of equity at the start of each year (CAPM with the
 * beta your decisions created). Risk-adjusted excess return (alpha) = TSR beyond what
 * shareholders required for the risk they carried. Alpha rewards value creation, not risk-taking.
 */
export function summary(game) {
  const years = game.history.length;
  const bankrupt = game.status === 'bankrupt';
  let wealth = 1;
  let required = 1;
  let prevPrice = game.startPrice;
  let totalDps = 0;
  const path = [];
  game.history.forEach((h) => {
    const price = h === game.history[game.history.length - 1] && bankrupt ? 0 : h.price;
    wealth *= (price + h.dps) / prevPrice;
    required *= 1 + h.requiredReturn;
    totalDps += h.dps;
    prevPrice = price > 0 ? price : prevPrice;
    path.push({ fy: h.fy, price, dps: h.dps, wealth, required });
  });
  const endPrice = bankrupt ? 0 : game.state.valuation.price;
  const tsr = years > 0 ? (bankrupt ? -1 : wealth ** (1 / years) - 1) : 0;
  const requiredReturn = years > 0 ? required ** (1 / years) - 1 : 0;
  const alpha = years > 0 ? (bankrupt ? -1 : (wealth / required) ** (1 / years) - 1) : 0;
  const cumulativeEva = game.history.reduce((a, h) => a + h.eva, 0);
  return { years, totalDps, endPrice, tsr, requiredReturn, alpha, cumulativeEva, rating: game.state.valuation.rating, bankrupt, path, simpleTsr: years > 0 ? annualisedTsr(game.startPrice, endPrice, totalDps, years, bankrupt) : 0 };
}

/** Rebuild a game from its code, length and decisions (used for saves and result codes). */
export function replay({ code, years, nickname = '', decisions }, opts = { analyse: true, bridge: true }) {
  let game = newGame({ code, years, nickname });
  for (const d of decisions) {
    if (game.status !== 'playing') break;
    game = playYear(game, d, opts);
  }
  return game;
}

/** Events a classroom host can reveal for narration. */
export function scenarioEvents(code, years) {
  return Array.from({ length: years }, (_, i) => ({ yearIndex: i + 1, fy: CONFIG.company.startFy + i + 1, ...eventsFor(code, i + 1) }));
}

/** The parts of a state the results screens need. */
function snapshot(st) {
  const v = st.valuation;
  return {
    fy: st.fy,
    statements: st.statements,
    cash: st.cash,
    debt: st.debt,
    emergencyDebt: st.emergencyDebt,
    shares: st.shares,
    riskFree: st.riskFree,
    valuation: {
      price: v.price,
      equityValue: v.equityValue,
      ev: v.ev,
      wacc: v.wacc,
      keEquity: v.keEquity,
      betaEquity: v.betaEquity,
      kd: v.kd,
      rating: v.rating,
      coverage: v.coverage,
      netDebt: v.netDebt,
    },
  };
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}
