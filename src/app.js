/**
 * CFO Arena: application shell and hash router.
 * Hash routing works on GitHub Pages without any server configuration.
 */
import { h, mount } from './ui/dom.js';
import { ICONS } from './ui/icons.js';
import { getTheme, setTheme } from './ui/store.js';
import { renderHome } from './ui/pages/home.js';
import { renderPlay } from './ui/pages/play.js';
import { renderToolkit } from './ui/pages/toolkit.js';
import { renderLearn } from './ui/pages/learn.js';
import { renderClassroom, renderJoin } from './ui/pages/classroom.js';

const ROUTES = {
  '': { render: renderHome, nav: 'home', title: 'CFO Arena: corporate finance, played' },
  play: { render: renderPlay, nav: 'play', title: 'Play | CFO Arena' },
  toolkit: { render: renderToolkit, nav: 'toolkit', title: 'Toolkit | CFO Arena' },
  learn: { render: renderLearn, nav: 'learn', title: 'How it works | CFO Arena' },
  classroom: { render: renderClassroom, nav: 'classroom', title: 'Classroom | CFO Arena' },
  join: { render: renderJoin, nav: 'classroom', title: 'Join a room | CFO Arena' },
};

export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { root: parts[0] ?? '', sub: parts.slice(1), params: new URLSearchParams(query) };
}

export function navigate(path) {
  if (window.location.hash === `#${path}`) route();
  else window.location.hash = path;
}

let renderToken = 0;

function route() {
  const { root, sub, params } = parseHash();
  const def = ROUTES[root] ?? ROUTES[''];
  document.title = def.title;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === def.nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const app = document.getElementById('app');
  const token = ++renderToken;
  try {
    const view = def.render({ sub, params, navigate });
    if (token !== renderToken) return;
    mount(app, h('div', { class: 'fade-in' }, view));
  } catch (err) {
    console.error(err);
    mount(
      app,
      h(
        'div',
        { class: 'card stack' },
        h('h1', { class: 'page-title', tabindex: '-1' }, 'Something went wrong'),
        h('p', null, 'This page hit an unexpected error. Your saved game is safe.'),
        h('p', { class: 'small mono' }, String(err?.message ?? err)),
        h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to home'),
      ),
    );
  }
  // Move focus to the page heading for keyboard and screen-reader users, then scroll to top.
  const heading = app.querySelector('.page-title');
  if (heading) heading.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ---------- Theme ---------- */

const THEMES = ['auto', 'light', 'dark'];
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  const btn = document.getElementById('theme-toggle');
  const iconEl = document.getElementById('theme-icon');
  if (btn && iconEl) {
    const name = theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'auto';
    iconEl.innerHTML = ICONS[name];
    btn.setAttribute('aria-label', `Colour theme: ${theme === 'auto' ? 'automatic' : theme}. Change theme`);
    btn.title = `Theme: ${theme === 'auto' ? 'automatic' : theme}`;
  }
}

function initShell() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = ICONS[el.dataset.icon] ?? '';
  });
  let theme = getTheme() ?? 'auto';
  applyTheme(theme);
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    setTheme(theme === 'auto' ? null : theme);
    applyTheme(theme);
  });
  window.addEventListener('hashchange', route);
  route();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initShell);
else initShell();
