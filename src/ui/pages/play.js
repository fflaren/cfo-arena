/**
 * The game: setup, the four decision screens, review, results and the final debrief.
 * A game is saved as { code, years, nickname, decisions, draft } and rebuilt by replay.
 */
import { h, mount, debounce, copyText, toast } from '../dom.js';
import { icon } from '../icons.js';
import { button, callout, delta, kpi, numberField, pageHeader, ratingBadge, rangeField, segmented, sectionHead, statements } from '../components.js';
import { crore, num, pct, rupees, signedCrore, signedPct, signedRupees, times } from '../format.js';
import { lineChart, waterfallChart, barChart, xyChart, dataTable } from '../charts.js';
import { loadGame, saveGame, clearGame } from '../store.js';
import { CONFIG } from '../../engine/config.js';
import * as M from '../../engine/model.js';
import { newGame, playYear, replay, summary, currentOffers } from '../../engine/game.js';
import { WC_OPTIONS, defaultDecisions, previewValue, validateDecisions, debtCapacity } from '../../engine/simulate.js';
import { analyseProjects } from '../../engine/analysis.js';
import { PROJECT_TEMPLATES } from '../../engine/projects.js';
import { gradeGame, GRADING_RULES } from '../../engine/grading.js';
import { playBot } from '../../engine/bots.js';
import { encodeResult, normaliseCode, randomCode } from '../../engine/codec.js';

const STEPS = [
  { id: 'brief', label: 'Briefing' },
  { id: 'wc', label: 'Working capital' },
  { id: 'invest', label: 'Investment' },
  { id: 'finance', label: 'Financing' },
  { id: 'dividend', label: 'Dividend' },
  { id: 'review', label: 'Review' },
];

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

let session = null;

function getSession() {
  if (session) return session;
  const save = loadGame();
  if (!save) return null;
  try {
    const game = replay(save);
    session = { save, game, cache: {} };
    ensureDraft();
    return session;
  } catch (err) {
    console.error('Could not restore saved game', err);
    clearGame();
    return null;
  }
}

/** Start a fresh game (used by the setup screen and by classroom joins). */
export function beginGame(opts) {
  startGame(opts);
}

function startGame({ code, years, nickname }) {
  const game = newGame({ code, years, nickname });
  session = { save: { code, years, nickname, decisions: [], draft: null }, game, cache: {} };
  ensureDraft();
  persist();
}

function ensureDraft() {
  if (!session || session.game.status !== 'playing') return;
  const yearIndex = session.game.history.length + 1;
  if (!session.save.draft || session.save.draftYear !== yearIndex) {
    session.save.draft = defaultDecisions(session.game.state);
    session.save.draftYear = yearIndex;
    session.cache = {};
  }
}

function persist() {
  if (session) saveGame(session.save);
}

const persistSoon = debounce(persist, 300);

function offers() {
  if (!session.cache.offers) session.cache.offers = currentOffers(session.game);
  return session.cache.offers;
}

function projectAnalysis() {
  if (!session.cache.analysis) session.cache.analysis = analyseProjects(session.game.state, offers());
  return session.cache.analysis;
}

/* ------------------------------------------------------------------ */
/* Router entry                                                        */
/* ------------------------------------------------------------------ */

export function renderPlay({ sub, params, navigate }) {
  const page = sub[0] ?? '';
  if (page === 'new') return renderNew(params, navigate);
  const s = getSession();
  if (!s) return renderSetup(navigate);
  if (page === 'results') return renderResults(params, navigate);
  if (page === 'debrief' || s.game.status !== 'playing') {
    if (page === 'results') return renderResults(params, navigate);
    return renderDebrief(navigate);
  }
  const step = STEPS.find((x) => x.id === page) ?? STEPS[0];
  return renderStep(step.id, navigate);
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

function renderSetup(navigate, presetYears = 5, presetCode = '', presetName = '') {
  const state = { years: presetYears, code: presetCode, nickname: presetName, error: '' };
  const err = h('span', { class: 'field-error', id: 'code-err', 'aria-live': 'polite' });
  const start = () => {
    let code = state.code.trim() ? normaliseCode(state.code) : randomCode();
    if (!code) {
      err.textContent = 'A scenario code has 6 letters or digits (no I, L, O, 0 or 1). Leave it blank for a random scenario.';
      return;
    }
    startGame({ code, years: state.years, nickname: state.nickname.trim().slice(0, 24) });
    navigate('/play/brief');
  };
  const codeInput = h('input', { class: 'input mono', id: 'scn', value: state.code, maxlength: 8, autocomplete: 'off', autocapitalize: 'characters', 'aria-describedby': 'scn-help code-err', on: { input: (e) => { state.code = e.target.value; err.textContent = ''; } } });
  return h(
    'div',
    null,
    pageHeader({
      eyebrow: 'New game',
      title: 'Take the CFO’s chair',
      lede: 'You will run Umiam Beverages Ltd’s finances one financial year at a time. Each year: four decisions, then the market reacts.',
    }),
    h(
      'div',
      { class: 'split' },
      h(
        'form',
        { class: 'card stack', on: { submit: (e) => { e.preventDefault(); start(); } } },
        segmented({
          legend: 'Length',
          name: 'len',
          value: state.years,
          options: [
            { value: 5, label: '5 years', sub: 'about 15 min' },
            { value: 3, label: '3 years', sub: 'quick, about 7 min' },
          ],
          onChange: (v) => {
            state.years = v;
          },
        }),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'scn' }, 'Scenario code (optional)'), codeInput, h('span', { class: 'field-help', id: 'scn-help' }, 'Everyone with the same code faces the same events and projects. Leave blank for a random scenario.'), err),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'nick' }, 'Your name or nickname (optional)'), h('input', { class: 'input', id: 'nick', maxlength: 24, value: state.nickname, autocomplete: 'nickname', on: { input: (e) => { state.nickname = e.target.value; } } }), h('span', { class: 'field-help' }, 'Shown on your result code for the class results board.')),
        h('div', { class: 'btn-row' }, button('Start the game', { type: 'submit', iconName: 'arrowRight', iconAfter: true })),
      ),
      h(
        'aside',
        { class: 'stack' },
        h('span', { class: 'eyebrow' }, 'How you are scored'),
        h('p', null, 'Your score is your ', h('strong', null, 'risk-adjusted excess return'), ': the return to shareholders (share price plus dividends) above the cost of equity your own decisions created.'),
        h('p', { class: 'muted small' }, 'Borrowing or risky projects raise the return shareholders require, so taking risk alone does not win. Creating value does: positive-NPV projects, an efficient capital structure and tight working capital.'),
        h('div', { class: 'formula', html: '&alpha; = (1 + TSR) / (1 + K<sub>e</sub>) &minus; 1' }),
      ),
    ),
  );
}

