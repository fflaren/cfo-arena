// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/finance.js';
import { CONFIG } from '../src/engine/config.js';
import * as M from '../src/engine/model.js';
import { offersFor } from '../src/engine/projects.js';
import { eventsFor } from '../src/engine/events.js';
import { simulateYear, defaultDecisions, validateDecisions, previewValue } from '../src/engine/simulate.js';
import { analyseProjects } from '../src/engine/analysis.js';
import { newGame, playYear, summary, replay, valueBridge } from '../src/engine/game.js';
import { BOTS, playBot, runValidation } from '../src/engine/bots.js';
import { encodeResult, decodeResult, normaliseCode, randomCode } from '../src/engine/codec.js';
import { streamFor } from '../src/engine/rng.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);

test('seeded streams are reproducible and independent', () => {
  const a = streamFor('ABC234', 'events', 1);
  const b = streamFor('ABC234', 'events', 1);
  for (let i = 0; i < 20; i += 1) assert.equal(a.next(), b.next());
  const c = streamFor('ABC234', 'events', 2);
  assert.notEqual(streamFor('ABC234', 'events', 1).next(), c.next());
});

test('opening position: balance sheet balances, valuation converges near INR 100', () => {
  const s = M.openingState();
  close(s.statements.balance.difference, 0, 1e-9);
  assert.ok(s.valuation.converged);
  assert.ok(s.valuation.price > 90 && s.valuation.price < 115, `price ${s.valuation.price}`);
  assert.ok(s.valuation.wacc > CONFIG.market.riskFree);
  // Hamada consistency with the finance library
  close(s.valuation.betaL, F.leverBeta(CONFIG.company.unleveredBeta, CONFIG.market.taxRate, s.valuation.debtToEquity), 1e-12);
});

test('valuation responds in the right direction', () => {
  const s = M.openingState();
  const higherRf = M.valueCompany({ ...s, riskFree: s.riskFree + 0.01 });
  assert.ok(higherRf.price < s.valuation.price, 'a higher risk-free rate lowers the price');
  const offers = { projects: [], exclusive: [], budget: null };
  const d = defaultDecisions(s);
  const heavy = previewValue(s, offers, { ...d, financing: { debtChange: 900, equityIssue: 0 } });
  assert.ok(heavy.price < s.valuation.price, 'very heavy borrowing destroys value through distress costs');
  assert.ok(F.ratingRank(heavy.rating) > F.ratingRank(s.valuation.rating));
});

test('events depend only on the scenario code, not on decisions', () => {
  const e1 = eventsFor('QWERTY'.replace('W', 'X'), 2);
  const e2 = eventsFor('QXERTY', 2);
  assert.deepEqual(e1.events.map((e) => e.id), e2.events.map((e) => e.id));
  assert.equal(e1.noise, e2.noise);
});

test('same code and decisions give identical games', () => {
  const g1 = playBot('textbook', 'SAME22', 3);
  const g2 = playBot('textbook', 'SAME22', 3);
  assert.equal(g1.state.valuation.price, g2.state.valuation.price);
  assert.deepEqual(summary(g1), summary(g2));
});

test('statements balance and cash reconciles every year for every bot', () => {
  for (const key of Object.keys(BOTS)) {
    const g = playBot(key, `BAL${key.length}A`.slice(0, 6), 5);
    // replay year by year to inspect each state
    let game = newGame({ code: g.code, years: 5 });
    for (const h of g.history) {
      game = playYear(game, h.decisions, { analyse: false, bridge: false });
      const st = game.state.statements;
      close(st.balance.difference, 0, 1e-6);
      close(st.cashFlow.check, 0, 1e-6);
      assert.ok(Number.isFinite(game.state.valuation.price));
    }
  }
});

