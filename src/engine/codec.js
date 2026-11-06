/**
 * Scenario codes and result codes.
 *
 * A scenario code (6 characters) is the seed for everything random in a game, so
 * everyone using the same code faces the same events and project menu.
 * A result code packs a player's nickname, scenario and decisions. Anyone can paste it
 * into the Results board, which replays the game to verify the score: no server needed.
 */
import { WC_OPTIONS } from './simulate.js';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(random = Math.random) {
  let out = '';
  for (let i = 0; i < 6; i += 1) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return out;
}

export function normaliseCode(input) {
  const code = String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

const b64 = {
  encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(text) {
    const pad = text.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(pad + '==='.slice((pad.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  },
};

/** Compact decision encoding: [credit, inventory, payables, buffer index, accepted template ids, debt change, equity, payout %]. */
function packDecision(d) {
  return [
    d.wc.creditDays,
    d.wc.inventoryDays,
    d.wc.payableDays,
    WC_OPTIONS.cashBufferPct.indexOf(d.wc.cashBufferPct),
    d.accept.map((uid) => uid.split('-')[1]).join('.'),
    Math.round(d.financing.debtChange * 100) / 100,
    Math.round(d.financing.equityIssue * 100) / 100,
    Math.round(d.payoutRatio * 1000) / 10,
  ];
}

function unpackDecision(row, yearIndex) {
  const [credit, inventory, payable, bufferIdx, accepted, debtChange, equityIssue, payoutPct] = row;
  return {
    wc: { creditDays: credit, inventoryDays: inventory, payableDays: payable, cashBufferPct: WC_OPTIONS.cashBufferPct[bufferIdx] },
    accept: accepted ? String(accepted).split('.').map((id) => `y${yearIndex}-${id}`) : [],
    financing: { debtChange: Number(debtChange), equityIssue: Number(equityIssue) },
    payoutRatio: Number(payoutPct) / 100,
  };
}

export function encodeResult({ code, years, nickname, decisions }) {
  const payload = { v: 1, c: code, y: years, n: String(nickname ?? '').slice(0, 24), d: decisions.map((d) => packDecision(d)) };
  return `CFO1.${b64.encode(JSON.stringify(payload))}`;
}

export function decodeResult(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed.startsWith('CFO1.')) throw new Error('This is not a CFO Arena result code.');
  let payload;
  try {
    payload = JSON.parse(b64.decode(trimmed.slice(5)));
  } catch {
    throw new Error('The result code is damaged. Copy it again in full.');
  }
  if (payload.v !== 1 || !normaliseCode(payload.c) || !Array.isArray(payload.d)) throw new Error('The result code is not valid.');
  return {
    code: payload.c,
    years: payload.y,
    nickname: payload.n,
    decisions: payload.d.map((row, i) => unpackDecision(row, i + 1)),
  };
}
