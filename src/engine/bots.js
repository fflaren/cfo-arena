/**
 * Bot strategies and model validation.
 * If the game is built right, sound corporate finance should win on average.
 */
import * as M from './model.js';
import { newGame, playYear, currentOffers, summary } from './game.js';
import { analyseProjects, bestProjectSet, bestWorkingCapital, bestDebt, feasibleSets } from './analysis.js';
import { debtCapacity } from './simulate.js';

const PAYOUT = 0.3;

function baseDecision(game, accept) {
  const s = game.state;
  return {
    wc: { ...s.policy, cashBufferPct: 0.05 },
    accept,
    financing: { debtChange: 0, equityIssue: 0 },
    payoutRatio: PAYOUT,
  };
}

/** Best working capital, then value-maximising debt, given a project set. */
function optimiseRest(game, offers, d) {
  const s = game.state;
  const wc = bestWorkingCapital(s, offers, d).wc;
  const withWc = { ...d, wc };
  const fin = bestDebt(s, offers, withWc);
  return { ...withWc, financing: { ...withWc.financing, debtChange: fin.debtChange } };
}

export const BOTS = Object.freeze({
  textbook: {
    name: 'Textbook CFO',
    description: 'Takes projects with positive NPV at their own risk-adjusted rate, keeps working capital and leverage at value-maximising levels, pays a steady 30% of profit.',
    decide(game) {
      const offers = currentOffers(game);
      const a = analyseProjects(game.state, offers);
      return optimiseRest(game, offers, baseDecision(game, bestProjectSet(offers, a).ids));
    },
  },
  empire: {
    name: 'Empire builder',
    description: 'Takes the biggest feasible set of projects every year, whatever the NPV. Otherwise plays like the Textbook CFO.',
    decide(game) {
      const offers = currentOffers(game);
      const costOf = (ids) => offers.projects.filter((p) => ids.includes(p.uid)).reduce((a, p) => a + p.cost, 0);
      const biggest = feasibleSets(offers).reduce((best, ids) => (costOf(ids) > costOf(best) ? ids : best), []);
      return optimiseRest(game, offers, baseDecision(game, biggest));
    },
  },
  waccTrap: {
    name: 'WACC trap',
    description: 'Judges every project at the company WACC instead of its own risk-adjusted rate. Otherwise plays like the Textbook CFO.',
    decide(game) {
      const offers = currentOffers(game);
      const a = analyseProjects(game.state, offers);
      return optimiseRest(game, offers, baseDecision(game, bestProjectSet(offers, a, 'npvCompany').ids));
    },
  },
  leverage: {
    name: 'Leverage junkie',
    description: 'Picks projects like the Textbook CFO but borrows up to the lenders’ limit every year.',
    decide(game) {
      const offers = currentOffers(game);
      const s = game.state;
      const a = analyseProjects(s, offers);
      const d = baseDecision(game, bestProjectSet(offers, a).ids);
      d.wc = bestWorkingCapital(s, offers, d).wc;
      d.financing.debtChange = Math.max(0, Math.floor(debtCapacity(s) - M.totalDebt(s)));
      return d;
    },
  },
  handsOff: {
    name: 'Hands-off CFO',
    description: 'Changes nothing: keeps the FY26 policies, debt and 30% payout, and takes no projects. The benchmark for doing nothing.',
    decide(game) {
      const s = game.state;
      return { wc: { ...s.policy }, accept: [], financing: { debtChange: 0, equityIssue: 0 }, payoutRatio: s.payoutRatio };
    },
  },
  hoarder: {
    name: 'Hoarder',
    description: 'Takes no projects, repays all the debt it can, keeps a 20% cash buffer and pays no dividend.',
    decide(game) {
      const s = game.state;
      const offers = currentOffers(game);
      const d = baseDecision(game, []);
      d.wc = { ...bestWorkingCapital(s, offers, d).wc, cashBufferPct: 0.2 };
      d.financing.debtChange = -Math.min(M.totalDebt(s), Math.max(0, s.cash));
      d.payoutRatio = 0;
      return d;
    },
  },
});

