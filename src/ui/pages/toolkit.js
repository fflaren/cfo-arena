/**
 * Toolkit: the course's calculators, each with formulas, a worked example and the
 * course reading. All maths comes from src/finance.js.
 */
import { h, mount, debounce } from '../dom.js';
import * as F from '../../finance.js';
import { CONFIG } from '../../engine/config.js';
import { button, callout, numberField, pageHeader, selectField } from '../components.js';
import { FORMULAS } from '../formulas.js';
import { num, pct, rupees, times, years as yrs } from '../format.js';
import { xyChart, barChart, dataTable } from '../charts.js';

const READINGS = {
  tvm: 'Course reading: Ross, Westerfield and Jaffe, Corporate Finance, Ch. 6 (pp. 144-168). Sessions 8-10.',
  capbud: 'Course reading: Ross, Westerfield and Jaffe, Ch. 6 (pp. 144-168); HBR case Hola-Kola: The Capital Budgeting Decision. Sessions 8-10.',
  leverage: 'Course reading: Ross, Westerfield and Jaffe, Ch. 15 (pp. 405-407) and reading materials. Sessions 6-7.',
  wc: 'Course reading: Ross, Westerfield and Jaffe, Ch. 26-28 (pp. 730-734, 753-768, 786-791). Sessions 3-5.',
  coc: 'Course reading: Ross, Westerfield and Jaffe, Ch. 10 (pp. 255-284) and Ch. 12; HBR case Alex Sharpe’s Portfolio. Sessions 12-13, 17-18.',
  bonds: 'Course reading: Ross, Westerfield and Jaffe, Ch. 5 (pp. 106-123). Sessions 14-16.',
  equity: 'Course reading: Ross, Westerfield and Jaffe, Ch. 5 (pp. 106-123). Sessions 14-16.',
};

const TOOLS = [
  { id: 'tvm', label: 'Time value', title: 'Time value of money', render: renderTvm },
  { id: 'capbud', label: 'Capital budgeting', title: 'Capital budgeting', render: renderCapBud },
  { id: 'leverage', label: 'Leverage', title: 'Operating and financial leverage', render: renderLeverage },
  { id: 'wc', label: 'Working capital', title: 'Working capital and the cash cycle', render: renderWc },
  { id: 'coc', label: 'Cost of capital', title: 'Cost of capital: CAPM, Hamada and WACC', render: renderCoc },
  { id: 'bonds', label: 'Bonds', title: 'Bond valuation', render: renderBonds },
  { id: 'equity', label: 'Equity', title: 'Equity valuation: dividend discount models', render: renderEquity },
];

export function renderToolkit({ sub, params }) {
  const tool = TOOLS.find((t) => t.id === sub[0]);
  const nav = h(
    'nav',
    { class: 'tool-nav', 'aria-label': 'Calculators' },
    TOOLS.map((t) => h('a', { href: `#/toolkit/${t.id}`, 'aria-current': tool?.id === t.id ? 'page' : undefined }, t.label)),
  );
  if (!tool) {
    return h(
      'div',
      null,
      pageHeader({
        eyebrow: 'Toolkit',
        title: 'The course, as calculators',
        lede: 'Seven calculators that follow the FMFM syllabus. Each shows its formula, a worked example you can check by hand, and where to read more.',
      }),
      nav,
      h(
        'div',
        { class: 'grid grid-2 grid-3' },
        TOOLS.map((t) =>
          h('a', { class: 'card card-link stack', href: `#/toolkit/${t.id}` }, h('h3', null, t.title), h('p', { class: 'small muted' }, READINGS[t.id]), h('span', { class: 'arrow' }, 'Open →')),
        ),
      ),
    );
  }
  return h('div', null, pageHeader({ eyebrow: 'Toolkit', title: tool.title }), nav, tool.render(params));
}

/* ------------------------------------------------------------------ */
/* Shared layout                                                       */
/* ------------------------------------------------------------------ */

function layout({ intro, form, output, formula, readingKey, example }) {
  return h(
    'div',
    { class: 'split' },
    h(
      'div',
      { class: 'stack' },
      intro ? h('p', { class: 'muted' }, intro) : null,
      h('div', { class: 'card stack' }, form, example ? h('div', { class: 'btn-row' }, example) : null),
      formula ? h('div', { class: 'stack' }, h('span', { class: 'eyebrow' }, 'Formula'), h('div', { class: 'formula', html: formula })) : null,
      h('p', { class: 'chapter' }, READINGS[readingKey]),
    ),
    h('div', { class: 'stack sticky-side' }, h('span', { class: 'eyebrow' }, 'Results'), output),
  );
}

function results(rows) {
  return h(
    'div',
    { class: 'result-rows', 'aria-live': 'polite' },
    rows.map((r) => h('div', { class: `row ${r.main ? 'main' : ''}` }, h('span', null, r.label), h('span', { class: 'v' }, r.value))),
  );
}

