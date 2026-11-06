/**
 * Report card: grades each decision area against the value-maximising benchmark computed
 * when the decision was made (so hindsight about events plays no part).
 * Grading rules are shown on the How it works page.
 */
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export const GRADING_RULES = Object.freeze({
  investment: 'Share of the best available risk-adjusted NPV you captured each year (A ≥ 90%, B ≥ 70%, C ≥ 50%, D ≥ 25%). Taking negative-NPV projects counts against you.',
  workingCapital: 'Average value per share lost against the best working-capital settings (A < 0.25%, B < 0.75%, C < 1.5%, D < 3%).',
  financing: 'Average value per share lost against the value-maximising debt level (A < 0.5%, B < 1.5%, C < 3%, D < 6%).',
  dividend: 'Dividend cuts of more than 20% and dividends paid in years that needed an emergency loan (A: none, B: one, C: two, D: three).',
});

function letterFromScore(score, cuts) {
  for (let i = 0; i < cuts.length; i += 1) if (score >= cuts[i]) return LETTERS[i];
  return 'E';
}
function letterFromLoss(loss, cuts) {
  for (let i = 0; i < cuts.length; i += 1) if (loss < cuts[i]) return LETTERS[i];
  return 'E';
}

const cr = (x) => `${x < 0 ? '−' : '+'}₹${Math.abs(x).toFixed(1)} cr`;
const rs = (x) => `₹${Math.abs(x).toFixed(2)}`;
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const article = (rating) => (/^A/.test(rating) ? 'an' : 'a');

const LEVER_TEXT = {
  creditDays: {
    label: 'Credit period',
    longer: 'the extra bad debts and receivables outweighed the extra sales',
    shorter: 'the sales you lost outweighed the bad debts and capital you saved',
  },
  inventoryDays: {
    label: 'Inventory level',
    longer: 'holding and financing the extra stock cost more than the stockouts it prevented',
    shorter: 'stockouts cost more sales than the inventory you saved',
  },
  payableDays: {
    label: 'Supplier payment period',
    longer: 'suppliers charged more for slow payment than the credit was worth',
    shorter: 'you paid suppliers sooner than you needed to, giving up free credit',
  },
};