function renderNew(params, navigate) {
  const years = Number(params.get('y')) === 3 ? 3 : 5;
  const code = params.get('code') ?? '';
  const nick = params.get('n') ?? '';
  const existing = getSession();
  if (existing && existing.game.status === 'playing' && existing.save.decisions.length + 1 > 0) {
    return h(
      'div',
      { class: 'stack' },
      pageHeader({ eyebrow: 'New game', title: 'You have a game in progress', lede: `Year ${existing.game.history.length + 1} of ${existing.game.years}, scenario ${existing.game.code}. Starting a new game will replace it.` }),
      h(
        'div',
        { class: 'btn-row' },
        button('Continue my game', { href: '#/play/brief', iconName: 'arrowRight', iconAfter: true }),
        button('Start a new game', {
          kind: 'secondary',
          onClick: () => {
            clearGame();
            session = null;
            mount(document.getElementById('app'), renderSetup(navigate, years, code, nick));
            document.querySelector('.page-title')?.focus();
          },
        }),
      ),
    );
  }
  return renderSetup(navigate, years, code, nick);
}

/* ------------------------------------------------------------------ */
/* Year bar                                                            */
/* ------------------------------------------------------------------ */

function yearBar(currentStep) {
  const g = session.game;
  const st = g.state;
  const yearIndex = g.history.length + 1;
  const v = st.valuation;
  const idx = STEPS.findIndex((x) => x.id === currentStep);
  return h(
    'div',
    { class: 'year-bar' },
    h(
      'div',
      { class: 'year-bar-top' },
      h('div', { class: 'year-title' }, `FY${st.fy + 1}`, h('span', { class: 'faint small' }, ` · year ${yearIndex} of ${g.years} · scenario `), h('span', { class: 'mono small' }, g.code)),
      h(
        'div',
        { class: 'year-kpis' },
        h('span', null, 'Price ', h('b', null, rupees(v.price))),
        h('span', null, 'Rating ', h('b', null, v.rating)),
        h('span', null, 'WACC ', h('b', null, pct(v.wacc))),
        h('span', null, 'Cash ', h('b', null, crore(st.cash, 0))),
      ),
    ),
    h(
      'ol',
      { class: 'stepper', 'aria-label': 'Steps this year' },
      STEPS.map((step, i) =>
        h(
          'li',
          { class: i < idx ? 'done' : '' },
          h('a', { href: `#/play/${step.id}`, 'aria-current': step.id === currentStep ? 'step' : undefined }, h('span', { class: 'step-no' }, String(i + 1).padStart(2, '0')), step.label),
        ),
      ),
    ),
  );
}

function stepNav(currentStep, navigate, nextLabel) {
  const idx = STEPS.findIndex((x) => x.id === currentStep);
  const prev = STEPS[idx - 1];
  const next = STEPS[idx + 1];
  return h(
    'div',
    { class: 'btn-row section' },
    prev ? button(prev.label, { kind: 'secondary', href: `#/play/${prev.id}`, iconName: 'arrowLeft' }) : null,
    next ? button(nextLabel ?? `Next: ${next.label}`, { href: `#/play/${next.id}`, iconName: 'arrowRight', iconAfter: true }) : null,
  );
}

/* ------------------------------------------------------------------ */
/* Live preview panel                                                  */
/* ------------------------------------------------------------------ */

function previewPanel() {
  const box = h('div', { class: 'card stack', 'aria-live': 'polite' });
  const update = () => {
    const st = session.game.state;
    const d = session.save.draft;
    const check = validateDecisions(st, offers(), d);
    let v;
    try {
      v = previewValue(st, offers(), d);
    } catch (err) {
      mount(box, callout('warn', h('p', null, err.message)));
      return;
    }
    const open = st.valuation;
    mount(
      box,
      h('span', { class: 'eyebrow' }, 'Market view of your plan'),
      h('div', { class: 'kpi-value' }, rupees(v.price), ' ', delta(v.price / open.price - 1)),
      h('p', { class: 'small muted' }, 'Pro forma share price if the market priced your decisions today, before this year’s events.'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'ledger' },
          h(
            'tbody',
            null,
            row('Rating', ratingBadge(v.rating), ratingBadge(open.rating)),
            row('WACC', pct(v.wacc, 2), pct(open.wacc, 2)),
            row('Cost of equity', pct(v.keEquity, 2), pct(open.keEquity, 2)),
            row('Net debt', crore(v.netDebt, 0), crore(open.netDebt, 0)),
          ),
        ),
      ),
      h('p', { class: 'tiny faint' }, 'Second column: start of year.'),
      check.ok ? null : callout('bad', h('p', null, h('strong', null, 'Fix before submitting: '), check.errors.map((e) => e.message).join(' '))),
    );
  };
  update();
  return { el: box, update };
}

function row(label, a, b) {
  return h('tr', null, h('td', null, label), h('td', { class: 'n' }, a), b !== undefined ? h('td', { class: 'n faint' }, b) : null);
}

function onDraftChange(preview) {
  session.cache.previewDirty = true;
  persistSoon();
  if (preview) debouncedPreview(preview);
}

const debouncedPreview = debounce((p) => p.update(), 120);

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

function renderStep(stepId, navigate) {
  const bar = yearBar(stepId);
  let body;
  if (stepId === 'brief') body = renderBrief(navigate);
  else if (stepId === 'wc') body = renderWorkingCapital(navigate);
  else if (stepId === 'invest') body = renderInvestment(navigate);
  else if (stepId === 'finance') body = renderFinancing(navigate);
  else if (stepId === 'dividend') body = renderDividend(navigate);
  else body = renderReview(navigate);
  return h('div', null, bar, body);
}