/** Bind a set of numeric fields to a state object; returns the form element. */
function fields(state, specs, onChange) {
  return h(
    'div',
    { class: 'form-grid' },
    specs.map((sp) => {
      const display = sp.pct ? round(state[sp.key] * 100, 6) : state[sp.key];
      const field = numberField({
        label: sp.label,
        value: display,
        step: sp.step ?? 'any',
        prefix: sp.prefix,
        suffix: sp.pct ? '%' : sp.suffix,
        help: sp.help,
        onInput: (val) => {
          state[sp.key] = sp.pct ? val / 100 : val;
          onChange();
        },
      });
      if (sp.full) field.classList.add('full');
      return field;
    }),
  );
}

function round(x, d) {
  return Math.round(x * 10 ** d) / 10 ** d;
}

/** Run a computation and render results or a friendly error into `target`. */
function compute(target, fn) {
  try {
    const out = fn();
    mount(target, out);
  } catch (err) {
    if (err instanceof F.FinanceError || err instanceof RangeError) {
      mount(target, callout('warn', h('p', null, err.message)));
    } else {
      mount(target, callout('bad', h('p', null, 'Check your inputs: every field needs a number.')));
      console.error(err);
    }
  }
}

function parseFlows(text) {
  const parts = String(text)
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const flows = parts.map(Number);
  if (flows.length < 2 || flows.some((x) => !Number.isFinite(x))) {
    throw new F.FinanceError('Enter cash flows as numbers separated by commas, starting with today (usually negative).');
  }
  return flows;
}

function rebuild(holder, renderFn) {
  return () => mount(holder, renderFn());
}

/* ------------------------------------------------------------------ */
/* 1. Time value of money                                              */
/* ------------------------------------------------------------------ */

function renderTvm() {
  const holder = h('div');
  const state = { mode: 'lump', amount: 1000, rate: 0.1, n: 3, payment: 100, due: 'ordinary', growth: 0.04, principal: 1000000, years: 5, apr: 0.12, m: 12 };
  const draw = () => {
    const out = h('div');
    const recalc = debounce(() => compute(out, calc), 80);
    const modes = {
      lump: {
        specs: [
          { key: 'amount', label: 'Amount', prefix: '₹' },
          { key: 'rate', label: 'Rate per period', pct: true },
          { key: 'n', label: 'Number of periods', step: 1 },
        ],
        formula: `${FORMULAS.pvLump}<br>${FORMULAS.fvLump}`,
        example: () => Object.assign(state, { amount: 1000, rate: 0.1, n: 3 }),
        calc: () => results([
          { label: 'Present value of the amount received after n periods', value: rupees(F.pvLump(state.amount, state.rate, state.n)), main: true },
          { label: 'Future value of the amount invested today', value: rupees(F.fvLump(state.amount, state.rate, state.n)) },
        ]),
      },
      annuity: {
        specs: [
          { key: 'payment', label: 'Payment each period', prefix: '₹' },
          { key: 'rate', label: 'Rate per period', pct: true },
          { key: 'n', label: 'Number of payments', step: 1 },
        ],
        extra: () => selectField({ label: 'Timing of payments', value: state.due, options: [{ value: 'ordinary', label: 'End of each period (ordinary annuity)' }, { value: 'due', label: 'Start of each period (annuity due)' }], onChange: (val) => { state.due = val; recalc(); } }),
        formula: `${FORMULAS.pvAnnuity}<br>${FORMULAS.fvAnnuity}`,
        example: () => Object.assign(state, { payment: 100, rate: 0.08, n: 5, due: 'ordinary' }),
        calc: () => results([
          { label: 'Present value', value: rupees(F.pvAnnuity(state.payment, state.rate, state.n, state.due === 'due')), main: true },
          { label: 'Future value', value: rupees(F.fvAnnuity(state.payment, state.rate, state.n, state.due === 'due')) },
        ]),
      },
      perpetuity: {
        specs: [
          { key: 'payment', label: 'Payment next period', prefix: '₹' },
          { key: 'rate', label: 'Discount rate', pct: true },
          { key: 'growth', label: 'Growth rate (growing perpetuity)', pct: true },
        ],
        formula: FORMULAS.perpetuity,
        example: () => Object.assign(state, { payment: 50, rate: 0.1, growth: 0.04 }),
        calc: () => results([
          { label: 'Level perpetuity', value: rupees(F.pvPerpetuity(state.payment, state.rate)) },
          { label: 'Growing perpetuity', value: rupees(F.pvGrowingPerpetuity(state.payment, state.rate, state.growth)), main: true },
        ]),
      },
      emi: {
        specs: [
          { key: 'principal', label: 'Loan amount', prefix: '₹' },
          { key: 'apr', label: 'Annual interest rate', pct: true },
          { key: 'years', label: 'Term (years)' },
        ],
        formula: FORMULAS.emi,
        example: () => Object.assign(state, { principal: 1000000, apr: 0.09, years: 5 }),
        calc: () => {
          const e = F.emi(state.principal, state.apr, state.years, 12);
          const total = e * Math.round(state.years * 12);
          return results([
            { label: 'Monthly instalment (EMI)', value: rupees(e), main: true },
            { label: 'Total paid', value: rupees(total, 0) },
            { label: 'Total interest', value: rupees(total - state.principal, 0) },
          ]);
        },
      },
      ear: {
        specs: [
          { key: 'apr', label: 'Nominal annual rate (APR)', pct: true },
          { key: 'm', label: 'Compounding periods a year', step: 1, help: '12 for monthly, 4 for quarterly, 365 for daily.' },
        ],
        formula: FORMULAS.ear,
        example: () => Object.assign(state, { apr: 0.12, m: 12 }),
        calc: () => results([{ label: 'Effective annual rate', value: pct(F.effectiveAnnualRate(state.apr, state.m), 3), main: true }]),
      },
    };
    const mode = modes[state.mode];
    const calc = mode.calc;
    const form = h(
      'div',
      { class: 'stack' },
      selectField({
        label: 'What do you want to calculate?',
        value: state.mode,
        options: [
          { value: 'lump', label: 'A single amount (PV and FV)' },
          { value: 'annuity', label: 'An annuity' },
          { value: 'perpetuity', label: 'A perpetuity' },
          { value: 'emi', label: 'A loan EMI' },
          { value: 'ear', label: 'Effective annual rate' },
        ],
        onChange: (val) => {
          state.mode = val;
          rerender();
        },
      }),
      fields(state, mode.specs, recalc),
      mode.extra ? mode.extra() : null,
    );
    compute(out, calc);
    return layout({
      intro: 'A rupee today is worth more than a rupee tomorrow. Every valuation in the course, and in the game, rests on discounting.',
      form,
      output: out,
      formula: mode.formula,
      readingKey: 'tvm',
      example: button('Load worked example', { kind: 'secondary', onClick: () => { mode.example(); rerender(); } }),
    });
  };
  const rerender = rebuild(holder, draw);
  rerender();
  return holder;
}