test('project menus carry the teaching traps at opening rates, for many scenarios', () => {
  const s = M.openingState();
  for (const code of ['AAAAAA', 'B2C3D4', 'ZZZZZZ', 'HJKMNP', 'QRSTUV', 'WXY234']) {
    const y1 = analyseProjects(s, offersFor(code, 1));
    const thunder = y1.find((a) => a.uid.endsWith('thunder'));
    assert.ok(thunder.npvCompany > 0 && thunder.npvOwn < 0, 'WACC trap: positive at company WACC, negative at own rate');
    const solar = y1.find((a) => a.uid.endsWith('solar'));
    assert.ok(solar.npvCompany < 0 && solar.npvOwn > 0, 'Reverse trap: negative at company WACC, positive at own rate');
    const y2 = analyseProjects(s, offersFor(code, 2));
    const compact = y2.find((a) => a.uid.endsWith('compactLine'));
    const high = y2.find((a) => a.uid.endsWith('highSpeedLine'));
    assert.ok(compact.irr > high.irr && high.npvOwn > compact.npvOwn && compact.npvOwn > 0, 'IRR and NPV rank the exclusive pair differently');
    const y4 = analyseProjects(s, offersFor(code, 4));
    const acq = y4.find((a) => a.uid.endsWith('acquisition'));
    assert.ok(acq.npvCompany > 0 && acq.npvOwn < 0, 'Acquisition is a WACC trap');
    const o3 = offersFor(code, 3);
    assert.ok(o3.budget < o3.projects.reduce((a, p) => a + p.cost, 0), 'Year 3 is capital-rationed');
  }
});

test('validation rejects infeasible decisions with reasons', () => {
  const s = M.openingState();
  const offers = offersFor('VALID2', 2);
  const d = defaultDecisions(s);
  const both = { ...d, accept: offers.exclusive[0] };
  assert.equal(validateDecisions(s, offers, both).ok, false);
  const tooMuchDebt = { ...d, financing: { debtChange: 5000, equityIssue: 0 } };
  const res = validateDecisions(s, offers, tooMuchDebt);
  assert.equal(res.ok, false);
  assert.match(res.errors[0].message, /EBITDA/);
});

test('value bridge components sum exactly to the change in value per share', () => {
  for (const code of ['BRIDGE', 'BR2DGE', 'BR3DGE']) {
    let game = newGame({ code, years: 3 });
    while (game.status === 'playing') {
      const d = BOTS.textbook.decide(game);
      const prev = game.state;
      const offers = offersFor(code, game.history.length + 1);
      const bridge = valueBridge(prev, offers, d, code, game.history.length + 1);
      game = playYear(game, d, { analyse: false, bridge: false });
      const total = bridge.components.reduce((a, c) => a + c.value, 0);
      close(total, game.state.valuation.price + game.state.statements.income.dps - prev.valuation.price, 1e-9);
    }
  }
});

test('a company that runs out of cash and borrowing capacity goes bankrupt', () => {
  const s = M.openingState();
  const broke = { ...s, cash: -900, lastEbitda: 0, valuation: { ...s.valuation } };
  const d = defaultDecisions(broke);
  const { state } = simulateYear(broke, { projects: [], exclusive: [], budget: null }, d, 'BROKE1', 1);
  assert.equal(state.bankrupt, true);
  assert.equal(state.valuation.price, 0);
});

test('codes: normalise, random and result codes round-trip and replay to the same score', () => {
  assert.equal(normaliseCode(' abc-234 '), 'ABC234');
  assert.equal(normaliseCode('ABCDE'), null);
  assert.equal(normaliseCode('ABCDE0'), null); // 0 is not in the alphabet
  assert.ok(normaliseCode(randomCode()));
  const g = playBot('waccTrap', 'RESUMT', 3);
  const code = encodeResult({ code: g.code, years: g.years, nickname: 'Asha', decisions: g.history.map((h) => h.decisions) });
  const decoded = decodeResult(code);
  assert.equal(decoded.nickname, 'Asha');
  const r = replay(decoded, { analyse: false, bridge: false });
  close(summary(r).alpha, summary(g).alpha, 1e-12);
  assert.throws(() => decodeResult('nonsense'));
});

test('model validation: the Textbook CFO earns the highest risk-adjusted excess return', () => {
  const r = runValidation({ seeds: 30, years: 5, prefix: 'TST' });
  assert.equal(r.rows[0].key, 'textbook', `ranking: ${r.rows.map((x) => x.key).join(' > ')}`);
  const mean = Object.fromEntries(r.rows.map((x) => [x.key, x.mean]));
  assert.ok(mean.empire < mean.textbook);
  assert.ok(mean.waccTrap < mean.textbook);
  assert.ok(mean.leverage < mean.textbook);
  assert.ok(mean.hoarder < mean.textbook);
  assert.ok(mean.handsOff < mean.textbook);
});
