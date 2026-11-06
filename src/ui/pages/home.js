import { h } from '../dom.js';
import { icon } from '../icons.js';
import { button, sectionHead } from '../components.js';
import { crore, pct, rupees } from '../format.js';
import { openingState } from '../../engine/model.js';
import { loadGame } from '../store.js';

let cachedOpening = null;
function opening() {
  if (!cachedOpening) cachedOpening = openingState();
  return cachedOpening;
}

const DECISIONS = [
  { no: '01', icon: 'cycle', title: 'Working capital', text: 'Set credit terms, inventory and supplier payments. Watch the cash conversion cycle and the trade-off between sales, bad debts and cash tied up.', sessions: 'Sessions 3-5' },
  { no: '02', icon: 'factory', title: 'Investment', text: 'Choose from three projects a year using NPV, IRR, MIRR and the profitability index. Discount each at its own risk, under budgets and mutually exclusive choices.', sessions: 'Sessions 8-10' },
  { no: '03', icon: 'bank', title: 'Financing', text: 'Borrow, repay or issue shares. Your rating, cost of debt, beta and WACC move live, so you can find the value-maximising capital structure.', sessions: 'Sessions 6-7, 12-13, 17-18' },
  { no: '04', icon: 'coins', title: 'Dividend', text: 'Set the payout. Dividends are mostly a funding question, until a sharp cut tells the market something you did not intend.', sessions: 'Sessions 1-2, 14-16' },
];

export function renderHome() {
  const s = opening();
  const v = s.valuation;
  const inc = s.statements.income;
  const saved = loadGame();
  const savedLabel = saved ? `Continue: year ${saved.decisions.length + 1} of ${saved.years}` : null;

  const cover = h(
    'section',
    { class: 'cover' },
    h('div', { class: 'cover-meta' }, h('span', null, 'Annual simulation'), h('span', null, 'FY27 to FY31'), h('span', null, 'Financial Management and Financial Market')),
    h(
      'div',
      { class: 'cover-grid' },
      h(
        'div',
        { class: 'stack' },
        h('h1', { class: 'page-title', tabindex: '-1' }, 'You are the CFO. ', h('em', null, 'Every decision moves the share price.')),
        h(
          'p',
          { class: 'lede' },
          'Run the finances of Umiam Beverages Ltd, a mid-sized beverage maker in Shillong, for five years. The market values your company after every decision with a live DCF, CAPM and the trade-off theory of capital structure.',
        ),
        h(
          'div',
          { class: 'btn-row' },
          saved ? button(savedLabel, { href: '#/play/brief', iconName: 'arrowRight', iconAfter: true }) : button('Start a 5-year game', { href: '#/play/new?y=5', iconName: 'arrowRight', iconAfter: true }),
          button('Quick 3-year game', { kind: 'secondary', href: '#/play/new?y=3' }),
          button('Join a class room', { kind: 'ghost', href: '#/join', iconName: 'qr' }),
        ),
      ),
      h(
        'aside',
        { class: 'highlights', 'aria-label': 'Umiam Beverages FY26 highlights' },
        h('span', { class: 'eyebrow' }, 'FY26 highlights'),
        row('Revenue', crore(inc.revenue, 0)),
        row('EBITDA margin', pct(inc.ebitda / inc.revenue)),
        row('Share price', rupees(v.price)),
        row('Credit rating', v.rating),
        row('WACC', pct(v.wacc)),
      ),
    ),
  );

  const decisions = h(
    'section',
    { class: 'section' },
    sectionHead('01', 'Four decisions a year'),
    h(
      'div',
      { class: 'grid grid-2 grid-4' },
      DECISIONS.map((d) =>
        h(
          'article',
          { class: 'card decision-card' },
          icon(d.icon, 'icon'),
          h('span', { class: 'no' }, d.no),
          h('h3', null, d.title),
          h('p', { class: 'small muted' }, d.text),
          h('span', { class: 'chapter' }, d.sessions),
        ),
      ),
    ),
  );

  const how = h(
    'section',
    { class: 'section' },
    sectionHead('02', 'Scored on value, not luck'),
    h(
      'div',
      { class: 'grid grid-3' },
      h('div', { class: 'stack' }, h('h3', null, 'Risk-adjusted return'), h('p', { class: 'muted' }, 'Your score is the return to shareholders beyond the cost of equity your own decisions created. Taking extra risk raises your hurdle; only value creation beats it.')),
      h('div', { class: 'stack' }, h('h3', null, 'A value bridge every year'), h('p', { class: 'muted' }, 'A waterfall splits each year’s change in value into market luck, working capital, investment, financing and dividends, so you see exactly what you did.')),
      h('div', { class: 'stack' }, h('h3', null, 'Same scenario for everyone'), h('p', { class: 'muted' }, 'A six-character code fixes the monsoon, the price war and the project menu. Share a code and the whole class plays the same five years.')),
    ),
  );

  const paths = h(
    'section',
    { class: 'section' },
    sectionHead('03', 'Start here'),
    h(
      'div',
      { class: 'grid grid-3' },
      linkCard('#/toolkit', 'Toolkit', 'Seven calculators from the syllabus: TVM, capital budgeting, leverage, working capital, cost of capital, bonds and equity. Each with formulas and worked examples.'),
      linkCard('#/classroom', 'Classroom mode', 'Create a room code, show the QR code on the projector, and compare verified results on the results board. No sign-up, no server.'),
      linkCard('#/learn', 'How it works', 'Every formula, parameter and source, plus a live test that sound corporate finance wins the game on average.'),
    ),
  );

  return h('div', null, cover, decisions, how, paths);
}

function row(label, value) {
  return h('div', { class: 'row' }, h('span', { class: 'muted' }, label), h('span', null, value));
}

function linkCard(href, title, text) {
  return h('a', { class: 'card card-link stack', href }, h('h3', null, title), h('p', { class: 'small muted' }, text), h('span', { class: 'arrow' }, 'Open →'));
}