function renderBrief(navigate) {
  const g = session.game;
  const st = g.state;
  const v = st.valuation;
  const inc = st.statements.income;
  const yearIndex = g.history.length + 1;
  const prevEntry = g.history[g.history.length - 1];
  const intro =
    yearIndex === 1
      ? h(
          'div',
          { class: 'card stack' },
          h('span', { class: 'eyebrow' }, 'Memo from the board'),
          h('p', { class: 'lede' }, 'Welcome to Umiam Beverages. Our mandate for you is simple: create value for shareholders. The market will judge every decision you make, in rupees per share.'),
          h('p', { class: 'muted' }, `Each year you set working capital, choose among three projects, decide how to fund the company and what to pay out. Then the year happens: monsoons, price wars and the RBI do not ask your permission. Your score is the return above the cost of equity your decisions create.`),
        )
      : callout(prevEntry.price + prevEntry.dps >= prevEntry.priceBefore ? 'good' : 'warn', h('p', null, h('strong', null, `FY${prevEntry.fy}: `), `share price ${rupees(prevEntry.priceBefore)} → ${rupees(prevEntry.price)}, dividend ${rupees(prevEntry.dps)}. `, h('a', { href: `#/play/results?y=${prevEntry.yearIndex}` }, 'See last year’s results'), '.'));

  const growth = M.expectedGrowth(st.fy + 1);
  const priceSeries = [g.startPrice, ...g.history.map((x) => x.price)];
  const labels = ['FY26', ...g.history.map((x) => `FY${x.fy}`)];

  return h(
    'div',
    { class: 'stack-lg' },
    h('h1', { class: 'page-title visually-hidden', tabindex: '-1' }, `FY${st.fy + 1} briefing`),
    intro,
    h(
      'section',
      null,
      sectionHead('01', `Where we stand: end of FY${st.fy}`),
      h(
        'div',
        { class: 'kpi-grid' },
        kpi({ label: 'Share price', value: rupees(v.price), change: delta(v.price / g.startPrice - 1), sub: 'since FY26' }),
        kpi({ label: 'Market value of equity', value: crore(v.equityValue, 0) }),
        kpi({ label: 'Credit rating', value: v.rating, sub: `interest cover ${times(v.coverage, 1)}` }),
        kpi({ label: 'WACC', value: pct(v.wacc, 2), sub: `cost of equity ${pct(v.keEquity, 1)}` }),
        kpi({ label: 'Revenue', value: crore(inc.revenue, 0) }),
        kpi({ label: 'EBITDA margin', value: pct(inc.ebitda / inc.revenue) }),
        kpi({ label: 'Cash', value: crore(st.cash, 0), sub: `buffer ${pct(st.policy.cashBufferPct, 0)} of revenue` }),
        kpi({ label: 'Debt', value: crore(M.totalDebt(st), 0), sub: `limit ${crore(debtCapacity(st), 0)}` }),
      ),
    ),
    h(
      'section',
      null,
      sectionHead('02', `Outlook for FY${st.fy + 1}`),
      h(
        'div',
        { class: 'grid grid-3' },
        h('div', { class: 'card card-tight' }, h('span', { class: 'eyebrow' }, 'Expected demand growth'), h('div', { class: 'kpi-value' }, pct(growth)), h('p', { class: 'small muted' }, 'Growth fades towards 5% as the market matures. Events can push it either way.')),
        h('div', { class: 'card card-tight' }, h('span', { class: 'eyebrow' }, 'Risk-free rate'), h('div', { class: 'kpi-value' }, pct(st.riskFree, 2)), h('p', { class: 'small muted' }, '10-year G-sec. Moves only when the RBI does.')),
        h('div', { class: 'card card-tight' }, h('span', { class: 'eyebrow' }, 'Equity risk premium'), h('div', { class: 'kpi-value' }, pct(CONFIG.market.erp, 2)), h('p', { class: 'small muted' }, 'India total ERP (Damodaran, January 2026).')),
      ),
      h('p', { class: 'small muted' }, 'Events are not revealed in advance. On average they cancel out, so the market’s expectations are unbiased.'),
    ),
    g.history.length
      ? h('section', null, sectionHead('03', 'Share price so far'), lineChart({ series: [{ name: 'Share price', values: priceSeries, cls: 1 }], labels, yFormat: (x) => `₹${num(x, 0)}`, ariaLabel: 'Share price by year', description: 'Year-end share price since FY26.' }))
      : null,
    h(
      'details',
      { class: 'disclosure' },
      h('summary', null, `Financial statements, FY${st.fy}`),
      h('div', { class: 'stack' }, statements(st.statements, null, { fyNow: `FY${st.fy}` })),
    ),
    stepNav('brief', navigate, 'Start the year’s decisions'),
  );
}