export function gradeGame(game) {
  const years = game.history.filter((h) => h.analysis);
  const out = { investment: null, workingCapital: null, financing: null, dividend: null };
  if (years.length === 0) return out;

  // Investment
  const invFeedback = [];
  const invScores = years.map((h) => {
    const a = h.analysis;
    const byId = Object.fromEntries(a.projects.map((p) => [p.uid, p]));
    const chosen = h.decisions.accept.reduce((acc, id) => acc + byId[id].npvOwn, 0);
    const best = a.bestSet.npv;
    const fy = `FY${h.fy}`;
    for (const id of h.decisions.accept) {
      const p = byId[id];
      if (p.npvOwn < 0) {
        const trap = p.npvCompany > 0 ? ` At the company WACC (${pct(p.companyWacc)}) it looked like ${cr(p.npvCompany)}: the WACC trap.` : '';
        invFeedback.push({ fy, good: false, text: `You accepted ${p.name}. At its own risk-adjusted rate (${pct(p.ownWacc)}) its NPV was ${cr(p.npvOwn)}.${trap}` });
      }
    }
    for (const id of a.bestSet.ids) {
      if (!h.decisions.accept.includes(id)) {
        const p = byId[id];
        const reverse = p.npvCompany < 0 ? ` At the company WACC it looked negative (${cr(p.npvCompany)}), but its low risk deserved a lower rate.` : '';
        invFeedback.push({ fy, good: false, text: `You passed on ${p.name}: NPV ${cr(p.npvOwn)} at its own rate of ${pct(p.ownWacc)}.${reverse}` });
      }
    }
    if (h.offers.exclusive.length) {
      const [x, y] = h.offers.exclusive[0];
      const px = byId[x];
      const py = byId[y];
      const picked = h.decisions.accept.includes(x) ? px : h.decisions.accept.includes(y) ? py : null;
      const better = px.npvOwn > py.npvOwn ? px : py;
      if (picked && picked !== better && picked.irr != null && better.irr != null && picked.irr > better.irr) {
        invFeedback.push({ fy, good: false, text: `You chose ${picked.name} for its higher IRR (${pct(picked.irr)}), but ${better.name} had the larger NPV (${cr(better.npvOwn)} against ${cr(picked.npvOwn)}). For mutually exclusive projects, rank by NPV.` });
      }
    }
    if (best <= 1e-9) return chosen >= -1e-9 ? 1 : 0;
    const score = Math.max(-1, Math.min(1, chosen / best));
    if (score >= 0.999) invFeedback.push({ fy, good: true, text: `You captured all the value on offer: ${cr(best)} of NPV.` });
    return score;
  });
  const invScore = invScores.reduce((a, x) => a + x, 0) / invScores.length;
  out.investment = { letter: letterFromScore(invScore, [0.9, 0.7, 0.5, 0.25]), score: invScore, summary: `You captured ${Math.round(invScore * 100)}% of the risk-adjusted NPV available.`, feedback: invFeedback };

  // Working capital
  const wcFeedback = [];
  const wcLosses = years.map((h) => {
    const a = h.analysis;
    const loss = Math.max(0, (a.bestWc.price - a.chosenPrice) / a.bestWc.price);
    for (const [key, eff] of Object.entries(a.levers)) {
      if (eff.best !== eff.chosen && eff.gainPerShare > 0.05) {
        const t = LEVER_TEXT[key];
        const why = eff.chosen > eff.best ? t.longer : t.shorter;
        wcFeedback.push({ fy: `FY${h.fy}`, good: false, text: `${t.label} of ${eff.chosen} days cost about ${rs(eff.gainPerShare)} a share; ${eff.best} days was better: ${why}.` });
      }
    }
    return loss;
  });
  const wcLoss = wcLosses.reduce((a, x) => a + x, 0) / wcLosses.length;
  if (wcFeedback.length === 0) wcFeedback.push({ fy: '', good: true, text: 'Your credit, inventory and supplier terms were at or near their value-maximising settings every year.' });
  out.workingCapital = { letter: letterFromLoss(wcLoss, [0.0025, 0.0075, 0.015, 0.03]), score: 1 - wcLoss, summary: `On average you gave up ${pct(wcLoss)} of value per share on working capital.`, feedback: wcFeedback };

  // Financing
  const finFeedback = [];
  const finLosses = years.map((h) => {
    const a = h.analysis;
    const loss = Math.max(0, (a.bestDebt.price - a.chosenPrice) / a.bestDebt.price);
    const fy = `FY${h.fy}`;
    const chosenChange = h.decisions.financing.debtChange;
    const gap = a.bestDebt.debtChange - chosenChange;
    if (loss > 0.003) {
      if (gap > 0) {
        finFeedback.push({ fy, good: false, text: `Borrowing about ₹${gap.toFixed(0)} cr more (to ${article(a.bestDebt.rating)} ${a.bestDebt.rating} rating) would have added about ${rs(a.bestDebt.price - a.chosenPrice)} a share through interest tax shields.` });
      } else {
        finFeedback.push({ fy, good: false, text: `About ₹${(-gap).toFixed(0)} cr less debt would have been worth ${rs(a.bestDebt.price - a.chosenPrice)} a share: beyond ${article(a.bestDebt.rating)} ${a.bestDebt.rating} rating, a higher cost of debt and expected distress costs outweigh the tax shield.` });
      }
    }
    if (h.decisions.financing.equityIssue > 0) {
      finFeedback.push({ fy, good: false, text: `Your ₹${h.decisions.financing.equityIssue.toFixed(0)} cr share issue paid a 5% discount, 3% flotation costs and a 2% announcement drop. Debt or retained cash is usually cheaper unless leverage is already high.` });
    }
    if (h.report.emergencyLoan > 0.5) {
      finFeedback.push({ fy, good: false, text: `Cash ran below your buffer, so the company took an emergency loan of ₹${h.report.emergencyLoan.toFixed(1)} cr at the normal rate plus 4 points. Plan funding for projects in advance.` });
    }
    return loss;
  });
  const finLoss = finLosses.reduce((a, x) => a + x, 0) / finLosses.length;
  if (finFeedback.length === 0) finFeedback.push({ fy: '', good: true, text: 'Your borrowing kept the company close to its value-maximising capital structure.' });
  out.financing = { letter: letterFromLoss(finLoss, [0.005, 0.015, 0.03, 0.06]), score: 1 - finLoss, summary: `On average you gave up ${pct(finLoss)} of value per share on financing.`, feedback: finFeedback };

  // Dividend
  const divFeedback = [];
  let strikes = 0;
  game.history.forEach((h) => {
    const fy = `FY${h.fy}`;
    if (h.report.dividendCut) {
      strikes += 1;
      divFeedback.push({ fy, good: false, text: 'You cut the dividend per share by more than 20%. Markets read cuts as bad news about the future (a 3% price drop in this game).' });
    }
    if (h.report.emergencyLoan > 0.5 && h.dps > 0) {
      strikes += 1;
      divFeedback.push({ fy, good: false, text: `You paid ₹${(h.dps * game.state.shares).toFixed(1)} cr of dividends in a year that needed an emergency loan at a premium rate.` });
    }
  });
  if (divFeedback.length === 0) divFeedback.push({ fy: '', good: true, text: 'Your dividends were steady and never forced emergency borrowing.' });
  out.dividend = { letter: LETTERS[Math.min(4, strikes)], score: 1 - strikes / 4, summary: strikes === 0 ? 'A steady, affordable dividend.' : `${strikes} dividend misstep${strikes > 1 ? 's' : ''}.`, feedback: divFeedback };
  return out;
}