/* ------------------------------------------------------------------ */
/* 2. Capital budgeting                                                */
/* ------------------------------------------------------------------ */

function renderCapBud() {
  const holder = h('div');
  const state = { a: '-1000, 300, 400, 500, 200', b: '-1000, 650, 350, 200, 100', rate: 0.1, finance: 0.1, reinvest: 0.12, rationing: 'Expansion, 52, 26\nSolar, 50, 24\nDigital, 50, 23.5', budget: 100 };
  const draw = () => {
    const out = h('div', { class: 'stack' });
    const recalc = debounce(() => compute(out, calc), 120);
    const flowField = (key, label) =>
      h(
        'div',
        { class: 'field full' },
        h('label', { class: 'field-label', for: `cf-${key}` }, label),
        h('input', { class: 'input mono', id: `cf-${key}`, value: state[key], inputmode: 'text', autocomplete: 'off', on: { input: (e) => { state[key] = e.target.value; recalc(); } } }),
        h('span', { class: 'field-help' }, 'Year 0, year 1, year 2 and so on, separated by commas. INR crore.'),
      );
    const form = h(
      'div',
      { class: 'form-grid' },
      flowField('a', 'Project A cash flows'),
      flowField('b', 'Project B cash flows'),
      [
        ...fields(state, [
          { key: 'rate', label: 'Discount rate (risk-adjusted)', pct: true },
          { key: 'finance', label: 'MIRR finance rate', pct: true },
          { key: 'reinvest', label: 'MIRR reinvestment rate', pct: true },
        ], recalc).childNodes,
      ],
    );
    const calc = () => {
      const A = parseFlows(state.a);
      const B = parseFlows(state.b);
      const metrics = (cf) => {
        const r = F.irr(cf);
        return {
          npv: F.npv(state.rate, cf),
          irr: r.status === 'ok' ? pct(r.value, 2) : r.status === 'multiple' ? r.values.map((x) => pct(x, 1)).join(' / ') : 'none',
          irrValue: r.status === 'ok' ? r.value : null,
          mirr: cf[0] < 0 ? pct(F.mirr(cf, state.finance, state.reinvest), 2) : 'n/a',
          pi: cf[0] < 0 ? num(F.profitabilityIndex(state.rate, cf), 3) : 'n/a',
          payback: yrs(F.payback(cf)),
          dpayback: yrs(F.discountedPayback(state.rate, cf)),
        };
      };
      const ma = metrics(A);
      const mb = metrics(B);
      const cross = F.crossoverRate(A, B);
      const best = ma.npv >= mb.npv ? 'A' : 'B';
      const higherIrr = (ma.irrValue ?? -Infinity) >= (mb.irrValue ?? -Infinity) ? 'A' : 'B';
      const table = dataTable(
        ['Measure', 'Project A', 'Project B'],
        [
          ['NPV', num(ma.npv, 2), num(mb.npv, 2)],
          ['IRR', ma.irr, mb.irr],
          ['MIRR', ma.mirr, mb.mirr],
          ['Profitability index', ma.pi, mb.pi],
          ['Payback', ma.payback, mb.payback],
          ['Discounted payback', ma.dpayback, mb.dpayback],
        ],
      );
      const maxR = Math.min(0.6, Math.max(0.3, (Math.max(ma.irrValue ?? 0, mb.irrValue ?? 0) || 0.2) * 1.6));
      const rates = Array.from({ length: 41 }, (_, i) => (i / 40) * maxR);
      const markers = [{ x: state.rate, label: `r = ${pct(state.rate)}` }];
      if (cross.status === 'ok' && cross.value > 0 && cross.value < maxR) markers.push({ x: cross.value, y: F.npv(cross.value, A), label: `Crossover ${pct(cross.value)}` });
      const chart = xyChart({
        series: [
          { name: 'Project A', points: rates.map((r) => ({ x: r, y: F.npv(r, A) })), cls: 1 },
          { name: 'Project B', points: rates.map((r) => ({ x: r, y: F.npv(r, B) })), cls: 2 },
        ],
        xFormat: (x) => pct(x, 0),
        yFormat: (y) => num(y, 0),
        zeroLine: true,
        markers,
        xTitle: 'Discount rate',
        ariaLabel: 'NPV profiles of projects A and B',
        description: 'NPV of each project across discount rates. Where a line crosses zero is its IRR; where the lines cross is the crossover rate.',
      });
      const verdict =
        best !== higherIrr
          ? callout('warn', h('p', null, `NPV and IRR disagree. Project ${best} has the higher NPV at ${pct(state.rate)}; Project ${higherIrr} has the higher IRR. If they are mutually exclusive, choose ${best}: NPV measures the value added, IRR does not.`))
          : callout('good', h('p', null, `Project ${best} has both the higher NPV and the higher IRR at ${pct(state.rate)}.`));
      return h('div', { class: 'stack' }, table, verdict, h('p', { class: 'small muted' }, cross.status === 'ok' ? `Crossover rate: ${pct(cross.value, 2)}. Below it one project has the higher NPV, above it the other.` : 'The NPV profiles do not cross at a single rate.'), chart);
    };
    compute(out, calc);

    // Capital rationing
    const ratOut = h('div');
    const ratCalc = () => {
      const projects = state.rationing
        .split('\n')
        .map((l) => l.split(',').map((x) => x.trim()))
        .filter((p) => p.length >= 3 && p[0])
        .map(([id, cost, npvVal]) => ({ id, cost: Number(cost), npv: Number(npvVal) }));
      if (!projects.length || projects.some((p) => !Number.isFinite(p.cost) || !Number.isFinite(p.npv) || p.cost <= 0)) {
        throw new F.FinanceError('Enter one project per line as: name, cost, NPV.');
      }
      const r = F.rationCapital(projects, state.budget);
      return h(
        'div',
        { class: 'stack' },
        dataTable(['Project (ranked by PI)', 'Cost', 'NPV', 'PI'], r.ranking.map((p) => [p.id, num(p.cost, 1), num(p.npv, 1), num(p.pi, 3)])),
        results([
          { label: 'PI ranking picks', value: r.piChoice.join(', ') || 'none' },
          { label: 'NPV of PI choice', value: num(r.piChoiceNpv, 1) },
          { label: 'Best combination within budget', value: r.best.ids.join(', ') || 'none', main: true },
          { label: 'NPV of best combination', value: num(r.best.npv, 1) },
        ]),
        r.best.npv > r.piChoiceNpv + 1e-9 ? callout('warn', h('p', null, 'The PI ranking is not optimal here: indivisible projects leave budget unused. Always check the best combination that fits.')) : null,
      );
    };
    const recalcRat = debounce(() => compute(ratOut, ratCalc), 120);
    compute(ratOut, ratCalc);
    const rationing = h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Capital rationing')),
      h(
        'div',
        { class: 'split' },
        h(
          'div',
          { class: 'card stack' },
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'rat' }, 'Projects: name, cost, NPV (one per line)'), h('textarea', { class: 'input', id: 'rat', rows: 5, on: { input: (e) => { state.rationing = e.target.value; recalcRat(); } } }, state.rationing)),
          fields(state, [{ key: 'budget', label: 'Capital budget', prefix: '₹', suffix: 'cr' }], recalcRat),
          h('div', { class: 'formula', html: FORMULAS.pi }),
        ),
        h('div', { class: 'stack' }, ratOut),
      ),
    );

    return h(
      'div',
      null,
      layout({
        intro: 'Compare two projects with every rule from the syllabus, and see why NPV and IRR can rank them differently.',
        form,
        output: out,
        formula: `${FORMULAS.npv}<br>${FORMULAS.mirr}`,
        readingKey: 'capbud',
        example: button('Load worked example', { kind: 'secondary', onClick: () => { Object.assign(state, { a: '-1000, 300, 400, 500, 200', b: '-1000, 650, 350, 200, 100', rate: 0.1, finance: 0.1, reinvest: 0.12 }); rerender(); } }),
      }),
      rationing,
    );
  };
  const rerender = rebuild(holder, draw);
  rerender();
  return holder;
}

