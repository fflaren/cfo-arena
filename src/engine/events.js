/**
 * Event deck. Each year, the deck is shuffled with the scenario's seeded stream and
 * each event is included with its probability, up to two events a year.
 * Event effects:
 *   demand    - change in this year's demand growth (permanent level effect)
 *   price     - one-year change in realised price (revenue only this year)
 *   revenue   - one-year change in volume (revenue only this year)
 *   vc        - one-year change in the variable-cost ratio (percentage points of revenue)
 *   rf        - permanent change in the risk-free rate (percentage points)
 *   fixedPct  - permanent change in cash fixed costs
 *   oneOff    - one-time cost (negative = one-time gain), INR crore per INR 1,000 crore of revenue
 * The deck is balanced so that, on average, events neither help nor hurt: the market's
 * expectations are unbiased, and only surprises move the share price.
 */
import { CONFIG } from './config.js';
import { streamFor } from './rng.js';

export const EVENT_DECK = Object.freeze([
  { id: 'weakMonsoon', name: 'Weak monsoon', p: 0.16, effects: { demand: -0.06 }, text: 'Rural incomes fall and so does demand for packaged drinks.' },
  { id: 'heatwave', name: 'Long, hot summer', p: 0.15, effects: { demand: 0.05 }, text: 'A record heatwave lifts beverage demand across North and East India.' },
  { id: 'festive', name: 'Strong festive season', p: 0.14, effects: { demand: 0.03 }, text: 'Durga Puja, Diwali and the wedding season boost sales.' },
  { id: 'sugar', name: 'Sugar price spike', p: 0.1, effects: { vc: 0.03 }, text: 'A poor cane crop pushes sugar prices up for a year.' },
  { id: 'resinEase', name: 'PET resin prices ease', p: 0.12, effects: { vc: -0.025 }, text: 'Cheaper crude oil lowers bottle costs this year.' },
  { id: 'rbiHike', name: 'RBI raises the repo rate', p: 0.11, effects: { rf: 0.0075 }, text: 'Bond yields rise; borrowing costs and discount rates go up for good.' },
  { id: 'rbiCut', name: 'RBI cuts the repo rate', p: 0.11, effects: { rf: -0.0075 }, text: 'Bond yields fall; borrowing costs and discount rates come down.' },
  { id: 'priceWar', name: 'Competitor price war', p: 0.12, effects: { price: -0.04 }, text: 'A national brand slashes prices; you match them for a year.' },
  { id: 'gst', name: 'Higher GST on sweetened drinks', p: 0.07, effects: { demand: -0.03 }, text: 'The GST Council raises the rate on sweetened beverages.' },
  { id: 'flood', name: 'Flood shuts the Guwahati plant', p: 0.06, effects: { revenue: -0.05, oneOff: 15 }, text: 'Brahmaputra floods halt production for six weeks; repairs are needed.' },
  { id: 'exportOrder', name: 'Large export order', p: 0.08, effects: { revenue: 0.04 }, text: 'A one-off bulk order from a Bangladeshi distributor.' },
  { id: 'wages', name: 'Wage revision', p: 0.1, effects: { fixedPct: 0.04 }, text: 'A new wage settlement raises fixed costs permanently.' },
  { id: 'efficiency', name: 'Energy-efficiency drive pays off', p: 0.13, effects: { fixedPct: -0.03 }, text: 'Plant upgrades permanently cut power and fuel bills.' },
  { id: 'priceRise', name: 'Price increase sticks', p: 0.15, effects: { price: 0.03 }, text: 'Competitors follow your price rise, so volumes hold this year.' },
  { id: 'refund', name: 'Old GST refund received', p: 0.12, effects: { oneOff: -12 }, text: 'A long-pending tax refund lands as a one-time gain.' },
  { id: 'epr', name: 'Plastic EPR compliance', p: 0.06, effects: { oneOff: 12 }, text: 'Extended producer responsibility rules require a one-time compliance spend.' },
]);

/** Events for a year of a scenario. Independent of the player's decisions. */
export function eventsFor(code, yearIndex) {
  const rng = streamFor(code, 'events', yearIndex);
  const order = rng.shuffle(EVENT_DECK);
  const picked = [];
  for (const ev of order) {
    if (picked.length >= CONFIG.game.maxEventsPerYear) break;
    if (rng.next() < ev.p) picked.push(ev);
  }
  // Same stream, drawn after events: the year's random variation in demand growth.
  const noise = rng.normal(0, CONFIG.operations.growthNoiseSd);
  return { events: picked, noise };
}

/** Combine the effects of a year's events. */
export function combineEffects(events) {
  const out = { demand: 0, price: 0, revenue: 0, vc: 0, rf: 0, fixedPct: 0, oneOff: 0 };
  for (const ev of events) {
    for (const [k, v] of Object.entries(ev.effects)) out[k] += v;
  }
  return out;
}
