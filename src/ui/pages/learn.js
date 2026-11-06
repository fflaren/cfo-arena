/** How it works: the model, every parameter and source, scoring, validation and limitations. */
import { h, mount } from '../dom.js';
import { callout, pageHeader, sectionHead, button } from '../components.js';
import { FORMULAS } from '../formulas.js';
import { pct, num } from '../format.js';
import { barChart, dataTable } from '../charts.js';
import { CONFIG, PARAMETERS, SOURCES } from '../../engine/config.js';
import { RATING_TABLE } from '../../finance.js';
import { EVENT_DECK } from '../../engine/events.js';
import { PROJECT_TEMPLATES, SCHEDULE } from '../../engine/projects.js';
import { BOTS, runValidationAsync } from '../../engine/bots.js';
import { GRADING_RULES } from '../../engine/grading.js';

/** Results of `node tests/run-validation.js 200 5`, recorded when this version was built. */
const RECORDED = {
  seeds: 200,
  years: 5,
  rows: [
    { key: 'textbook', mean: 0.0138, meanTsr: 0.1597, bankruptRate: 0 },
    { key: 'empire', mean: 0.012, meanTsr: 0.166, bankruptRate: 0 },
    { key: 'waccTrap', mean: 0.0117, meanTsr: 0.1645, bankruptRate: 0 },
    { key: 'handsOff', mean: -0.0163, meanTsr: 0.116, bankruptRate: 0 },
    { key: 'hoarder', mean: -0.0179, meanTsr: 0.1117, bankruptRate: 0 },
    { key: 'leverage', mean: -0.0795, meanTsr: 0.0595, bankruptRate: 0 },
  ],
  winRate: { empire: 0.64, waccTrap: 0.76, leverage: 1, handsOff: 1, hoarder: 1 },
  luckShare: 0.6224,
  skillShareWithinScenario: 0.5134,
};

function sourceLink(key) {
  const src = SOURCES[key];
  if (!src) return '';
  return src.url ? h('a', { href: src.url, target: '_blank', rel: 'noopener noreferrer' }, src.label) : src.label;
}

function paramValue(p) {
  if (typeof p.value === 'number' && p.unit.includes('%')) return `${num(p.value * 100, 2)}%${p.unit.replace('%', '').trim() ? ` ${p.unit.replace('%', '').trim()}` : ''}`;
  if (typeof p.value === 'number') return `${num(p.value, p.value < 10 ? 2 : 0)} ${p.unit}`.trim();
  return p.value;
}

function validationView(res) {
  const rows = res.rows.map((r) => [
    BOTS[r.key].name,
    `${r.mean >= 0 ? '+' : '−'}${pct(Math.abs(r.mean), 2)}`,
    pct(r.meanTsr, 2),
    pct(r.bankruptRate, 0),
    r.key === 'textbook' ? 'n/a' : pct(res.winRate[r.key], 0),
  ]);
  return h(
    'div',
    { class: 'stack' },
    barChart({
      items: res.rows.map((r) => ({ label: BOTS[r.key].name, value: r.mean })),
      format: (x) => `${x >= 0 ? '+' : '−'}${pct(Math.abs(x), 2)}`,
      highlight: 'Textbook CFO',
      ariaLabel: 'Mean risk-adjusted excess return by strategy',
      description: `Average across ${res.seeds} scenarios of ${res.years} years each.`,
    }),
    dataTable(['Strategy', 'Mean alpha', 'Mean TSR', 'Bankrupt', 'Textbook CFO wins'], rows),
    h(
      'p',
      { class: 'small muted' },
      `Across all scenarios, ${pct(res.luckShare, 0)} of the variation in scores comes from the scenario itself (luck). But luck is shared in classroom mode, because everyone plays the same code. Among players on the same scenario, strategy explains ${pct(res.skillShareWithinScenario, 0)} of the differences; the rest is project-level luck.`,
    ),
    h('p', { class: 'small muted' }, 'Note the Empire builder’s higher raw TSR but lower alpha: risky projects raise expected returns because shareholders demand more for bearing more risk. Alpha strips that out.'),
  );
}