/* ------------------------------------------------------------------ */
/* 3. Leverage                                                         */
/* ------------------------------------------------------------------ */

function renderLeverage() {
  const holder = h('div');
  const state = { sales: 1000, vc: 620, fc: 220, interest: 40, tax: 0.25, shares: 10, aI: 0, aN: 20, bI: 30, bN: 10 };
  const draw = () => {
    const out = h('div', { class: 'stack' });
    const recalc = debounce(() => compute(out, calc), 80);
    const form = h(
      'div',
      { class: 'stack' },
      fields(state, [
        { key: 'sales', label: 'Sales', prefix: '₹', suffix: 'cr' },
        { key: 'vc', label: 'Variable costs', prefix: '₹', suffix: 'cr' },
        { key: 'fc', label: 'Fixed costs', prefix: '₹', suffix: 'cr' },
        { key: 'interest', label: 'Interest', prefix: '₹', suffix: 'cr' },
        { key: 'tax', label: 'Tax rate', pct: true },
        { key: 'shares', label: 'Shares outstanding', suffix: 'crore' },
      ], recalc),
      h('h3', null, 'EBIT-EPS analysis: two financing plans'),
      fields(state, [
        { key: 'aI', label: 'Plan A interest', prefix: '₹', suffix: 'cr' },
        { key: 'aN', label: 'Plan A shares', suffix: 'crore' },
        { key: 'bI', label: 'Plan B interest', prefix: '₹', suffix: 'cr' },
        { key: 'bN', label: 'Plan B shares', suffix: 'crore' },
      ], recalc),
    );
    const calc = () => {
      const ebit = state.sales - state.vc - state.fc;
      const dolV = F.dol(state.sales, state.vc, state.fc);
      const dflV = F.dfl(ebit, state.interest);
      const star = F.ebitEpsIndifference({ interest: state.aI, shares: state.aN }, { interest: state.bI, shares: state.bN });
      const xMax = Math.max(ebit * 1.5, star * 2, 10);
      const pts = (plan) => Array.from({ length: 21 }, (_, i) => {
        const e = (i / 20) * xMax;
        return { x: e, y: F.eps(e, plan.interest, state.tax, plan.shares) };
      });
      return h(
        'div',
        { class: 'stack' },
        results([
          { label: 'Contribution', value: num(state.sales - state.vc, 1) },
          { label: 'EBIT', value: num(ebit, 1) },
          { label: 'Degree of operating leverage', value: times(dolV), main: true },
          { label: 'Degree of financial leverage', value: times(dflV) },
          { label: 'Degree of combined leverage', value: times(dolV * dflV) },
          { label: 'EPS (INR)', value: rupees(F.eps(ebit, state.interest, state.tax, state.shares)) },
        ]),
        h('p', { class: 'small muted' }, `A 10% rise in sales lifts EBIT by about ${num(dolV * 10, 1)}% and EPS by about ${num(dolV * dflV * 10, 1)}%. The same is true in reverse when sales fall.`),
        results([{ label: 'Indifference EBIT (plans A and B give the same EPS)', value: `₹${num(star, 1)} cr`, main: true }]),
        xyChart({
          series: [
            { name: 'Plan A', points: pts({ interest: state.aI, shares: state.aN }), cls: 1 },
            { name: 'Plan B', points: pts({ interest: state.bI, shares: state.bN }), cls: 2 },
          ],
          xFormat: (x) => num(x, 0),
          yFormat: (y) => num(y, 1),
          zeroLine: true,
          markers: [{ x: star, y: F.eps(star, state.aI, state.tax, state.aN), label: `EBIT* ${num(star, 0)}` }],
          xTitle: 'EBIT (INR crore)',
          ariaLabel: 'EPS against EBIT for two financing plans',
          description: 'Above the indifference EBIT, the plan with more debt gives higher EPS; below it, the plan with more equity does.',
        }),
      );
    };
    compute(out, calc);
    return layout({
      intro: 'Fixed costs magnify the effect of sales on operating profit; fixed interest magnifies the effect of operating profit on EPS.',
      form,
      output: out,
      formula: `${FORMULAS.dol}<br>${FORMULAS.ebitEps}`,
      readingKey: 'leverage',
      example: button('Load worked example', { kind: 'secondary', onClick: () => { Object.assign(state, { sales: 1000, vc: 620, fc: 220, interest: 40, tax: 0.25, shares: 10, aI: 0, aN: 20, bI: 30, bN: 10 }); rerender(); } }),
    });
  };
  const rerender = rebuild(holder, draw);
  rerender();
  return holder;
}