/** Play a whole game with one bot. */
export function playBot(botKey, code, years, opts = { analyse: false, bridge: false }) {
  let game = newGame({ code, years });
  while (game.status === 'playing') {
    game = playYear(game, BOTS[botKey].decide(game), opts);
  }
  return game;
}

function mean(xs) {
  return xs.reduce((a, x) => a + x, 0) / xs.length;
}
function sd(xs) {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
}
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Run every bot on the same scenarios.
 * Score: risk-adjusted excess return (alpha) over the company's cost of equity.
 * Luck share: two-way decomposition of the score's variance across (bot, scenario) cells.
 * SS_scenario / SS_total is the share explained by the scenario (luck); SS_bot / SS_total is
 * the share explained by strategy (skill); the rest is the interaction between them.
 */
export function runValidation({ seeds = 50, years = 5, prefix = 'VAL', onProgress } = {}) {
  const run = startRun(seeds, years, prefix);
  for (let i = 0; i < seeds; i += 1) {
    run.step(i);
    if (onProgress) onProgress((i + 1) / seeds);
  }
  return run.finish();
}

/** Same as runValidation, but yields to the browser between scenarios so the page stays responsive. */
export async function runValidationAsync({ seeds = 50, years = 5, prefix = 'VAL', onProgress } = {}) {
  const run = startRun(seeds, years, prefix);
  for (let i = 0; i < seeds; i += 1) {
    run.step(i);
    if (onProgress) onProgress((i + 1) / seeds);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return run.finish();
}

function startRun(seeds, years, prefix) {
  const keys = Object.keys(BOTS);
  const codes = Array.from({ length: seeds }, (_, i) => `${prefix}${i}`);
  const alpha = Object.fromEntries(keys.map((k) => [k, []]));
  const rawTsr = Object.fromEntries(keys.map((k) => [k, []]));
  const bankrupt = Object.fromEntries(keys.map((k) => [k, 0]));
  return {
    step(i) {
      for (const k of keys) {
        const sm = summary(playBot(k, codes[i], years));
        alpha[k].push(sm.alpha);
        rawTsr[k].push(sm.tsr);
        if (sm.bankrupt) bankrupt[k] += 1;
      }
    },
    finish() {
      const all = keys.flatMap((k) => alpha[k]);
      const grand = mean(all);
      const ssTotal = all.reduce((a, x) => a + (x - grand) ** 2, 0);
      const seedMeans = codes.map((_, i) => mean(keys.map((k) => alpha[k][i])));
      const ssSeed = keys.length * seedMeans.reduce((a, m) => a + (m - grand) ** 2, 0);
      const ssBot = seeds * keys.reduce((a, k) => a + (mean(alpha[k]) - grand) ** 2, 0);
      const rows = keys
        .map((k) => ({
          key: k,
          name: BOTS[k].name,
          description: BOTS[k].description,
          mean: mean(alpha[k]),
          median: median(alpha[k]),
          sd: sd(alpha[k]),
          meanTsr: mean(rawTsr[k]),
          bankruptRate: bankrupt[k] / seeds,
        }))
        .sort((a, b) => b.mean - a.mean);
      // Paired comparison: how often the Textbook CFO beats each other bot on the same scenario.
      const winRate = Object.fromEntries(
        keys.filter((k) => k !== 'textbook').map((k) => [k, alpha.textbook.filter((x, i) => x > alpha[k][i] + 1e-12).length / seeds]),
      );
      return {
        seeds,
        years,
        rows,
        winRate,
        luckShare: ssTotal > 0 ? ssSeed / ssTotal : 0,
        skillShare: ssTotal > 0 ? ssBot / ssTotal : 0,
        // Among players facing the same scenario (as in classroom mode), the share of score
        // differences explained by strategy rather than by project-level noise.
        skillShareWithinScenario: ssTotal - ssSeed > 0 ? ssBot / (ssTotal - ssSeed) : 0,
        alpha,
        tsr: rawTsr,
      };
    },
  };
}
