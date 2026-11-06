// Run with: node --test
// Every expected value below is worked by hand in the comment beside it,
// so it can be checked with a calculator or Excel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/finance.js';

const close = (actual, expected, tol = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

test('pvLump and fvLump', () => {
  // 1,000 received in 3 years at 10%: 1000 / 1.1^3 = 1000 / 1.331 = 751.3148
  close(F.pvLump(1000, 0.1, 3), 751.3148009, 1e-6);
  // 751.3148 invested 3 years at 10% grows back to 1000
  close(F.fvLump(751.3148009, 0.1, 3), 1000, 1e-6);
  close(F.pvLump(500, 0, 7), 500);
});

test('annuities: ordinary and due', () => {
  // PV of 100 a year for 5 years at 8%: 100 x (1 - 1.08^-5)/0.08 = 100 x 3.99271 = 399.271
  close(F.pvAnnuity(100, 0.08, 5), 399.2710037, 1e-6);
  // Annuity due = ordinary x 1.08 = 431.2127
  close(F.pvAnnuity(100, 0.08, 5, true), 399.2710037 * 1.08, 1e-6);
  // FV of 100 a year for 5 years at 8%: 100 x (1.08^5 - 1)/0.08 = 586.6601
  close(F.fvAnnuity(100, 0.08, 5), 586.660096, 1e-6);
  // Zero rate: simply payment x n
  close(F.pvAnnuity(100, 0, 5), 500);
});

test('perpetuities', () => {
  // 50 a year for ever at 10% = 500
  close(F.pvPerpetuity(50, 0.1), 500);
  // 50 next year growing 4% at 10%: 50 / 0.06 = 833.33
  close(F.pvGrowingPerpetuity(50, 0.1, 0.04), 833.3333333, 1e-6);
  assert.throws(() => F.pvGrowingPerpetuity(50, 0.04, 0.05), F.FinanceError);
});

test('EMI and effective annual rate', () => {
  // 10,00,000 at 9% for 5 years monthly: r = 0.0075, n = 60
  // EMI = P r (1+r)^n / ((1+r)^n - 1) = 20,758.36
  close(F.emi(1_000_000, 0.09, 5), 20758.35523, 1e-4);
  // 12% compounded monthly: 1.01^12 - 1 = 12.6825%
  close(F.effectiveAnnualRate(0.12, 12), 0.1268250301, 1e-9);
});

test('NPV, IRR, MIRR, PI, payback (textbook check: project appraisal)', () => {
  const cfs = [-1000, 300, 400, 500, 200];
  // NPV at 10%: -1000 + 300/1.1 + 400/1.21 + 500/1.331 + 200/1.4641
  //           = -1000 + 272.727 + 330.579 + 375.657 + 136.603 = 115.566
  close(F.npv(0.1, cfs), 115.5658766, 1e-6);
  // IRR is the rate that makes NPV zero: 15.3221%
  const r = F.irr(cfs);
  assert.equal(r.status, 'ok');
  close(r.value, 0.1532213788, 1e-7);
  close(F.npv(r.value, cfs), 0, 1e-6);
  // MIRR (finance 10%, reinvest 12%): FV of inflows at year 4
  //   = 300x1.12^3 + 400x1.12^2 + 500x1.12 + 200 = 421.478 + 501.76 + 560 + 200 = 1683.238
  //   MIRR = (1683.238 / 1000)^(1/4) - 1 = 13.903%
  close(F.mirr(cfs, 0.1, 0.12), 0.1390332647, 1e-8);
  // PI = PV of inflows / investment = 1115.566 / 1000
  close(F.profitabilityIndex(0.1, cfs), 1.1155658766, 1e-8);
  // Payback: cumulative -700, -300, +200 -> 2 + 300/500 = 2.6 years
  close(F.payback(cfs), 2.6);
  // Discounted payback at 10%: cumulative -727.27, -396.69, -21.04, +115.57
  //   -> 3 + 21.036/136.603 = 3.154 years
  close(F.discountedPayback(0.1, cfs), 3 + 21.03681 / 136.60269, 1e-4);
});

test('IRR edge cases never crash', () => {
  assert.equal(F.irr([100, 50, 20]).status, 'none');
  // Classic multiple-IRR flows: -100, +230, -132 have IRRs of 10% and 20%
  const m = F.irr([-100, 230, -132]);
  assert.equal(m.status, 'multiple');
  close(m.values[0], 0.1, 1e-6);
  close(m.values[1], 0.2, 1e-6);
  assert.equal(F.payback([-100, 10, 10]), null);
});

test('crossover rate between two projects', () => {
  // A: -100, 0, 140 ; B: -100, 120, 0. A - B = 0, -120, 140 -> IRR = 140/120 - 1 = 16.667%
  const x = F.crossoverRate([-100, 0, 140], [-100, 120, 0]);
  assert.equal(x.status, 'ok');
  close(x.value, 140 / 120 - 1, 1e-7);
});

test('capital rationing: PI ranking vs best combination', () => {
  // Budget 100. A cost 60 NPV 30 (PI 1.5), B cost 50 NPV 24 (PI 1.48), C cost 40 NPV 18 (PI 1.45)
  // PI ranking takes A, then B does not fit, then C fits: NPV 48.
  // Best combination is also A + C = 48 (B + C = 42).
  const res = F.rationCapital(
    [
      { id: 'A', cost: 60, npv: 30 },
      { id: 'B', cost: 50, npv: 24 },
      { id: 'C', cost: 40, npv: 18 },
    ],
    100,
  );
  assert.deepEqual(res.piChoice, ['A', 'C']);
  close(res.best.npv, 48);
  // A case where the PI rule is not optimal (indivisible projects): budget 100,
  // X cost 52 NPV 26 (PI 1.50), Y cost 50 NPV 24 (PI 1.48), Z cost 50 NPV 23.5 (PI 1.47).
  // PI picks X first; then neither Y nor Z fits (102 > 100): total NPV 26.
  // Best is Y + Z = 47.5 for exactly 100.
  const res2 = F.rationCapital(
    [
      { id: 'X', cost: 52, npv: 26 },
      { id: 'Y', cost: 50, npv: 24 },
      { id: 'Z', cost: 50, npv: 23.5 },
    ],
    100,
  );
  assert.deepEqual(res2.piChoice, ['X']);
  assert.deepEqual(res2.best.ids.sort(), ['Y', 'Z']);
  close(res2.best.npv, 47.5);
});

test('leverage: DOL, DFL, DCL, EPS, indifference (textbook check)', () => {
  // Sales 1000, variable costs 620, fixed 220 -> contribution 380, EBIT 160
  // DOL = 380 / 160 = 2.375
  close(F.dol(1000, 620, 220), 2.375);
  // Interest 40 -> DFL = 160 / 120 = 1.3333
  close(F.dfl(160, 40), 160 / 120);
  // DCL = 2.375 x 1.3333 = 3.1667
  close(F.dcl(1000, 620, 220, 40), 2.375 * (160 / 120));
  // EPS = (160 - 40) x (1 - 0.25) / 10 = 9
  close(F.eps(160, 40, 0.25, 10), 9);
  // Plan A: interest 0, 20 shares; Plan B: interest 30, 10 shares.
  // (E - 0)/20 = (E - 30)/10 -> E = 60
  close(F.ebitEpsIndifference({ interest: 0, shares: 20 }, { interest: 30, shares: 10 }), 60);
});

test('working capital days and cycles', () => {
  // Receivables 82.19 on revenue 1000 -> 30 days; inventory 76.44 on COGS 620 -> 45 days
  close(F.dso(1000 * 30 / 365, 1000), 30);
  close(F.dio(620 * 45 / 365, 620), 45);
  close(F.dpo(620 * 40 / 365, 620), 40);
  assert.equal(F.operatingCycle(45, 30), 75);
  assert.equal(F.cashConversionCycle(45, 30, 40), 35);
  const wc = F.workingCapitalFromDays({ revenue: 1000, cogs: 620, dsoDays: 30, dioDays: 45, dpoDays: 40 });
  // 82.192 + 76.438 - 67.945 = 90.685
  close(wc.netWorkingCapital, 1000 * 30 / 365 + 620 * 45 / 365 - 620 * 40 / 365);
});

test('cost of capital: CAPM, Hamada, WACC (textbook check)', () => {
  // Unlevered beta 0.8, tax 25%, D/E 0.5: beta_L = 0.8 x (1 + 0.75 x 0.5) = 1.1
  close(F.leverBeta(0.8, 0.25, 0.5), 1.1);
  close(F.unleverBeta(1.1, 0.25, 0.5), 0.8);
  // Ke = 7% + 1.1 x 7% = 14.7%
  close(F.capm(0.07, 1.1, 0.07), 0.147);
  // E = 200, D = 100, Kd = 9%, t = 25%: WACC = 2/3 x 14.7% + 1/3 x 9% x 0.75 = 12.05%
  close(
    F.wacc({ equityValue: 200, debtValue: 100, costOfEquity: 0.147, preTaxCostOfDebt: 0.09, taxRate: 0.25 }),
    0.1205,
    1e-9,
  );
  close(F.afterTaxCostOfDebt(0.09, 0.25), 0.0675);
});

test('bonds: price, YTM, current yield, duration (textbook check)', () => {
  // 5-year, 8% annual coupon, face 100, YTM 10%:
  // 8 x [1 - 1.1^-5]/0.1 + 100/1.1^5 = 30.326 + 62.092 = 92.418
  const p = F.bondPrice({ face: 100, couponRate: 0.08, ytm: 0.1, years: 5 });
  close(p, 92.41842646, 1e-7);
  close(F.bondYtm({ price: p, face: 100, couponRate: 0.08, years: 5 }), 0.1, 1e-9);
  close(F.currentYield({ price: p, couponRate: 0.08 }), 8 / p);
  // Macaulay duration = sum(t x PV(CF_t)) / price = 4.2814 years; modified = 4.2814 / 1.1 = 3.8922
  close(F.macaulayDuration({ couponRate: 0.08, ytm: 0.1, years: 5 }), 4.281412086, 1e-8);
  close(F.modifiedDuration({ couponRate: 0.08, ytm: 0.1, years: 5 }), 3.892192805, 1e-8);
  // Semi-annual: 10 years, 7% coupon, 6% YTM -> 20 periods of 3.5 at 3% + 100/1.03^20 = 107.4387
  close(F.bondPrice({ couponRate: 0.07, ytm: 0.06, years: 10, frequency: 2 }), 107.4387374, 1e-6);
  // Par bond: coupon = yield -> price = face
  close(F.bondPrice({ couponRate: 0.09, ytm: 0.09, years: 7 }), 100, 1e-9);
});

test('equity valuation: Gordon, two-stage, implied growth and P/E (textbook check)', () => {
  // D1 = 2.10, r = 12%, g = 5%: P0 = 2.10 / 0.07 = 30
  close(F.gordonPrice(2.1, 0.12, 0.05), 30);
  assert.throws(() => F.gordonPrice(2, 0.05, 0.05), F.FinanceError);
  // Two-stage: D0 = 2, 15% for 3 years, then 5%, r = 12%
  // D1..D3 = 2.30, 2.645, 3.04175; PV = 2.0536 + 2.1086 + 2.1651 = 6.3273
  // TV at year 3 = 3.04175 x 1.05 / 0.07 = 45.62625; PV = 45.62625 / 1.12^3 = 32.4758
  // Price = 38.8031
  const ts = F.twoStageDdm({ d0: 2, gHigh: 0.15, nHigh: 3, gStable: 0.05, requiredReturn: 0.12 });
  close(ts.price, 38.80307034, 1e-7);
  close(ts.terminalValue, 45.62625, 1e-9);
  // Implied growth from P = 30, D1 = 2.10, r = 12%: 12% - 7% = 5%
  close(F.impliedGrowth(30, 2.1, 0.12), 0.05);
  // Payout 40%, r 12%, g 5%: leading P/E = 0.4 / 0.07 = 5.714; trailing = 5.714 x 1.05 = 6.0
  const pe = F.impliedPe(0.4, 0.12, 0.05);
  close(pe.leading, 0.4 / 0.07);
  close(pe.trailing, 6);
});

test('synthetic rating follows the Damodaran table (Jan 2026)', () => {
  assert.equal(F.syntheticRating(10).rating, 'AAA');
  assert.equal(F.syntheticRating(5).rating, 'A');
  assert.equal(F.syntheticRating(4.25).rating, 'A-'); // boundary: needs > 4.25 for A
  assert.equal(F.syntheticRating(1.6).rating, 'B');
  close(F.syntheticRating(1.6).spread, 0.0321);
  assert.equal(F.syntheticRating(0.1).rating, 'D');
  assert.equal(F.syntheticRating(-3).rating, 'D');
  assert.equal(F.syntheticRating(Infinity).rating, 'AAA');
  assert.ok(F.ratingRank('AAA') < F.ratingRank('BBB'));
});

test('invalid inputs throw FinanceError, never NaN', () => {
  assert.throws(() => F.npv(0.1, [100]), F.FinanceError);
  assert.throws(() => F.wacc({ equityValue: 0, debtValue: 10, costOfEquity: 0.1, preTaxCostOfDebt: 0.08, taxRate: 0.25 }), F.FinanceError);
  assert.throws(() => F.dol(100, 60, 40), F.FinanceError);
  assert.throws(() => F.pvLump(Number.NaN, 0.1, 2), F.FinanceError);
});
