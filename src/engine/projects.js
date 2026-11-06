/**
 * Project library and the yearly project menu.
 *
 * Each 'ebitda' project is built from a target IRR on its after-tax cash flows,
 * so its teaching role holds whatever the scenario size:
 *   FCF_t = EBITDA_t x (1 - t) + (cost / life) x t   (depreciation tax shield)
 * 'costShift' projects (automation) change the cost structure instead:
 * they lower the variable-cost ratio and add fixed costs, raising operating leverage.
 */
import { CONFIG } from './config.js';
import { streamFor } from './rng.js';

const T = CONFIG.market.taxRate;

const SHAPES = {
  level: () => 1,
  ramp: (t) => Math.min(1, 0.55 + 0.15 * (t - 1)),
  decline: (t) => Math.max(0.4, 1.25 - 0.12 * (t - 1)),
};

/** Level of EBITDA such that the project's after-tax cash flows have exactly `irr`. */
function ebitdaForIrr({ cost, life, irr, shape }) {
  const w = SHAPES[shape];
  const dep = cost / life;
  let weighted = 0;
  let annuity = 0;
  for (let t = 1; t <= life; t += 1) {
    const v = 1 / (1 + irr) ** t;
    weighted += w(t) * v;
    annuity += v;
  }
  const a = (cost - dep * T * annuity) / ((1 - T) * weighted);
  return Array.from({ length: life }, (_, i) => a * w(i + 1));
}

const TEMPLATES = [
  {
    id: 'expansion',
    name: 'Capacity expansion, Guwahati plant',
    blurb: 'Adds a bottling line to meet demand across the Northeast. Same business, same risk.',
    kind: 'ebitda', cost: 100, life: 8, irr: 0.145, shape: 'ramp', betaU: 0.8, noise: 0.1,
    lesson: 'A plain good project: positive NPV at its own (business-as-usual) risk.',
  },
  {
    id: 'thunder',
    name: 'Energy drink launch: "Thunder"',
    blurb: 'A new category with fashion-like demand. Big upside, high systematic risk.',
    kind: 'ebitda', cost: 90, life: 6, irr: 0.13, shape: 'ramp', betaU: 1.5, noise: 0.15,
    lesson: 'WACC trap: positive NPV at the company WACC, negative at its own risk-adjusted rate.',
  },
  {
    id: 'solar',
    name: 'Rooftop solar on all plants',
    blurb: 'Locks in power savings under a 10-year contract. Very low risk.',
    kind: 'ebitda', cost: 40, life: 10, irr: 0.11, shape: 'level', betaU: 0.35, noise: 0.04,
    lesson: 'Reverse WACC trap: negative at the company WACC, positive at its own low risk-adjusted rate.',
  },
  {
    id: 'compactLine',
    name: 'Bottling line: compact',
    blurb: 'Small, quick to install, pays back fast.',
    kind: 'ebitda', cost: 40, life: 5, irr: 0.22, shape: 'decline', betaU: 0.8, noise: 0.08,
    lesson: 'Higher IRR but smaller NPV than the high-speed line. Choose by NPV.',
  },
  {
    id: 'highSpeedLine',
    name: 'Bottling line: high-speed',
    blurb: 'Large, longer life, more capacity.',
    kind: 'ebitda', cost: 120, life: 8, irr: 0.16, shape: 'level', betaU: 0.8, noise: 0.08,
    lesson: 'Lower IRR but larger NPV than the compact line. Choose by NPV.',
  },
  {
    id: 'distribution',
    name: 'Regional distribution network',
    blurb: 'Own depots and vans in Meghalaya, Assam and Tripura instead of agents.',
    kind: 'ebitda', cost: 60, life: 7, irr: 0.15, shape: 'ramp', betaU: 0.9, noise: 0.12,
    lesson: 'Positive NPV at its own risk.',
  },
  {
    id: 'coldChain',
    name: 'Cold-chain fleet',
    blurb: 'Refrigerated trucks for juices and dairy drinks.',
    kind: 'ebitda', cost: 60, life: 6, irr: 0.185, shape: 'level', betaU: 0.9, noise: 0.1,
    lesson: 'Capital rationing: compare NPV per rupee and the best combination within the budget.',
  },
  {
    id: 'juice',
    name: 'Fruit-juice line extension',
    blurb: 'Uses local pineapple and orange from Meghalaya farms.',
    kind: 'ebitda', cost: 100, life: 7, irr: 0.17, shape: 'level', betaU: 1.0, noise: 0.12,
    lesson: 'Capital rationing: compare NPV per rupee and the best combination within the budget.',
  },
  {
    id: 'digital',
    name: 'Digital route-to-market',
    blurb: 'Retailer ordering app and route optimisation for 40,000 kiranas.',
    kind: 'ebitda', cost: 50, life: 5, irr: 0.19, shape: 'level', betaU: 0.9, noise: 0.14,
    lesson: 'Capital rationing: compare NPV per rupee and the best combination within the budget.',
  },
  {
    id: 'acquisition',
    name: 'Acquire "Garo Hills Springs" brand',
    blurb: 'A regional packaged-water brand. Big, exciting, and priced fully by the seller.',
    kind: 'ebitda', cost: 200, life: 8, irr: 0.125, shape: 'level', betaU: 1.25, noise: 0.12,
    lesson: 'Empire-building bait: looks fine at the company WACC, destroys value at its own risk.',
  },
  {
    id: 'automation',
    name: 'Automated bottling and packing',
    blurb: 'Cuts variable cost by 2.2% of revenue but adds about INR 8 crore a year of fixed costs.',
    kind: 'costShift', cost: 80, life: 8, betaU: 0.8, noise: 0.05, vcDelta: -0.022, fixedDelta: 8,
    lesson: 'Raises operating leverage: profits swing more with demand.',
  },
  {
    id: 'hq',
    name: 'New corporate headquarters',
    blurb: 'A landmark office in Guwahati. Staff love it; savings on rent are small.',
    kind: 'ebitda', cost: 70, life: 10, irr: 0.05, shape: 'level', betaU: 0.5, noise: 0.03,
    lesson: 'Negative NPV at any sensible rate.',
  },
  {
    id: 'export',
    name: 'Exports to Bangladesh and Bhutan',
    blurb: 'Cross-border trade through the Dawki and Phuentsholing routes.',
    kind: 'ebitda', cost: 90, life: 7, irr: 0.185, shape: 'ramp', betaU: 1.3, noise: 0.2,
    lesson: 'Risky but positive NPV even at its own high risk-adjusted rate.',
  },
  {
    id: 'recycling',
    name: 'Water-recycling plant',
    blurb: 'Cuts water purchase costs with a long-term municipal contract.',
    kind: 'ebitda', cost: 30, life: 10, irr: 0.105, shape: 'level', betaU: 0.4, noise: 0.04,
    lesson: 'Reverse WACC trap: low risk, positive NPV at its own rate.',
  },
  {
    id: 'thunder2',
    name: '"Thunder" second flavour',
    blurb: 'Extends the energy-drink range, whether or not Thunder launched.',
    kind: 'ebitda', cost: 60, life: 5, irr: 0.135, shape: 'ramp', betaU: 1.5, noise: 0.15,
    lesson: 'WACC trap again: high systematic risk.',
  },
];

