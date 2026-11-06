/** Classroom mode: host a room, join by QR code, verify results by replay. No server needed. */
import { h, mount, copyText } from '../dom.js';
import { button, callout, pageHeader, sectionHead, segmented } from '../components.js';
import { pct, signedPct } from '../format.js';
import { qrSvg } from '../qr.js';
import { dataTable } from '../charts.js';
import { normaliseCode, randomCode, decodeResult } from '../../engine/codec.js';
import { replay, summary, scenarioEvents } from '../../engine/game.js';
import { playBot } from '../../engine/bots.js';
import { loadGame } from '../store.js';
import { beginGame } from './play.js';

function joinUrl(code, years) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/join?code=${code}&y=${years}`;
}

export function renderClassroom({ sub, params, navigate }) {
  if (sub[0] === 'host') return renderHost(params, navigate);
  const state = { years: 3, code: '' };
  const err = h('span', { class: 'field-error', 'aria-live': 'polite' });
  const host = (code) => navigate(`/classroom/host?code=${code}&y=${state.years}`);
  return h(
    'div',
    null,
    pageHeader({
      eyebrow: 'Classroom mode',
      title: 'Run CFO Arena with your class',
      lede: 'Everyone joins the same scenario from their phone, plays the same events and projects, and you compare verified results at the end. No accounts, no server.',
    }),
    h(
      'div',
      { class: 'split' },
      h(
        'div',
        { class: 'card stack' },
        segmented({
          legend: 'Game length',
          name: 'room-len',
          value: state.years,
          options: [
            { value: 3, label: '3 years', sub: 'about 7 min' },
            { value: 5, label: '5 years', sub: 'about 15 min' },
          ],
          onChange: (v) => {
            state.years = v;
          },
        }),
        h('div', { class: 'btn-row' }, button('Create a new room', { onClick: () => host(randomCode()), iconName: 'qr' })),
        h('hr', { class: 'rule' }),
        h(
          'form',
          {
            class: 'stack',
            on: {
              submit: (e) => {
                e.preventDefault();
                const c = normaliseCode(state.code);
                if (!c) err.textContent = 'Enter a 6-character room code.';
                else host(c);
              },
            },
          },
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'room-code' }, 'Or host an existing room code'), h('input', { class: 'input mono', id: 'room-code', maxlength: 8, autocapitalize: 'characters', on: { input: (e) => { state.code = e.target.value; err.textContent = ''; } } }), err),
          h('div', null, button('Open host screen', { kind: 'secondary', type: 'submit' })),
        ),
      ),
      h(
        'ol',
        { class: 'stack' },
        h('li', null, h('strong', null, 'Create a room. '), 'Put the host screen on the projector. It shows the room code and a QR code.'),
        h('li', null, h('strong', null, 'Students scan and play. '), 'Each player enters a nickname and plays the same scenario. Reveal each year’s events from the host screen and narrate them.'),
        h('li', null, h('strong', null, 'Collect result codes. '), 'At the end, each player copies their result code (for example into a WhatsApp group). Paste them into the results board: it replays every game to verify the score and ranks the class.'),
      ),
    ),
  );
}

function renderHost(params, navigate) {
  const code = normaliseCode(params.get('code'));
  const years = Number(params.get('y')) === 5 ? 5 : 3;
  if (!code) return h('div', null, pageHeader({ title: 'Room not found', lede: 'That room code is not valid.' }), button('Back to classroom', { href: '#/classroom' }));
  const url = joinUrl(code, years);
  const eventsBox = h('div', { class: 'stack' });
  const scenario = scenarioEvents(code, years);
  const revealed = new Set();
  const drawEvents = () => {
    mount(
      eventsBox,
      scenario.map((yr) =>
        h(
          'div',
          { class: 'card card-tight stack' },
          h('div', { class: 'cluster' }, h('strong', null, `FY${yr.fy}`), revealed.has(yr.yearIndex) ? null : button(`Reveal FY${yr.fy} events`, { kind: 'ghost', onClick: () => { revealed.add(yr.yearIndex); drawEvents(); } })),
          revealed.has(yr.yearIndex)
            ? yr.events.length
              ? h('ul', null, yr.events.map((e) => h('li', null, h('strong', null, `${e.name}: `), e.text)))
              : h('p', { class: 'muted small' }, 'A quiet year: no major events.')
            : h('p', { class: 'faint small' }, 'Hidden until you reveal it.'),
        ),
      ),
    );
  };
  drawEvents();

  const board = h('div', { class: 'stack' });
  const textarea = h('textarea', { class: 'input', id: 'codes', rows: 6, placeholder: 'Paste result codes here, one per line (each starts with CFO1.)' });
  const check = () => {
    const lines = textarea.value.split(/\s+/).map((x) => x.trim()).filter((x) => x.startsWith('CFO1.'));
    if (!lines.length) {
      mount(board, callout('warn', h('p', null, 'No result codes found. Each code starts with CFO1.')));
      return;
    }
    const rows = [];
    const problems = [];
    for (const line of lines) {
      try {
        const res = decodeResult(line);
        if (res.code !== code || res.years !== years) {
          problems.push(`${res.nickname || 'A player'}: played room ${res.code} (${res.years} years), not this room.`);
          continue;
        }
        const g = replay(res, { analyse: false, bridge: false });
        if (g.status === 'playing') {
          problems.push(`${res.nickname || 'A player'}: the game is not finished.`);
          continue;
        }
        const sm = summary(g);
        rows.push({ name: res.nickname || 'Anonymous', alpha: sm.alpha, tsr: sm.tsr, rating: sm.rating, bankrupt: sm.bankrupt });
      } catch (err) {
        problems.push(err.message);
      }
    }
    const tb = summary(playBot('textbook', code, years));
    rows.push({ name: 'Textbook CFO (benchmark)', alpha: tb.alpha, tsr: tb.tsr, rating: tb.rating, bot: true });
    rows.sort((a, b) => b.alpha - a.alpha);
    mount(
      board,
      dataTable(
        ['Rank', 'Player', 'Alpha a year', 'TSR a year', 'Final rating'],
        rows.map((r, i) => [String(i + 1), r.bot ? r.name : `${r.name} ✓`, signedPct(r.alpha, 2), r.bankrupt ? 'bankrupt' : pct(r.tsr, 2), r.rating]),
      ),
      h('p', { class: 'small muted' }, '✓ = verified by replaying the player’s decisions in this browser.'),
      problems.length ? callout('warn', h('ul', null, problems.map((p) => h('li', null, p)))) : null,
    );
  };

  return h(
    'div',
    null,
    h(
      'div',
      { class: 'split' },
      h(
        'div',
        { class: 'stack' },
        h('span', { class: 'eyebrow' }, `Room · ${years}-year game`),
        h('h1', { class: 'page-title visually-hidden', tabindex: '-1' }, `Room ${code}`),
        h('div', { class: 'code-display', 'aria-label': `Room code ${code.split('').join(' ')}` }, code),
        h('p', { class: 'lede' }, 'Scan the QR code, or open CFO Arena and choose Join a class room.'),
        h('p', { class: 'small mono' }, url),
        h('div', { class: 'btn-row' }, button('Copy join link', { kind: 'secondary', iconName: 'copy', onClick: () => copyText(url) }), button('Play this room myself', { kind: 'ghost', href: `#/join?code=${code}&y=${years}` })),
      ),
      h('div', { class: 'qr' }, qrSvg(url, { label: `QR code to join room ${code}` })),
    ),
    h('section', { class: 'section' }, sectionHead('01', 'Events, for narration'), h('p', { class: 'small muted' }, 'Events depend only on the room code, so every player sees the same ones. Reveal each year after the class has submitted it.'), eventsBox),
    h('section', { class: 'section' }, sectionHead('02', 'Results board'), h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'codes' }, 'Result codes'), textarea), h('div', { class: 'btn-row' }, button('Verify and rank', { onClick: check })), board),
  );
}

