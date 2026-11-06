/** Shared UI building blocks. */
import { h, uid } from './dom.js';
import { icon } from './icons.js';
import { crore, num, ratingTone, rupees, signedPct } from './format.js';

export function button(label, { kind = 'primary', iconName, iconAfter = false, onClick, href, type = 'button', attrs = {} } = {}) {
  const children = [];
  if (iconName && !iconAfter) children.push(icon(iconName));
  children.push(h('span', null, label));
  if (iconName && iconAfter) children.push(icon(iconName));
  if (href) return h('a', { class: `btn btn-${kind}`, href, ...attrs }, children);
  return h('button', { class: `btn btn-${kind}`, type, on: onClick ? { click: onClick } : undefined, ...attrs }, children);
}

export function pageHeader({ eyebrow, title, lede, actions }) {
  return h(
    'header',
    { class: 'stack page-head' },
    eyebrow ? h('span', { class: 'eyebrow' }, eyebrow) : null,
    h('h1', { tabindex: '-1', class: 'page-title' }, title),
    lede ? h('p', { class: 'lede' }, lede) : null,
    actions ? h('div', { class: 'btn-row' }, actions) : null,
  );
}

export function sectionHead(no, title, extra) {
  return h('div', { class: 'section-head' }, no ? h('span', { class: 'section-no' }, no) : null, h('h2', null, title), extra ?? null);
}

/** Signed change with direction glyph; colour is never the only signal. */
export function delta(change, { format = signedPct, invert = false } = {}) {
  if (!Number.isFinite(change)) return h('span', { class: 'delta flat' }, 'n/a');
  const good = invert ? change < 0 : change > 0;
  const flat = Math.abs(change) < 1e-9;
  const cls = flat ? 'flat' : good ? 'pos' : 'neg';
  const glyph = flat ? '•' : change > 0 ? '▲' : '▼';
  return h('span', { class: `delta ${cls}` }, h('span', { 'aria-hidden': 'true' }, glyph), format(change));
}

export function kpi({ label, value, sub, change }) {
  return h(
    'div',
    { class: 'kpi' },
    h('span', { class: 'eyebrow' }, label),
    h('div', { class: 'kpi-value' }, value),
    sub || change ? h('div', { class: 'kpi-sub' }, change ?? null, change && sub ? ' ' : null, sub ?? null) : null,
  );
}

export function ratingBadge(rating) {
  return h('span', { class: `badge rating ${ratingTone(rating)}`, title: 'Synthetic credit rating from interest coverage' }, rating);
}

export function callout(kind, ...children) {
  return h('div', { class: `callout ${kind}`, role: kind === 'bad' ? 'alert' : undefined }, children);
}

/** Radio-button segmented control. */
export function segmented({ legend, name, options, value, onChange, help }) {
  const helpId = help ? uid('help') : null;
  return h(
    'fieldset',
    { class: 'segmented', 'aria-describedby': helpId ?? undefined },
    h('legend', null, legend),
    h(
      'div',
      { class: 'options' },
      options.map((opt) =>
        h(
          'label',
          null,
          h('input', {
            type: 'radio',
            name,
            value: String(opt.value),
            checked: opt.value === value,
            on: { change: () => onChange(opt.value) },
          }),
          h('span', null, opt.label),
          opt.sub ? h('small', null, opt.sub) : null,
        ),
      ),
    ),
    help ? h('span', { class: 'field-help', id: helpId }, help) : null,
  );
}

/** Labelled numeric input with optional prefix/suffix. */
export function numberField({ label, value, step = 'any', min, max, prefix, suffix, help, onInput, id = uid('f'), error }) {
  const helpId = help ? `${id}-help` : null;
  const errId = `${id}-err`;
  const input = h('input', {
    class: 'input',
    id,
    type: 'number',
    inputmode: 'decimal',
    step: String(step),
    min: min ?? undefined,
    max: max ?? undefined,
    value: String(value),
    'aria-describedby': [helpId, errId].filter(Boolean).join(' '),
    on: { input: (e) => onInput?.(e.target.value === '' ? Number.NaN : Number(e.target.value), e) },
  });
  const control = prefix || suffix ? h('div', { class: 'input-affix' }, prefix ? h('span', { class: 'affix' }, prefix) : null, input, suffix ? h('span', { class: 'affix' }, suffix) : null) : input;
  return h(
    'div',
    { class: 'field' },
    h('label', { class: 'field-label', for: id }, label),
    control,
    help ? h('span', { class: 'field-help', id: helpId }, help) : null,
    h('span', { class: 'field-error', id: errId, 'aria-live': 'polite' }, error ?? ''),
  );
}

export function selectField({ label, value, options, onChange, help, id = uid('s') }) {
  return h(
    'div',
    { class: 'field' },
    h('label', { class: 'field-label', for: id }, label),
    h(
      'select',
      { class: 'input', id, on: { change: (e) => onChange(e.target.value) } },
      options.map((o) => h('option', { value: String(o.value), selected: String(o.value) === String(value) }, o.label)),
    ),
    help ? h('span', { class: 'field-help' }, help) : null,
  );
}