function renderWorkingCapital(navigate) {
  const st = session.game.state;
  const d = session.save.draft;
  const preview = previewPanel();
  const cycleBox = h('div', { class: 'card stack', 'aria-live': 'polite' });
  const WCC = CONFIG.workingCapital;
  const drawCycle = () => {
    const dso = d.wc.creditDays;
    const dio = d.wc.inventoryDays;
    const dpo = d.wc.payableDays;
    const ccc = dio + dso - dpo;
    const credit = WCC.creditDays[dso];
    const inv = WCC.inventoryDays[dio];
    const pay = WCC.payableDays[dpo];
    mount(
      cycleBox,
      h('span', { class: 'eyebrow' }, 'Your cash conversion cycle'),
      h('div', { class: 'kpi-value' }, `${ccc} days`, ' ', delta(ccc - (st.policy.inventoryDays + st.policy.creditDays - st.policy.payableDays), { format: (x) => `${x > 0 ? '+' : '−'}${Math.abs(x)} days`, invert: true })),
      h('p', { class: 'small muted' }, `${dio} inventory days + ${dso} receivable days − ${dpo} payable days. Operating cycle: ${dio + dso} days.`),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'ledger' },
          h(
            'tbody',
            null,
            row('Sales effect of credit terms', signedPct(credit.sales)),
            row('Bad debts', pct(credit.badDebt) + ' of sales'),
            row('Sales lost to stockouts (vs 45 days)', signedPct(inv.sales)),
            row('Inventory holding cost', pct(WCC.holdingCostRate, 0) + ' a year'),
            row('Supplier premium for slow payment', pct(pay.premium) + ' of variable costs'),
          ),
        ),
      ),
    );
  };
  drawCycle();
  const changed = () => {
    drawCycle();
    onDraftChange(preview);
  };
  const lever = (key, legend, options, help) =>
    segmented({
      legend,
      name: key,
      value: d.wc[key],
      options,
      help,
      onChange: (val) => {
        d.wc[key] = val;
        changed();
      },
    });
  return h(
    'div',
    { class: 'split' },
    h(
      'div',
      { class: 'stack' },
      h('h1', { class: 'page-title', tabindex: '-1' }, 'Working capital'),
      h('p', { class: 'muted' }, 'Looser credit sells more but brings bad debts and ties up cash. More stock prevents stockouts but costs money to hold. Paying suppliers later is free credit, up to the point they charge you for it.'),
      h(
        'div',
        { class: 'card stack' },
        lever('creditDays', 'Credit period for customers', WC_OPTIONS.creditDays.map((x) => ({ value: x, label: `${x}`, sub: 'days' })), 'Days your distributors and retailers take to pay.'),
        lever('inventoryDays', 'Inventory level', WC_OPTIONS.inventoryDays.map((x) => ({ value: x, label: `${x}`, sub: 'days' })), 'Days of sales held as stock.'),
        lever('payableDays', 'Supplier payment period', WC_OPTIONS.payableDays.map((x) => ({ value: x, label: `${x}`, sub: 'days' })), 'Days you take to pay sugar, PET and packaging suppliers.'),
        lever('cashBufferPct', 'Minimum cash buffer', WC_OPTIONS.cashBufferPct.map((x) => ({ value: x, label: pct(x, 0), sub: 'of revenue' })), 'If year-end cash falls below this, an emergency loan tops it up at the normal rate plus 4 points. Cash earns the risk-free rate.'),
      ),
      h('p', { class: 'small' }, h('a', { href: '#/toolkit/wc' }, 'Why? Open the working-capital calculator'), '.'),
    ),
    h('div', { class: 'stack sticky-side' }, cycleBox, preview.el, stepNav('wc', navigate)),
  );
}

function renderInvestment(navigate) {
  const st = session.game.state;
  const d = session.save.draft;
  const o = offers();
  const analysis = projectAnalysis();
  const preview = previewPanel();
  const ui = { basis: session.cache.basis ?? 'own' };
  const listHolder = h('div', { class: 'stack' });
  const summaryBox = h('div', { class: 'card stack', 'aria-live': 'polite' });

  const drawSummary = () => {
    const capex = o.projects.filter((p) => d.accept.includes(p.uid)).reduce((a, p) => a + p.cost, 0);
    const npvOwn = analysis.filter((a) => d.accept.includes(a.uid)).reduce((acc, a) => acc + a.npvOwn, 0);
    const minCash = d.wc.cashBufferPct * st.lastRevenue;
    const available = st.cash - minCash;
    const gap = capex - available;
    mount(
      summaryBox,
      h('span', { class: 'eyebrow' }, 'Your selection'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'ledger' },
          h(
            'tbody',
            null,
            row('Capital spending', crore(capex)),
            o.budget != null ? row('Board budget this year', crore(o.budget)) : null,
            row('Cash above your buffer', crore(available)),
            row('NPV at own risk-adjusted rates', signedCrore(npvOwn)),
          ),
        ),
      ),
      gap > 0.5 ? callout('warn', h('p', null, `You need about ${crore(gap, 0)} more cash. Borrow or issue shares on the next screen, or the shortfall becomes an emergency loan at a premium rate.`)) : null,
    );
  };

  const drawList = () => {
    mount(
      listHolder,
      o.projects.map((p) => {
        const a = analysis.find((x) => x.uid === p.uid);
        const selected = d.accept.includes(p.uid);
        const exclusiveWith = o.exclusive.find((pair) => pair.includes(p.uid))?.find((x) => x !== p.uid);
        const featureNpv = ui.basis === 'own' ? a.npvOwn : a.npvCompany;
        const featureRate = ui.basis === 'own' ? a.ownWacc : a.companyWacc;
        const toggle = () => {
          if (selected) d.accept = d.accept.filter((x) => x !== p.uid);
          else {
            const hadOther = exclusiveWith && d.accept.includes(exclusiveWith);
            d.accept = [...d.accept.filter((x) => x !== exclusiveWith), p.uid];
            if (hadOther) toast('Mutually exclusive: the other bottling line was deselected.');
          }
          drawList();
          drawSummary();
          onDraftChange(preview);
        };
        const risk = p.betaU >= 1.2 ? ['High risk', 'bad'] : p.betaU <= 0.5 ? ['Low risk', 'good'] : ['Business risk', 'ok'];
        return h(
          'article',
          { class: `card project ${selected ? 'selected' : ''}`, 'aria-label': p.name },
          h(
            'div',
            { class: 'project-head' },
            h('div', null, h('h3', null, p.name), h('p', { class: 'small muted' }, p.blurb)),
            h('button', { class: `btn btn-secondary accept-btn`, type: 'button', 'aria-pressed': selected ? 'true' : 'false', on: { click: toggle } }, selected ? icon('check') : null, selected ? 'Accepted' : 'Accept'),
          ),
          h(
            'div',
            { class: 'project-meta' },
            h('span', { class: 'badge' }, `Cost ${crore(p.cost)}`),
            h('span', { class: 'badge' }, `${p.life} years`),
            h('span', { class: `badge ${risk[1]}` }, `${risk[0]}: asset beta ${num(p.betaU, 2)}`),
            exclusiveWith ? h('span', { class: 'badge brand' }, 'Mutually exclusive') : null,
          ),
          h(
            'div',
            { class: 'metrics' },
            h('div', { class: 'metric feature' }, h('span', { class: 'eyebrow' }, `NPV @ ${pct(featureRate)}`), h('div', { class: 'v' }, signedCrore(featureNpv))),
            h('div', { class: 'metric' }, h('span', { class: 'eyebrow' }, 'IRR'), h('div', { class: 'v' }, a.irr != null ? pct(a.irr) : 'n/a')),
            h('div', { class: 'metric' }, h('span', { class: 'eyebrow' }, 'MIRR'), h('div', { class: 'v' }, pct(a.mirr))),
            h('div', { class: 'metric' }, h('span', { class: 'eyebrow' }, 'PI'), h('div', { class: 'v' }, num(a.pi, 2))),
          ),
          h(
            'details',
            { class: 'disclosure small' },
            h('summary', null, 'Cash flows and more measures'),
            h(
              'div',
              { class: 'stack' },
              dataTable(['Year', 'After-tax cash flow (INR cr)'], a.flows.map((cf, t) => [String(t), num(cf, 1)])),
              h(
                'div',
                { class: 'table-wrap' },
                h(
                  'table',
                  { class: 'ledger' },
                  h(
                    'tbody',
                    null,
                    row('NPV at company WACC', `${signedCrore(a.npvCompany)} @ ${pct(a.companyWacc)}`),
                    row('NPV at own risk-adjusted rate', `${signedCrore(a.npvOwn)} @ ${pct(a.ownWacc)}`),
                    row('Own levered beta', num(a.ownBetaL, 2)),
                    row('Payback', a.payback != null ? `${num(a.payback, 1)} years` : 'never'),
                    row('Discounted payback', a.discountedPayback != null ? `${num(a.discountedPayback, 1)} years` : 'never'),
                  ),
                ),
              ),
            ),
          ),
        );
      }),
    );
  };
  drawList();
  drawSummary();

  const basisToggle = h(
    'div',
    { class: 'toggle', role: 'group', 'aria-label': 'Discount rate shown on the cards' },
    ['own', 'company'].map((b) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': ui.basis === b ? 'true' : 'false',
          on: {
            click: (e) => {
              ui.basis = b;
              session.cache.basis = b;
              e.currentTarget.parentElement.querySelectorAll('button').forEach((btn) => btn.setAttribute('aria-pressed', String(btn === e.currentTarget)));
              drawList();
            },
          },
        },
        b === 'own' ? 'Each project’s own risk' : 'Company WACC',
      ),
    ),
  );

  const constraints = [];
  if (o.budget != null) constraints.push(callout('warn', h('p', null, h('strong', null, 'Capital rationing: '), `the board has capped capital spending at ${crore(o.budget, 0)} this year. You cannot take all three.`)));
  if (o.exclusive.length) constraints.push(callout('', h('p', null, h('strong', null, 'Mutually exclusive: '), 'the two bottling lines compete for the same floor space. Choose one or neither.')));

  return h(
    'div',
    { class: 'split' },
    h(
      'div',
      { class: 'stack' },
      h('h1', { class: 'page-title', tabindex: '-1' }, 'Investment'),
      h('p', { class: 'muted' }, 'Three proposals reached the board this year. Discount each at a rate that matches its own risk: a project’s asset beta, relevered at our capital structure.'),
      h('div', { class: 'cluster' }, h('span', { class: 'small muted' }, 'Show NPV at:'), basisToggle),
      constraints,
      listHolder,
      h('p', { class: 'small' }, h('a', { href: '#/toolkit/capbud' }, 'Why? Open the capital budgeting calculator'), '.'),
    ),
    h('div', { class: 'stack sticky-side' }, summaryBox, preview.el, stepNav('invest', navigate)),
  );
}