export function renderJoin({ params, navigate }) {
  const presetCode = normaliseCode(params.get('code')) ?? '';
  const years = Number(params.get('y')) === 5 ? 5 : 3;
  const state = { code: presetCode, nickname: '', years };
  const err = h('span', { class: 'field-error', 'aria-live': 'polite' });
  const join = () => {
    const c = normaliseCode(state.code);
    if (!c) {
      err.textContent = 'Enter the 6-character room code shown on the screen.';
      return;
    }
    beginGame({ code: c, years: state.years, nickname: state.nickname.trim().slice(0, 24) });
    navigate('/play/brief');
  };
  return h(
    'div',
    null,
    pageHeader({ eyebrow: 'Classroom mode', title: presetCode ? `Join room ${presetCode}` : 'Join a class room', lede: 'Everyone in the room plays the same scenario. Your nickname appears on the results board.' }),
    h(
      'form',
      { class: 'card stack', on: { submit: (e) => { e.preventDefault(); join(); } } },
      presetCode ? null : h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'join-code' }, 'Room code'), h('input', { class: 'input mono', id: 'join-code', maxlength: 8, autocapitalize: 'characters', autocomplete: 'off', on: { input: (e) => { state.code = e.target.value; err.textContent = ''; } } }), err),
      presetCode
        ? null
        : segmented({ legend: 'Game length (as told by your host)', name: 'join-len', value: state.years, options: [{ value: 3, label: '3 years' }, { value: 5, label: '5 years' }], onChange: (v) => { state.years = v; } }),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'join-nick' }, 'Nickname'), h('input', { class: 'input', id: 'join-nick', maxlength: 24, autocomplete: 'nickname', on: { input: (e) => { state.nickname = e.target.value; } } })),
      h('div', null, button('Join and start', { type: 'submit', iconName: 'arrowRight', iconAfter: true })),
      loadGame() ? h('p', { class: 'small faint' }, 'Joining replaces the game saved on this device.') : null,
    ),
  );
}