/** Range slider with live value label. */
export function rangeField({ label, value, min, max, step, format, onInput, help, scale, id = uid('r') }) {
  const out = h('output', { for: id, class: 'num' }, format(value));
  const input = h('input', {
    id,
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
    'aria-valuetext': format(value),
    on: {
      input: (e) => {
        const v = Number(e.target.value);
        out.textContent = format(v);
        e.target.setAttribute('aria-valuetext', format(v));
        onInput(v);
      },
    },
  });
  return h(
    'div',
    { class: 'field' },
    h('label', { class: 'field-label', for: id }, h('span', null, label, ': '), out),
    input,
    scale ? h('div', { class: 'range-scale', 'aria-hidden': 'true' }, scale.map((x) => h('span', null, x))) : null,
    help ? h('span', { class: 'field-help' }, help) : null,
  );
}

/** Two-column ledger table: rows of [label, value, options]. */
export function ledger({ caption, rows, head }) {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'ledger' },
      caption ? h('caption', null, caption) : null,
      head ? h('thead', null, h('tr', null, head.map((x, i) => h('th', { scope: 'col', class: i ? 'n' : '' }, x)))) : null,
      h(
        'tbody',
        null,
        rows.map((r) => {
          const [label, ...vals] = r.cells;
          return h(
            'tr',
            { class: r.cls ?? '' },
            h('td', null, label),
            vals.map((v) => h('td', { class: `n ${typeof v === 'number' && v < 0 ? 'neg-val' : ''}` }, typeof v === 'number' ? num(v, r.decimals ?? 1) : v)),
          );
        }),
      ),
    ),
  );
}

/** Income statement, balance sheet and cash flow for one or two years side by side. */
export function statements(current, previous, { fyNow, fyPrev } = {}) {
  const is = current.income;
  const ip = previous?.income;
  const two = Boolean(previous);
  const head = ['INR crore', ...(two ? [fyPrev, fyNow] : [fyNow])];
  const row = (label, key, cls, sign = 1) => ({
    cls,
    cells: [label, ...(two ? [ip[key] * sign] : []), is[key] * sign],
  });
  const income = ledger({
    caption: 'Income statement',
    head,
    rows: [
      row('Revenue', 'revenue', 'sub'),
      row('Variable costs', 'cogs', 'indent', -1),
      row('Bad debts', 'badDebts', 'indent', -1),
      row('Cash fixed costs', 'fixed', 'indent', -1),
      row('Inventory holding costs', 'holding', 'indent', -1),
      row('Financial distress costs', 'distress', 'indent', -1),
      row('One-off items', 'oneOff', 'indent', -1),
      row('Project EBITDA', 'projectEbitda', 'indent'),
      row('EBITDA', 'ebitda', 'sub'),
      row('Depreciation', 'dep', 'indent', -1),
      row('EBIT', 'ebit', 'sub'),
      row('Interest income on cash', 'interestIncome', 'indent'),
      row('Interest expense', 'interest', 'indent', -1),
      row('Profit before tax', 'ebt', 'sub'),
      row('Tax', 'tax', 'indent', -1),
      row('Profit after tax', 'pat', 'total'),
      row('Dividends', 'dividends', 'indent'),
      { cls: 'indent', decimals: 2, cells: ['Dividend per share (INR)', ...(two ? [ip.dps] : []), is.dps] },
    ],
  });
  const b = current.balance;
  const bp = previous?.balance;
  const brow = (label, key, cls) => ({ cls, cells: [label, ...(two ? [bp[key]] : []), b[key]] });
  const balance = ledger({
    caption: 'Balance sheet (year end)',
    head,
    rows: [
      brow('Cash', 'cash', 'indent'),
      brow('Receivables', 'receivables', 'indent'),
      brow('Inventory', 'inventory', 'indent'),
      brow('Net fixed assets', 'fixedAssets', 'indent'),
      brow('Total assets', 'totalAssets', 'total'),
      brow('Payables', 'payables', 'indent'),
      brow('Debt', 'debt', 'indent'),
      brow('Emergency loans', 'emergencyDebt', 'indent'),
      brow('Shareholders’ equity (book)', 'equity', 'indent'),
      brow('Total liabilities and equity', 'totalLiabilitiesEquity', 'total'),
    ],
  });
  const parts = [income, balance];
  const cf = current.cashFlow;
  if (cf) {
    parts.push(
      ledger({
        caption: 'Cash flow statement',
        head: ['INR crore', fyNow],
        rows: [
          { cls: 'indent', cells: ['Profit after tax', cf.pat] },
          { cls: 'indent', cells: ['Add: depreciation', cf.dep] },
          { cls: 'indent', cells: ['Less: increase in working capital', -cf.dNwc] },
          { cls: 'sub', cells: ['Cash from operations', cf.cfo] },
          { cls: 'indent', cells: ['Capital expenditure, base business', -cf.baseCapex] },
          { cls: 'indent', cells: ['Projects', -cf.projectCapex] },
          { cls: 'sub', cells: ['Cash from investing', cf.cfi] },
          { cls: 'indent', cells: ['Borrowing (repayment)', cf.debtChange] },
          { cls: 'indent', cells: ['Share issue, net', cf.equityNet] },
          { cls: 'indent', cells: ['Dividends paid', -cf.dividends] },
          { cls: 'indent', cells: ['Emergency loan', cf.emergencyLoan] },
          { cls: 'sub', cells: ['Cash from financing', cf.cff] },
          { cls: 'indent', cells: ['Opening cash', cf.opening] },
          { cls: 'total', cells: ['Closing cash', cf.closing] },
        ],
      }),
    );
  }
  return parts;
}

export function formatPrice(x) {
  return rupees(x);
}

export function formatCrore(x) {
  return crore(x);
}