export const PROJECT_TEMPLATES = Object.freeze(
  Object.fromEntries(
    TEMPLATES.map((t) => [t.id, Object.freeze({ ...t, ebitda: t.kind === 'ebitda' ? ebitdaForIrr(t) : null })]),
  ),
);

/** The yearly menu: which templates appear, mutually exclusive pairs, and capex budgets. */
export const SCHEDULE = Object.freeze([
  { projects: ['expansion', 'thunder', 'solar'], exclusive: [], budget: null },
  { projects: ['compactLine', 'highSpeedLine', 'distribution'], exclusive: [['compactLine', 'highSpeedLine']], budget: null },
  { projects: ['coldChain', 'juice', 'digital'], exclusive: [], budget: 150 },
  { projects: ['acquisition', 'automation', 'hq'], exclusive: [], budget: null },
  { projects: ['export', 'recycling', 'thunder2'], exclusive: [], budget: null },
]);

/**
 * Project menu for a given year of a scenario.
 * Every project in a year (and the year's budget) is scaled by the same factor,
 * which keeps each project's IRR and the menu's structure intact.
 */
export function offersFor(code, yearIndex) {
  const plan = SCHEDULE[yearIndex - 1];
  if (!plan) return { projects: [], exclusive: [], budget: null };
  const rng = streamFor(code, 'offers', yearIndex);
  const scale = Math.round(rng.uniform(0.85, 1.15) * 100) / 100;
  const ids = rng.shuffle(plan.projects);
  const projects = ids.map((id) => {
    const t = PROJECT_TEMPLATES[id];
    const uid = `y${yearIndex}-${id}`;
    return {
      uid,
      templateId: id,
      name: t.name,
      blurb: t.blurb,
      lesson: t.lesson,
      kind: t.kind,
      cost: round2(t.cost * scale),
      life: t.life,
      betaU: t.betaU,
      noise: t.noise,
      ebitda: t.ebitda ? t.ebitda.map((x) => round4(x * scale)) : null,
      vcDelta: t.vcDelta ?? 0,
      fixedDelta: t.fixedDelta ? round2(t.fixedDelta * scale) : 0,
    };
  });
  const exclusive = plan.exclusive.map(([a, b]) => [`y${yearIndex}-${a}`, `y${yearIndex}-${b}`]);
  const budget = plan.budget ? round2(plan.budget * scale) : null;
  return { projects, exclusive, budget, scale };
}

function round2(x) {
  return Math.round(x * 100) / 100;
}
function round4(x) {
  return Math.round(x * 10000) / 10000;
}