export function renderLearn() {
  const live = h('div', { class: 'stack' });
  const runBtn = button('Run the validation in your browser (30 scenarios)', {
    kind: 'secondary',
    iconName: 'refresh',
    onClick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const progress = h('progress', { max: '100', value: '0', 'aria-label': 'Validation progress' });
      mount(live, h('p', { class: 'small muted' }, 'Playing every bot through 30 scenarios…'), progress);
      const res = await runValidationAsync({ seeds: 30, years: 5, prefix: 'WEB', onProgress: (f) => { progress.value = String(Math.round(f * 100)); } });
      mount(live, h('h3', null, 'Your live run: 30 scenarios'), validationView(res));
      btn.disabled = false;
    },
  });

  const projects = Object.values(PROJECT_TEMPLATES);
  const yearOf = (id) => SCHEDULE.findIndex((y) => y.projects.includes(id)) + 1;

  return h(
    'div',
    null,
    pageHeader({
      eyebrow: 'How it works',
      title: 'Every number, explained',
      lede: 'CFO Arena is a small, transparent corporate-finance model. Everything below is generated from the same code the game runs, so it cannot drift out of date.',
    }),
    h(
      'nav',
      { class: 'tool-nav', 'aria-label': 'On this page' },
      [['year', 'A year'], ['valuation', 'Valuation'], ['capital', 'Capital structure'], ['scoring', 'Scoring'], ['params', 'Parameters'], ['content', 'Projects and events'], ['validation', 'Validation'], ['limits', 'Limitations'], ['syllabus', 'Syllabus map']].map(([id, label]) => h('a', { href: `#/learn`, on: { click: (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); } } }, label)),
    ),

    h(
      'section',
      { class: 'section', id: 'year' },
      sectionHead('01', 'What happens in a year'),
      h(
        'ol',
        { class: 'stack' },
        h('li', null, h('strong', null, 'Start of year. '), 'Borrowing, repayments and share issues happen; accepted projects are paid for. The market’s start-of-year (pro forma) valuation sets this year’s interest rate from the synthetic credit rating, and the return shareholders require.'),
        h('li', null, h('strong', null, 'During the year. '), `Demand grows at the expected rate (${pct(0.09, 0)} in FY27, fading to ${pct(CONFIG.valuation.terminalGrowth, 0)} by FY36) plus events plus random variation (standard deviation ${pct(CONFIG.operations.growthNoiseSd, 0)}). Your working-capital policy sets sales, bad debts, supplier costs and balances. Projects deliver their expected cash flows times a project-specific luck factor, and high-beta projects swing more with demand surprises. Cash earns the risk-free rate.`),
        h('li', null, h('strong', null, 'End of year. '), 'Dividends are paid from profit. If cash falls below your buffer, an emergency loan tops it up at the normal rate plus 4 points, within the lenders’ limit of 5x EBITDA. If cash is still negative, the company is bankrupt.'),
        h('li', null, h('strong', null, 'Valuation. '), 'The market revalues the company from the year-end position. Events depend only on the scenario code, never on your decisions.'),
      ),
    ),

    h(
      'section',
      { class: 'section', id: 'valuation' },
      sectionHead('02', 'How the market values Umiam'),
      h('p', null, 'Enterprise value is the sum of the base business, valued by discounted free cash flow, and each project, valued separately at its own risk-adjusted rate (value additivity). Equity value is enterprise value minus net debt; the share price is equity value divided by shares, adjusted for any sentiment effect.'),
      h('div', { class: 'formula', html: FORMULAS.fcff }),
      h('div', { class: 'formula', html: FORMULAS.terminal }),
      h('div', { class: 'formula', html: FORMULAS.capm }),
      h('div', { class: 'formula', html: FORMULAS.wacc }),
      h('p', { class: 'muted' }, 'The explicit forecast runs to FY36, when growth reaches its long-run 5%, and assumes your current policies continue. Because the market expects the same fading growth path that the game delivers, prices are unbiased: only surprises and your decisions move them. Equity value and WACC depend on each other, so the model iterates until they agree (to within 0.00001%).'),
      callout('', h('p', null, h('strong', null, 'Why each project has its own rate. '), 'A project’s cash flows are discounted at a WACC built from its own asset beta, relevered at the company’s capital structure. So accepting a project changes the share price by roughly its NPV at that risk-adjusted rate, not at the company WACC. That is the WACC trap the game sets.')),
    ),

    h(
      'section',
      { class: 'section', id: 'capital' },
      sectionHead('03', 'Capital structure: tax shields against distress'),
      h('p', null, 'Debt is tax-deductible, which lowers WACC. As debt rises, interest coverage falls and the synthetic rating drops, raising the cost of debt (Damodaran’s spreads, January 2026). Beta rises with leverage (Hamada), and expected costs of financial distress grow. The result is a U-shaped cost of capital and an interior optimum: the trade-off theory.'),
      dataTable(
        ['Interest coverage above', 'Rating', 'Default spread', 'Expected distress cost (% of revenue)'],
        RATING_TABLE.map((r) => [Number.isFinite(r.above) ? `${num(r.above, 2)}x` : 'below 0.20x', r.rating, pct(r.spread, 2), pct(CONFIG.financing.distressCostByRating[r.rating] ?? 0, 2)]),
      ),
      h('p', { class: 'small muted' }, 'Source: ', sourceLink('ratings'), '. Distress costs are a game assumption.'),
    ),

    h(
      'section',
      { class: 'section', id: 'scoring' },
      sectionHead('04', 'Scoring'),
      h('div', { class: 'formula', html: FORMULAS.alpha }),
      h('p', null, 'Total shareholder return reinvests dividends in the shares. The required return each year is the cost of equity at the start of that year, after your financing and project decisions, using the value-weighted asset beta of the business and its projects. Taking extra risk raises your hurdle, so only value creation produces a positive alpha.'),
      h('div', { class: 'formula', html: FORMULAS.eva }),
      h('h3', null, 'The value bridge'),
      h('p', null, 'Each year is re-simulated five times with the same events: with neutral decisions (last year’s working capital, no projects, no financing change, last year’s payout), then adding your working capital, investment, financing and dividend decisions in turn. The differences in share price plus dividend are the bars of the waterfall. They add up exactly to the actual change, but the split depends on the order.'),
      h('h3', null, 'Report card'),
      h('ul', null, Object.entries(GRADING_RULES).map(([k, v]) => h('li', null, h('strong', null, `${{ investment: 'Investment', workingCapital: 'Working capital', financing: 'Financing', dividend: 'Dividend' }[k]}: `), v))),
      h('p', { class: 'small muted' }, 'Benchmarks are computed when you made each decision, with the information you had, never with hindsight about the year’s events.'),
    ),

    h(
      'section',
      { class: 'section', id: 'params' },
      sectionHead('05', 'Every parameter'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'ledger' },
          h('thead', null, h('tr', null, h('th', null, 'Group'), h('th', null, 'Parameter'), h('th', null, 'Value'), h('th', null, 'Basis'))),
          h(
            'tbody',
            null,
            PARAMETERS.map((p) =>
              h(
                'tr',
                null,
                h('td', { class: 'faint' }, p.group),
                h('td', null, p.name, p.note ? h('div', { class: 'tiny faint' }, p.note) : null),
                h('td', null, paramValue(p)),
                h('td', null, p.basis === 'source' ? h('span', null, h('span', { class: 'badge good' }, 'Source'), h('div', { class: 'tiny' }, sourceLink(p.source))) : p.basis === 'theory' ? h('span', { class: 'badge brand' }, 'Theory') : h('span', { class: 'badge ok' }, 'Game assumption')),
              ),
            ),
          ),
        ),
      ),
    ),

    h(
      'section',
      { class: 'section', id: 'content' },
      sectionHead('06', 'Projects and events'),
      h('p', null, 'Each project is built from a target IRR, so its teaching role holds whatever the scenario size. In each scenario every project in a year, and that year’s budget, is scaled by the same random factor (85% to 115%), which leaves IRRs unchanged.'),
      dataTable(
        ['Project', 'Year', 'Cost (INR cr)', 'Life', 'Asset beta', 'IRR', 'What it teaches'],
        projects.map((p) => [p.name, String(yearOf(p.id)), num(p.cost, 0), `${p.life} yrs`, num(p.betaU, 2), p.irr ? pct(p.irr, 1) : 'varies', p.lesson]),
      ),
      h('p', { class: 'small muted' }, 'Year 2 pairs two mutually exclusive bottling lines; year 3 has a capital budget of INR 150 crore (before scaling). The quick 3-year game uses years 1 to 3.'),
      dataTable(
        ['Event', 'Chance a year', 'Effect'],
        EVENT_DECK.map((e) => [e.name, pct(e.p, 0), Object.entries(e.effects).map(([k, v]) => effectText(k, v)).join('; ')]),
      ),
      h('p', { class: 'small muted' }, 'At most two events a year. The deck is balanced so that, on average, events neither help nor hurt.'),
    ),

    h(
      'section',
      { class: 'section', id: 'validation' },
      sectionHead('07', 'Does good finance win? Model validation'),
      h('p', null, 'If the model is built right, sound corporate finance should beat the alternatives on average. Six strategies play the same scenarios:'),
      h('ul', null, Object.values(BOTS).map((b) => h('li', null, h('strong', null, `${b.name}: `), b.description))),
      h('h3', null, `Recorded run: ${RECORDED.seeds} scenarios of ${RECORDED.years} years`),
      validationView(RECORDED),
      h('div', { class: 'btn-row' }, runBtn),
      live,
    ),

    h(
      'section',
      { class: 'section', id: 'limits' },
      sectionHead('08', 'Limitations'),
      h(
        'ul',
        { class: 'stack' },
        h('li', null, 'Umiam Beverages is fictional. Game parameters are chosen to be plausible for an Indian packaged-beverage company and to teach the lessons, not estimated from data.'),
        h('li', null, 'Damodaran’s equity risk premium is estimated in US-dollar terms and is combined here with an INR risk-free rate. This is common classroom practice, not a precise estimate.'),
        h('li', null, 'The market is assumed to price the company exactly as the model does (an efficient market with unbiased expectations). Real prices also move with sentiment and information the model does not have.'),
        h('li', null, 'Dividend-cut signalling and the equity-issue announcement drop are behavioural assumptions. Taxes are corporate only; personal taxes on dividends and interest are ignored.'),
        h('li', null, 'Losses earn no tax credit in the year they occur. Emergency loans are taken at year end, so an intra-year cash shortfall carries no interest that year.'),
        h('li', null, 'The value bridge is an approximate attribution: changing the order of the steps changes the split.'),
        h('li', null, 'Derivatives (session 11) and the primary-market mechanics of IPOs are not modelled.'),
      ),
    ),

    h(
      'section',
      { class: 'section', id: 'syllabus' },
      sectionHead('09', 'Where the syllabus appears'),
      dataTable(
        ['Sessions', 'Topic', 'In CFO Arena'],
        [
          ['1-2', 'Finance goals, wealth maximisation, the four decisions', 'Scored on shareholder wealth (alpha), not profit; four decision screens a year'],
          ['3-5', 'Working capital, operating cycle, cash, receivables, inventory', 'Working-capital screen, cash conversion cycle, cash buffer; toolkit calculator'],
          ['6-7', 'Operating and financial leverage', 'Automation project raises operating leverage; borrowing raises financial leverage; EBIT-EPS calculator'],
          ['8-10', 'Time value, capital budgeting, conflicts, rationing', 'Project screen with NPV, IRR, MIRR, PI, payback; IRR-NPV conflict; capital rationing'],
          ['11', 'Primary, secondary and derivative markets', 'Share issues (primary market) and the share price (secondary market)'],
          ['12-13', 'CAPM and risk-return', 'Cost of equity, project betas, Hamada; alpha scoring'],
          ['14-16', 'Bond and equity valuation', 'Credit ratings and debt pricing; DCF share price; bond and DDM calculators'],
          ['17-18', 'Cost of capital', 'Live WACC, WACC curve, the WACC trap'],
        ],
      ),
    ),

    h(
      'section',
      { class: 'section' },
      sectionHead('10', 'Sources and credits'),
      h('ul', null, Object.keys(SOURCES).map((k) => h('li', null, sourceLink(k)))),
      h('p', { class: 'small muted' }, 'Textbook: Ross, Westerfield and Jaffe, Corporate Finance. Built for Financial Management and Financial Market, IIM Shillong PGP 2026-28. Charts, QR codes and every calculation are built into the site; nothing you enter leaves your browser.'),
    ),
  );
}

function effectText(key, value) {
  const sign = value > 0 ? '+' : '−';
  const abs = Math.abs(value);
  switch (key) {
    case 'demand':
      return `demand growth ${sign}${pct(abs, 0)} (lasting)`;
    case 'price':
      return `prices ${sign}${pct(abs, 0)} this year`;
    case 'revenue':
      return `volume ${sign}${pct(abs, 0)} this year`;
    case 'vc':
      return `variable costs ${sign}${num(abs * 100, 1)} points of revenue this year`;
    case 'rf':
      return `risk-free rate ${sign}${num(abs * 100, 2)} points (lasting)`;
    case 'fixedPct':
      return `fixed costs ${sign}${pct(abs, 0)} (lasting)`;
    case 'oneOff':
      return value > 0 ? `one-time cost of INR ${num(abs, 0)} cr per INR 1,000 cr of revenue` : `one-time gain of INR ${num(abs, 0)} cr per INR 1,000 cr of revenue`;
    default:
      return `${key} ${value}`;
  }
}