/* ------------------------------------------------------------------ */
/* 4. Working capital                                                  */
/* ------------------------------------------------------------------ */

function renderWc() {
  const holder = h('div');
  const umiam = { revenue: 1000, cogs: 600, receivables: 82.19, inventory: 73.97, payables: 65.75 };
  const state = { ...umiam };
  const draw = () => {
    const out = h('div', { class: 'stack' });
    const recalc = debounce(() => compute(out, calc), 80);
    const form = fields(state, [
      { key: 'revenue', label: 'Annual revenue', prefix: '₹', suffix: 'cr' },
      { key: 'cogs', label: 'Cost of goods sold', prefix: '₹', suffix: 'cr' },
      { key: 'receivables', label: 'Receivables', prefix: '₹', suffix: 'cr' },
      { key: 'inventory', label: 'Inventory', prefix: '₹', suffix: 'cr' },
      { key: 'payables', label: 'Payables', prefix: '₹', suffix: 'cr' },
    ], recalc);
    const calc = () => {
      const dsoV = F.dso(state.receivables, state.revenue);
      const dioV = F.dio(state.inventory, state.cogs);
      const dpoV = F.dpo(state.payables, state.cogs);
      const ccc = F.cashConversionCycle(dioV, dsoV, dpoV);
      return h(
        'div',
        { class: 'stack' },
        results([
          { label: 'Days sales outstanding (DSO)', value: `${num(dsoV, 1)} days` },
          { label: 'Days inventory outstanding (DIO)', value: `${num(dioV, 1)} days` },
          { label: 'Days payables outstanding (DPO)', value: `${num(dpoV, 1)} days` },
          { label: 'Operating cycle', value: `${num(F.operatingCycle(dioV, dsoV), 1)} days` },
          { label: 'Cash conversion cycle', value: `${num(ccc, 1)} days`, main: true },
          { label: 'Net working capital', value: `₹${num(state.receivables + state.inventory - state.payables, 1)} cr` },
        ]),
        barChart({
          items: [
            { label: 'Inventory days', value: dioV },
            { label: 'Receivable days', value: dsoV },
            { label: 'Payable days', value: -dpoV },
            { label: 'Cash cycle', value: ccc },
          ],
          format: (v) => `${num(v, 0)} d`,
          highlight: 'Cash cycle',
          ariaLabel: 'Cash conversion cycle components',
          description: 'Inventory and receivable days add to the cycle; payable days subtract from it.',
        }),
        h('p', { class: 'small muted' }, `Each day cut from the cycle frees about ₹${num(state.revenue / 365, 2)} cr of cash at this revenue (ignoring the cost difference between revenue and COGS).`),
      );
    };
    compute(out, calc);
    return layout({
      intro: 'How long cash is tied up between paying suppliers and collecting from customers. The defaults are Umiam Beverages’ FY26 balances.',
      form,
      output: out,
      formula: FORMULAS.wc,
      readingKey: 'wc',
      example: button('Load Umiam FY26', { kind: 'secondary', onClick: () => { Object.assign(state, umiam); rerender(); } }),
    });
  };
  const rerender = rebuild(holder, draw);
  rerender();
  return holder;
}

