/**
 * Tiny DOM helpers. Text is always set with textContent, never parsed as HTML,
 * so player input (nicknames, pasted codes) cannot inject markup.
 * The only HTML strings rendered are static, trusted formula and icon snippets from this codebase.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

function applyAttrs(el, attrs) {
  if (!attrs) return;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : value);
    else if (key === 'on') for (const [ev, fn] of Object.entries(value)) el.addEventListener(ev, fn);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'html') el.innerHTML = value; // trusted static snippets only
    else if (key === 'value' && 'value' in el) el.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') el[key] = Boolean(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Create an HTML element: h('p', { class: 'muted' }, 'Hello'). */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
  } else {
    applyAttrs(el, attrs);
  }
  append(el, children);
  return el;
}

/** Create an SVG element. */
export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

/** Simple debounce for live recalculation. */
export function debounce(fn, ms = 120) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

let idCounter = 0;
export function uid(prefix = 'id') {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** Announce a message politely to screen readers and show a toast. */
export function toast(message) {
  const region = document.getElementById('toasts');
  if (!region) return;
  const t = h('div', { class: 'toast', role: 'status' }, message);
  region.append(t);
  setTimeout(() => t.remove(), 3200);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
    return true;
  } catch {
    toast('Copy failed: select the text and copy it manually.');
    return false;
  }
}