function renderFinancing(navigate) {
  const st = session.game.state;
  const d = session.save.draft;
  const preview = previewPanel();
  const D = M.totalDebt(st);
  const maxRepay = Math.floor(Math.min(D, Math.max(0, st.cash)));
  const maxBorrow = Math.floor(Math.max(0, debtCapacity(st) - D));
  const maxIssue = Math.floor(CONFIG.financing.maxIssueShareOfMarketCap * st.valuation.marketCap);
  const curveBox = h('div');

  const drawCurve = () => {
    const points = [];
    const lo = -maxRepay;
    const hi = maxBorrow;
    const steps = 24;
    for (let i = 0; i <= steps; i += 1) {
      const change = lo + ((hi - lo) * i) / steps;
      try {
        const v = previewValue(st, offers(), { ...d, financing: { ...d.financing, debtChange: change } });
        points.push({ x: D + change, y: v.wacc });
      } catch {
        /* skip */
      }
    }
    const current = previewValue(st, offers(), d);
    mount(
      curveBox,
      xyChart({
        series: [{ name: 'WACC', points, cls: 1 }],
        xFormat: (x) => num(x, 0),
        yFormat: (y) => pct(y, 2),
        markers: [{ x: D + d.financing.debtChange, y: current.wacc, label: `Your plan: ${pct(current.wacc, 2)}` }],
        xTitle: 'Total debt after this decision (INR crore)',
        ariaLabel: 'WACC at different debt levels',
        description: 'Debt is cheaper than equity after tax, so WACC falls at first. As leverage rises, the rating drops, the cost of debt and beta rise, and WACC turns up.',
        height: 240,
      }),
    );
  };
  drawCurve();
  const curveSoon = debounce(drawCurve, 250);

  const debtField = rangeField({
    label: 'Borrow (+) or repay (−)',
    value: d.financing.debtChange,
    min: -maxRepay,
    max: maxBorrow,
    step: 5,
    format: (x) => signedCrore(x, 0),
    scale: [signedCrore(-maxRepay, 0), '0', signedCrore(maxBorrow, 0)],
    help: `Debt today: ${crore(D, 0)}. Lenders cap total debt at ${CONFIG.financing.maxDebtToEbitda}x last year’s EBITDA (${crore(debtCapacity(st), 0)}). Repayments are limited to cash on hand.`,
    onInput: (x) => {
      d.financing.debtChange = x;
      onDraftChange(preview);
      curveSoon();
    },
  });
  const equityField = numberField({
    label: 'Issue new shares (gross proceeds)',
    value: d.financing.equityIssue,
    step: 5,
    min: 0,
    max: maxIssue,
    prefix: '₹',
    suffix: 'cr',
    help: `Sold at a 5% discount to the market price, with 3% flotation costs and a 2% announcement drop. Up to ${crore(maxIssue, 0)}.`,
    onInput: (x) => {
      d.financing.equityIssue = Number.isFinite(x) && x > 0 ? x : 0;
      onDraftChange(preview);
      curveSoon();
    },
  });

  return h(
    'div',
    { class: 'split' },
    h(
      'div',
      { class: 'stack' },
      h('h1', { class: 'page-title', tabindex: '-1' }, 'Financing'),
      h('p', { class: 'muted' }, 'Interest is tax-deductible, so debt lowers the cost of capital, until the rating slips. Then the cost of debt jumps, beta rises, and customers and suppliers start to worry (distress costs). Find the balance.'),
      h('div', { class: 'card stack' }, debtField, equityField),
      h('section', { class: 'stack' }, h('span', { class: 'eyebrow' }, 'WACC at different debt levels, given your other decisions'), curveBox),
      h('p', { class: 'small' }, h('a', { href: '#/toolkit/coc' }, 'Why? Open the cost of capital calculator'), '.'),
    ),
    h('div', { class: 'stack sticky-side' }, preview.el, stepNav('finance', navigate)),
  );
}