/* ------------------------------------------------------------------ */
/* 5. Cost of capital                                                  */
/* ------------------------------------------------------------------ */

function renderCoc() {
  const holder = h('div');
  const market = { rf: CONFIG.market.riskFree, erp: CONFIG.market.erp, betaU: 0.8, debt: 300, equity: 1000, tax: CONFIG.market.taxRate, kd: 0.0782 };
  const state = { ...market };
  const draw = () => {
    const out = h('div', { class: 'stack' });
    const recalc = debounce(() => compute(out, calc), 80);
    const form = fields(state, [
      { key: 'rf', label: 'Risk-free rate', pct: true, help: 'India 10-year G-sec: 7.12% on 5 Nov 2026.' },
      { key: 'erp', label: 'Equity risk premium', pct: true, help: 'Damodaran, India total ERP, Jan 2026: 7.08%.' },
      { key: 'betaU', label: 'Unlevered (asset) beta', step: 0.05 },
      { key: 'tax', label: 'Tax rate', pct: true },
      { key: 'debt', label: 'Debt (market value)', prefix: '₹', suffix: 'cr' },
      { key: 'equity', label: 'Equity (market value)', prefix: '₹', suffix: 'cr' },
      { key: 'kd', label: 'Pre-tax cost of debt', pct: true },
    ], recalc);
    const calc = () => {
      const de = state.debt / state.equity;
      const betaL = F.leverBeta(state.betaU, state.tax, de);
      const ke = F.capm(state.rf, betaL, state.erp);
      const w = F.wacc({ equityValue: state.equity, debtValue: state.debt, costOfEquity: ke, preTaxCostOfDebt: state.kd, taxRate: state.tax });
      const ds = Array.from({ length: 21 }, (_, i) => i * 0.05);
      return h(
        'div',
        { class: 'stack' },
        results([
          { label: 'Debt-to-equity', value: num(de, 3) },
          { label: 'Levered beta', value: num(betaL, 3) },
          { label: 'Cost of equity', value: pct(ke, 2) },
          { label: 'After-tax cost of debt', value: pct(F.afterTaxCostOfDebt(state.kd, state.tax), 2) },
          { label: 'WACC', value: pct(w, 2), main: true },
        ]),
        xyChart({
          series: [{ name: 'Cost of equity', points: ds.map((d) => ({ x: d, y: F.capm(state.rf, F.leverBeta(state.betaU, state.tax, d), state.erp) })), cls: 2 }],
          xFormat: (x) => num(x, 1),
          yFormat: (y) => pct(y, 0),
          markers: [{ x: Math.min(de, 1), y: ke, label: `Now: ${pct(ke, 1)}` }],
          xTitle: 'Debt-to-equity',
          ariaLabel: 'Cost of equity rises with leverage',
          description: 'Holding the cost of debt fixed, Hamada’s formula raises beta and the cost of equity in a straight line as debt-to-equity rises.',
        }),
        h('p', { class: 'small muted' }, 'In the game, the cost of debt also rises with leverage through the credit rating, and distress costs grow, so WACC is U-shaped: that is where the value-maximising capital structure sits.'),
      );
    };
    compute(out, calc);
    return layout({
      intro: 'The hurdle rate for investments and the discount rate for valuation. Defaults are the market inputs used in the game.',
      form,
      output: out,
      formula: `${FORMULAS.capm}<br>${FORMULAS.wacc}`,
      readingKey: 'coc',
      example: button('Load worked example', { kind: 'secondary', onClick: () => { Object.assign(state, { rf: 0.07, erp: 0.07, betaU: 0.8, tax: 0.25, debt: 100, equity: 200, kd: 0.09 }); rerender(); } }),
    });
  };
  const rerender = rebuild(holder, draw);
  rerender();
  return holder;
}