function renderDividend(navigate) {
  const st = session.game.state;
  const d = session.save.draft;
  const preview = previewPanel();
  const inc = st.statements.income;
  const info = h('div', { class: 'card stack', 'aria-live': 'polite' });
  const draw = () => {
    const estDps = (d.payoutRatio * Math.max(0, inc.pat)) / st.shares;
    const cutRisk = st.lastDps > 0 && estDps < (1 - CONFIG.dividend.cutThreshold) * st.lastDps;
    mount(
      info,
      h('span', { class: 'eyebrow' }, 'If profit matches last year'),
      h('div', { class: 'kpi-value' }, `${rupees(estDps)} a share`),
      h('p', { class: 'small muted' }, `Last year’s dividend: ${rupees(st.lastDps)} a share from profit of ${crore(inc.pat)}. Dividends are paid at year end from this year’s profit, which events can push up or down.`),
      cutRisk ? callout('warn', h('p', null, 'This would cut the dividend by more than 20%. Markets read cuts as bad news (a 3% price drop in this game).')) : null,
    );
  };
  draw();
  const payout = rangeField({
    label: 'Payout ratio',
    value: Math.round(d.payoutRatio * 100),
    min: 0,
    max: 100,
    step: 5,
    format: (x) => `${x}%`,
    scale: ['0%', '50%', '100%'],
    help: 'Share of this year’s profit after tax paid as dividends.',
    onInput: (x) => {
      d.payoutRatio = x / 100;
      draw();
      onDraftChange(preview);
    },
  });
  return h(
    'div',
    { class: 'split' },
    h(
      'div',
      { class: 'stack' },
      h('h1', { class: 'page-title', tabindex: '-1' }, 'Dividend'),
      h('p', { class: 'muted' }, 'In a perfect market, dividend policy does not change value (Modigliani and Miller): the share price falls by the dividend paid. Here it matters through funding (cash paid out cannot fund projects) and signalling (cuts are punished).'),
      h('div', { class: 'card stack' }, payout),
    ),
    h('div', { class: 'stack sticky-side' }, info, preview.el, stepNav('dividend', navigate, 'Next: Review and submit')),
  );
}

function renderReview(navigate) {
  const st = session.game.state;
  const d = session.save.draft;
  const o = offers();
  const check = validateDecisions(st, o, d);
  const v = previewValue(st, o, d);
  const accepted = o.projects.filter((p) => d.accept.includes(p.uid));
  const submit = () => {
    try {
      const game = playYear(session.game, d);
      session.game = game;
      session.save.decisions = [...session.save.decisions, JSON.parse(JSON.stringify(d))];
      session.save.draft = null;
      session.save.draftYear = null;
      session.cache = {};
      ensureDraft();
      persist();
      navigate(`/play/results?y=${game.history.length}`);
    } catch (err) {
      toast(err.message);
    }
  };
  return h(
    'div',
    { class: 'split' },
    h(
      'div',
      { class: 'stack' },
      h('h1', { class: 'page-title', tabindex: '-1' }, `Review your FY${st.fy + 1} plan`),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'ledger' },
          h('thead', null, h('tr', null, h('th', null, 'Decision'), h('th', { class: 'n' }, 'Your choice'), h('th', { class: 'n' }, 'Last year'))),
          h(
            'tbody',
            null,
            row('Credit period', `${d.wc.creditDays} days`, `${st.policy.creditDays} days`),
            row('Inventory', `${d.wc.inventoryDays} days`, `${st.policy.inventoryDays} days`),
            row('Supplier payment', `${d.wc.payableDays} days`, `${st.policy.payableDays} days`),
            row('Cash buffer', pct(d.wc.cashBufferPct, 0), pct(st.policy.cashBufferPct, 0)),
            row('Projects', accepted.length ? accepted.map((p) => p.name).join('; ') : 'none', ''),
            row('Borrow / repay', signedCrore(d.financing.debtChange, 0), ''),
            row('Share issue', crore(d.financing.equityIssue, 0), ''),
            row('Payout ratio', pct(d.payoutRatio, 0), pct(st.payoutRatio, 0)),
          ),
        ),
      ),
      check.ok ? null : callout('bad', h('p', null, h('strong', null, 'Please fix: '), check.errors.map((e) => e.message).join(' '))),
      h(
        'div',
        { class: 'btn-row' },
        button('Back to dividend', { kind: 'secondary', href: '#/play/dividend', iconName: 'arrowLeft' }),
        button(`Submit FY${st.fy + 1} and run the year`, { onClick: submit, iconName: 'arrowRight', iconAfter: true, attrs: { disabled: !check.ok } }),
      ),
    ),
    h(
      'div',
      { class: 'stack sticky-side' },
      h(
        'div',
        { class: 'card stack' },
        h('span', { class: 'eyebrow' }, 'Pro forma share price'),
        h('div', { class: 'kpi-value' }, rupees(v.price), ' ', delta(v.price / st.valuation.price - 1)),
        h('p', { class: 'small muted' }, 'This is how the market values your plan before the year unfolds. Events and project luck will move the actual year-end price.'),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

function eventTone(ev) {
  const e = ev.effects;
  const score = (e.demand ?? 0) + (e.price ?? 0) + (e.revenue ?? 0) - (e.vc ?? 0) * 3 - (e.rf ?? 0) * 5 - (e.fixedPct ?? 0) - (e.oneOff ?? 0) / 300;
  return score >= 0 ? 'good' : 'bad';
}

function renderResults(params, navigate) {
  const g = session.game;
  const n = Math.min(Math.max(1, Number(params.get('y')) || g.history.length), g.history.length);
  const entry = g.history[n - 1];
  if (!entry) return renderStep('brief', navigate);
  const before = entry.before;
  const after = entry.after;
  const r = entry.report;
  const valueChange = (entry.price + entry.dps) / entry.priceBefore - 1;
  const isLast = n === g.history.length;
  const finished = g.status !== 'playing';

  const events = r.events.length
    ? r.events.map((ev) => {
        const tone = eventTone(ev);
        return h('div', { class: `event ${tone}` }, h('div', { class: 'icon' }, icon(tone === 'good' ? 'up' : 'down')), h('div', null, h('h4', null, ev.name), h('p', { class: 'small muted' }, ev.text)));
      })
    : [h('p', { class: 'muted' }, 'A quiet year: no major events.')];

  const bridge = entry.bridge;
  const bridgeChart = bridge
    ? waterfallChart({
        start: bridge.start,
        startLabel: `FY${before.fy} price`,
        steps: bridge.components.map((c) => ({ label: c.label, value: c.value })),
        endLabel: `FY${after.fy} price + dividend`,
        format: (x) => `₹${num(x, 1)}`,
        ariaLabel: 'Value bridge: what moved value per share this year',
        description: 'Each bar shows how much one group of decisions, or market luck, changed the share price plus dividend.',
      })
    : null;

  const projectRows = r.projectResults.map((p) => [p.name, p.expected != null ? num(p.expected, 1) : 'cost saving', num(p.realised, 1)]);

  const lessons = entry.offers.projects.map((p) => {
    const t = PROJECT_TEMPLATES[p.templateId];
    const a = entry.analysis?.projects.find((x) => x.uid === p.uid);
    const took = entry.decisions.accept.includes(p.uid);
    return h('li', { class: a && (a.npvOwn > 0) === took ? 'good' : '' }, h('strong', null, p.name), took ? ' (accepted). ' : ' (declined). ', t.lesson, a ? ` NPV at own rate: ${signedCrore(a.npvOwn)}.` : '');
  });

  return h(
    'div',
    { class: 'stack-lg' },
    h(
      'header',
      { class: 'stack' },
      h('span', { class: 'eyebrow' }, `FY${after.fy} results · scenario ${g.code}`),
      h('h1', { class: 'page-title', tabindex: '-1' }, `Share price ${rupees(entry.priceBefore)} → ${rupees(entry.price)}`),
      h('p', { class: 'lede' }, 'Return to shareholders this year, including the dividend of ', rupees(entry.dps), ': ', delta(valueChange), ` against a required return of ${pct(entry.requiredReturn)}.`),
      r.bankrupt ? callout('bad', h('p', null, h('strong', null, 'The company ran out of cash and borrowing capacity. '), 'Shareholders lose everything. The game is over.')) : null,
    ),
    h('section', null, sectionHead('01', 'What happened'), h('div', { class: 'grid grid-2' }, events), h('p', { class: 'small muted' }, `Demand grew ${pct(r.growth)} against an expected ${pct(r.expectedGrowth)}.`)),
    bridge ? h('section', null, sectionHead('02', 'What moved your value'), bridgeChart, h('p', { class: 'small muted' }, 'Each step re-runs the same year with one more group of your decisions, in the order shown, and the same events. The attribution is approximate: changing the order changes the split a little.')) : null,
    h(
      'section',
      null,
      sectionHead('03', 'Key changes'),
      h(
        'div',
        { class: 'kpi-grid' },
        kpi({ label: 'Rating', value: after.valuation.rating, sub: `was ${before.valuation.rating}` }),
        kpi({ label: 'WACC', value: pct(after.valuation.wacc, 2), sub: `was ${pct(before.valuation.wacc, 2)}` }),
        kpi({ label: 'Cost of equity', value: pct(after.valuation.keEquity, 2), sub: `was ${pct(before.valuation.keEquity, 2)}` }),
        kpi({ label: 'Cash', value: crore(after.cash, 0), sub: `was ${crore(before.cash, 0)}` }),
        kpi({ label: 'Debt', value: crore(after.debt + after.emergencyDebt, 0), sub: `was ${crore(before.debt + before.emergencyDebt, 0)}` }),
        kpi({ label: 'Profit after tax', value: crore(after.statements.income.pat), sub: `was ${crore(before.statements.income.pat)}` }),
        kpi({ label: 'EVA', value: signedCrore(entry.eva), sub: 'NOPAT minus capital charge' }),
        kpi({ label: 'Risk-free rate', value: pct(after.riskFree, 2), sub: `was ${pct(before.riskFree, 2)}` }),
      ),
      r.emergencyLoan > 0.5 ? callout('warn', h('p', null, `Cash fell below your buffer, so the company took an emergency loan of ${crore(r.emergencyLoan)} at the normal rate plus 4 points.`)) : null,
      r.dividendCut ? callout('warn', h('p', null, 'You cut the dividend per share by more than 20%. The market marked the shares down 3%.')) : null,
    ),
    projectRows.length ? h('section', null, sectionHead('04', 'Projects this year'), dataTable(['Project', 'Expected EBITDA, ₹ cr', 'Actual EBITDA, ₹ cr'], projectRows)) : null,
    h('section', null, sectionHead(projectRows.length ? '05' : '04', 'What each proposal was teaching'), h('ul', { class: 'feedback' }, lessons)),
    h('details', { class: 'disclosure' }, h('summary', null, `Financial statements, FY${after.fy}`), h('div', { class: 'stack' }, statements(after.statements, before.statements, { fyNow: `FY${after.fy}`, fyPrev: `FY${before.fy}` }))),
    h(
      'div',
      { class: 'btn-row' },
      !isLast ? button(`Next results: FY${after.fy + 1}`, { href: `#/play/results?y=${n + 1}` }) : finished ? button('See your final report', { href: '#/play/debrief', iconName: 'arrowRight', iconAfter: true }) : button(`Plan FY${after.fy + 1}`, { href: '#/play/brief', iconName: 'arrowRight', iconAfter: true }),
      n > 1 ? button(`FY${after.fy - 1} results`, { kind: 'secondary', href: `#/play/results?y=${n - 1}` }) : null,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Debrief                                                             */
/* ------------------------------------------------------------------ */

function renderDebrief(navigate) {
  const g = session.game;
  const sm = summary(g);
  const grades = gradeGame(g);
  if (!session.cache.textbook) {
    const tb = playBot('textbook', g.code, g.years);
    const hands = playBot('handsOff', g.code, g.years);
    session.cache.textbook = summary(tb);
    session.cache.handsOff = summary(hands);
  }
  const tb = session.cache.textbook;
  const ho = session.cache.handsOff;
  const resultCode = encodeResult({ code: g.code, years: g.years, nickname: g.nickname, decisions: session.save.decisions });
  const labels = ['FY26', ...sm.path.map((p) => `FY${p.fy}`)];
  const verdict =
    sm.bankrupt
      ? callout('bad', h('p', null, 'Umiam Beverages went bankrupt on your watch. Shareholders lost everything.'))
      : sm.alpha > 0.002
        ? callout('good', h('p', null, `You created value: shareholders earned ${pct(sm.alpha, 2)} a year more than your risk required.`))
        : sm.alpha < -0.002
          ? callout('warn', h('p', null, `Shareholders earned ${pct(-sm.alpha, 2)} a year less than the risk you took required.`))
          : callout('', h('p', null, 'Shareholders earned roughly what your risk required: no value created or destroyed.'));

  const area = (key, title) => {
    const gr = grades[key];
    if (!gr) return null;
    return h(
      'article',
      { class: 'card stack' },
      h('div', { class: 'report-area' }, h('div', { class: `grade ${gr.letter}`, 'aria-label': `Grade ${gr.letter}` }, gr.letter), h('div', null, h('h3', null, title), h('p', { class: 'small muted' }, gr.summary))),
      h('ul', { class: 'feedback' }, gr.feedback.slice(0, 6).map((f) => h('li', { class: f.good ? 'good' : '' }, f.fy ? h('span', { class: 'fy' }, f.fy) : null, f.text))),
      h('p', { class: 'tiny faint' }, GRADING_RULES[key]),
    );
  };

  return h(
    'div',
    { class: 'stack-lg' },
    h(
      'header',
      { class: 'stack' },
      h('span', { class: 'eyebrow' }, `Final report · FY${CONFIG.company.startFy + 1} to FY${CONFIG.company.startFy + sm.years} · scenario ${g.code}${g.nickname ? ` · ${g.nickname}` : ''}`),
      h('h1', { class: 'page-title', tabindex: '-1' }, 'Your record as CFO'),
      h('div', { class: 'headline-number' }, signedPct(sm.alpha, 2), h('span', { class: 'small muted' }, ' a year')),
      h('p', { class: 'lede' }, 'Risk-adjusted excess return (alpha): total shareholder return above the cost of equity your decisions created.'),
      verdict,
    ),
    h(
      'div',
      { class: 'kpi-grid' },
      kpi({ label: 'Total shareholder return', value: pct(sm.tsr, 2), sub: 'a year, dividends reinvested' }),
      kpi({ label: 'Required return', value: pct(sm.requiredReturn, 2), sub: 'average cost of equity' }),
      kpi({ label: 'Cumulative EVA', value: signedCrore(sm.cumulativeEva, 0) }),
      kpi({ label: 'Final rating', value: sm.rating, sub: `share price ${rupees(sm.endPrice)}` }),
    ),
    h(
      'section',
      null,
      sectionHead('01', 'Wealth created against the hurdle'),
      lineChart({
        series: [
          { name: 'Your shareholders’ wealth (₹1 invested)', values: [1, ...sm.path.map((p) => p.wealth)], cls: 1 },
          { name: 'Required by their risk', values: [1, ...sm.path.map((p) => p.required)], cls: 3 },
        ],
        labels,
        yFormat: (x) => `₹${num(x, 2)}`,
        ariaLabel: 'Shareholder wealth against the required return',
        description: 'Growth of one rupee invested in Umiam shares under your management, against what shareholders required for the risk.',
      }),
    ),
    h(
      'section',
      null,
      sectionHead('02', 'You against the benchmarks, same scenario'),
      barChart({
        items: [
          { label: g.nickname || 'You', value: sm.alpha },
          { label: 'Textbook CFO', value: tb.alpha },
          { label: 'Hands-off CFO', value: ho.alpha },
        ],
        format: (x) => signedPct(x, 2),
        highlight: g.nickname || 'You',
        ariaLabel: 'Risk-adjusted excess return: you, the Textbook CFO and the Hands-off CFO',
        description: 'The Textbook CFO follows NPV at risk-adjusted rates and value-maximising financing; the Hands-off CFO changes nothing.',
      }),
      h('p', { class: 'small muted' }, 'Both benchmarks faced exactly the same events and projects as you. ', h('a', { href: '#/learn' }, 'How the benchmark bots play'), '.'),
    ),
    h('section', null, sectionHead('03', 'Report card'), h('div', { class: 'grid grid-2' }, area('investment', 'Investment'), area('workingCapital', 'Working capital'), area('financing', 'Financing'), area('dividend', 'Dividend'))),
    h(
      'section',
      null,
      sectionHead('04', 'Share your result'),
      h('p', { class: 'muted' }, 'Your result code contains your decisions, so anyone can verify your score on the results board by replaying your game.'),
      h('div', { class: 'result-code', id: 'result-code' }, resultCode),
      h(
        'div',
        { class: 'btn-row' },
        button('Copy result code', { kind: 'secondary', iconName: 'copy', onClick: () => copyText(resultCode) }),
        button('Print report', { kind: 'secondary', iconName: 'print', onClick: () => window.print() }),
      ),
    ),
    h(
      'section',
      null,
      sectionHead('05', 'Review each year'),
      h('div', { class: 'btn-row' }, g.history.map((x) => button(`FY${x.fy}`, { kind: 'secondary', href: `#/play/results?y=${x.yearIndex}` }))),
    ),
    h(
      'div',
      { class: 'btn-row no-print' },
      button('Replay this scenario', {
        onClick: () => {
          startGame({ code: g.code, years: g.years, nickname: g.nickname });
          navigate('/play/brief');
        },
        iconName: 'refresh',
      }),
      button('New scenario', {
        kind: 'secondary',
        onClick: () => {
          clearGame();
          session = null;
          navigate('/play');
        },
      }),
    ),
  );
}