/* ------------------------------------------------------------------ */
/* 6. Bonds                                                            */
/* ------------------------------------------------------------------ */

function renderBonds() {
  const holder = h('div');
  const state = { mode: 'price', face: 100, coupon: 0.08, years: 5, frequency: '1', ytm: 0.1, price: 92.42 };
  const draw = () => {
    const out = h('div', { class: 'stack' });
    const recalc = debounce(() => compute(out, calc), 80);
    const form = h(
      'div',
      { class: 'stack' },
      selectField({ label: 'I know the', value: state.mode, options: [{ value: 'price', label: 'Yield: find the price' }, { value: 'ytm', label: 'Price: find the yield' }], onChange: (val) => { state.mode = val; rerender(); } }),
      fields(state, [
        { key: 'face', label: 'Face value', prefix: '₹' },
        { key: 'coupon', label: 'Coupon rate (annual)', pct: true },
        { key: 'years', label: 'Years to maturity' },
        state.mode === 'price' ? { key: 'ytm', label: 'Yield to maturity (annual)', pct: true } : { key: 'price', label: 'Market price', prefix: '₹' },
      ], recalc),
      selectField({ label: 'Coupon frequency', value: state.frequency, options: [{ value: '1', label: 'Annual' }, { value: '2', label: 'Semi-annual (Indian G-secs)' }], onChange: (val) => { state.frequency = val; recalc(); } }),
    );
    const calc = () => {
      const p = { face: state.face, couponRate: state.coupon, years: state.years, frequency: Number(state.frequency) };
      const ytm = state.mode === 'price' ? state.ytm : F.bondYtm({ ...p, price: state.price });
      const price = state.mode === 'price' ? F.bondPrice({ ...p, ytm }) : state.price;
      const mac = F.macaulayDuration({ ...p, ytm });
      const mod = F.modifiedDuration({ ...p, ytm });
      const ys = Array.from({ length: 41 }, (_, i) => 0.0025 + i * 0.005);
      return h(
        'div',
        { class: 'stack' },
        results([
          { label: 'Price', value: rupees(price), main: state.mode === 'price' },
          { label: 'Yield to maturity', value: pct(ytm, 3), main: state.mode === 'ytm' },
          { label: 'Current yield', value: pct(F.currentYield({ price, face: state.face, couponRate: state.coupon }), 2) },
          { label: 'Macaulay duration', value: `${num(mac, 3)} years` },
          { label: 'Modified duration', value: num(mod, 3) },
          { label: 'Price change for +1% yield (approx.)', value: `${num(-mod, 2)}%` },
        ]),
        xyChart({
          series: [{ name: 'Price', points: ys.map((y) => ({ x: y, y: F.bondPrice({ ...p, ytm: y }) })), cls: 1 }],
          xFormat: (x) => pct(x, 0),
          yFormat: (y) => num(y, 0),
          markers: [{ x: ytm, y: price, label: `${rupees(price)} at ${pct(ytm, 1)}` }],
          xTitle: 'Yield to maturity',
          ariaLabel: 'Bond price against yield',
          description: 'Bond prices fall as yields rise, along a convex curve.',
        }),
      );
    };
    compute(out, calc);
    return layout({
      intro: 'Price a bond from its yield, or find the yield from its price. Duration measures how sensitive the price is to interest rates.',
      form,
      output: out,
      formula: `${FORMULAS.bond}<br>${FORMULAS.duration}`,
      readingKey: 'bonds',
      example: button('Load worked example', { kind: 'secondary', onClick: () => { Object.assign(state, { mode: 'price', face: 100, coupon: 0.08, years: 5, frequency: '1', ytm: 0.1 }); rerender(); } }),
    });
  };
  const rerender = rebuild(holder, draw);
  rerender();
  return holder;
}

/* ------------------------------------------------------------------ */
/* 7. Equity                                                           */
/* ------------------------------------------------------------------ */

function renderEquity() {
  const holder = h('div');
  const state = { d1: 2.1, r: 0.12, g: 0.05, price: 30, payout: 0.4, d0: 2, gHigh: 0.15, nHigh: 3, gStable: 0.05 };
  const draw = () => {
    const out = h('div', { class: 'stack' });
    const recalc = debounce(() => compute(out, calc), 80);
    const form = h(
      'div',
      { class: 'stack' },
      h('h3', null, 'Constant growth (Gordon)'),
      fields(state, [
        { key: 'd1', label: 'Dividend next year (D1)', prefix: '₹' },
        { key: 'r', label: 'Required return', pct: true },
        { key: 'g', label: 'Growth rate', pct: true },
        { key: 'payout', label: 'Payout ratio (for P/E)', pct: true },
        { key: 'price', label: 'Market price (for implied growth)', prefix: '₹' },
      ], recalc),
      h('h3', null, 'Two-stage growth'),
      fields(state, [
        { key: 'd0', label: 'Dividend just paid (D0)', prefix: '₹' },
        { key: 'gHigh', label: 'High growth rate', pct: true },
        { key: 'nHigh', label: 'Years of high growth', step: 1 },
        { key: 'gStable', label: 'Stable growth rate', pct: true },
      ], recalc),
    );
    const calc = () => {
      const p0 = F.gordonPrice(state.d1, state.r, state.g);
      const pe = F.impliedPe(state.payout, state.r, state.g);
      const ts = F.twoStageDdm({ d0: state.d0, gHigh: state.gHigh, nHigh: state.nHigh, gStable: state.gStable, requiredReturn: state.r });
      return results([
        { label: 'Gordon price', value: rupees(p0), main: true },
        { label: 'Growth implied by the market price', value: pct(F.impliedGrowth(state.price, state.d1, state.r), 2) },
        { label: 'Justified P/E, leading', value: `${num(pe.leading, 2)}x` },
        { label: 'Justified P/E, trailing', value: `${num(pe.trailing, 2)}x` },
        { label: 'Two-stage price', value: rupees(ts.price), main: true },
        { label: 'of which PV of high-growth dividends', value: rupees(ts.pvHighGrowth) },
        { label: 'of which PV of terminal value', value: rupees(ts.pvTerminal) },
      ]);
    };
    compute(out, calc);
    return layout({
      intro: 'A share is worth the present value of its future dividends. The two-stage model lets growth fade to a sustainable rate.',
      form,
      output: out,
      formula: `${FORMULAS.gordon}<br>${FORMULAS.twoStage}`,
      readingKey: 'equity',
      example: button('Load worked example', { kind: 'secondary', onClick: () => { Object.assign(state, { d1: 2.1, r: 0.12, g: 0.05, price: 30, payout: 0.4, d0: 2, gHigh: 0.15, nHigh: 3, gStable: 0.05 }); rerender(); } }),
    });
  };
  const rerender = rebuild(holder, draw);
  rerender();
  return holder;
}
