/**
 * Every parameter of the CFO Arena model in one place.
 * The How it works page renders PARAMETERS directly from this file,
 * so the documentation can never drift from the code.
 *
 * basis:
 *   'source'  - taken from a published source (named in `source`)
 *   'theory'  - textbook corporate finance
 *   'game'    - a game assumption chosen to be plausible and to teach the lesson
 */

export const SOURCES = Object.freeze({
  rf: {
    label: 'Trading Economics, India 10-year government bond yield, 5 Nov 2026',
    url: 'https://tradingeconomics.com/india/government-bond-yield',
  },
  erp: {
    label: 'Aswath Damodaran, Country Default Spreads and Risk Premiums, January 2026 update',
    url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html',
  },
  ratings: {
    label: 'Aswath Damodaran, Ratings, Interest Coverage Ratios and Default Spread, January 2026',
    url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ratings.html',
  },
  tax: {
    label: 'Indian concessional corporate tax regime: 22% base + 10% surcharge + 4% cess',
    url: '',
  },
});

export const CONFIG = Object.freeze({
  company: {
    name: 'Umiam Beverages Ltd',
    startFy: 26,
    demand: 1000, // revenue capacity at default policies, INR crore
    vcRatio: 0.6, // variable cost as share of revenue
    fixedCosts: 210, // cash fixed operating costs, INR crore
    baseNfa: 500, // net fixed assets of the base business
    cash: 60,
    debt: 300,
    shares: 10, // crore shares
    payoutRatio: 0.3,
    unleveredBeta: 0.8,
    policy: { creditDays: 30, inventoryDays: 45, payableDays: 40, cashBufferPct: 0.05 },
  },
  market: {
    riskFree: 0.0712,
    erp: 0.0708,
    taxRate: 0.2517,
  },
  operations: {
    growthPath: { start: 0.09, startFy: 27, matureFy: 36 }, // demand growth fades from 9% (FY27) to the terminal 5% (FY36)
    growthNoiseSd: 0.02, // random variation around expected growth, before events
    fixedCostGap: 0.01, // fixed costs grow 1 point slower than demand at first, converging by FY36
    depreciationRate: 0.08, // of opening net fixed assets of the base business
    salesToCapital: 2.0, // INR of extra revenue capacity per INR of net new fixed assets
    projectMarketSensitivity: 2.0, // how strongly project cash flows react to demand surprises, per unit of beta/0.8
  },
  workingCapital: {
    creditDays: {
      15: { sales: -0.03, badDebt: 0.005 },
      30: { sales: 0, badDebt: 0.01 },
      45: { sales: 0.03, badDebt: 0.02 },
      60: { sales: 0.05, badDebt: 0.03 },
    },
    inventoryDays: {
      30: { sales: -0.025 },
      45: { sales: 0 },
      60: { sales: 0.01 },
    },
    payableDays: {
      30: { premium: 0 },
      40: { premium: 0 },
      45: { premium: 0 },
      60: { premium: 0.01 },
      75: { premium: 0.025 },
    },
    holdingCostRate: 0.08, // storage, spoilage and insurance per INR of inventory
    cashBufferOptions: [0.02, 0.05, 0.08, 0.12, 0.2],
  },
  financing: {
    emergencyPremium: 0.04, // emergency loans cost the normal rate + 4 percentage points
    maxDebtToEbitda: 5,
    // Expected indirect costs of financial distress (lost customers, tighter supplier terms,
    // management distraction) as a share of revenue, rising as the credit rating falls.
    distressCostByRating: {
      AAA: 0, AA: 0, 'A+': 0, A: 0.001, 'A-': 0.0025, BBB: 0.005, 'BB+': 0.0085, BB: 0.0125,
      'B+': 0.019, B: 0.026, 'B-': 0.035, CCC: 0.045, CC: 0.055, C: 0.065, D: 0.075,
    },
    issueDiscount: 0.05, // new shares sold 5% below market price
    flotationCost: 0.03, // of gross proceeds
    issueAnnouncementEffect: -0.02, // price reaction to an equity issue
    maxIssueShareOfMarketCap: 0.5,
  },
  dividend: {
    cutThreshold: 0.2, // a DPS cut of more than 20% triggers the signalling effect
    cutEffect: -0.03,
    sentimentDecay: 0.5, // half of any sentiment effect fades each year
  },
  valuation: {
    forecastYears: 5,
    terminalGrowth: 0.05,
    tolerance: 1e-7,
    maxIterations: 200,
  },
  game: {
    fullYears: 5,
    quickYears: 3,
    maxEventsPerYear: 2,
  },
});

/** Human-readable parameter table for the How it works page. */
export const PARAMETERS = [
  { group: 'Market', name: 'Risk-free rate (opening)', value: CONFIG.market.riskFree, unit: '%', basis: 'source', source: 'rf' },
  { group: 'Market', name: 'Equity risk premium, India (total)', value: CONFIG.market.erp, unit: '%', basis: 'source', source: 'erp', note: 'Mature market 4.23% plus India country risk premium 2.85%.' },
  { group: 'Market', name: 'Corporate tax rate', value: CONFIG.market.taxRate, unit: '%', basis: 'source', source: 'tax' },
  { group: 'Market', name: 'Default spreads by rating', value: 'Rating table', unit: '', basis: 'source', source: 'ratings' },
  { group: 'Company', name: 'Opening revenue (FY26)', value: CONFIG.company.demand, unit: 'cr', basis: 'game' },
  { group: 'Company', name: 'Variable costs', value: CONFIG.company.vcRatio, unit: '% of revenue', basis: 'game' },
  { group: 'Company', name: 'Cash fixed costs (FY26)', value: CONFIG.company.fixedCosts, unit: 'cr', basis: 'game' },
  { group: 'Company', name: 'Net fixed assets (FY26)', value: CONFIG.company.baseNfa, unit: 'cr', basis: 'game' },
  { group: 'Company', name: 'Debt (FY26)', value: CONFIG.company.debt, unit: 'cr', basis: 'game' },
  { group: 'Company', name: 'Shares outstanding', value: CONFIG.company.shares, unit: 'crore shares', basis: 'game' },
  { group: 'Company', name: 'Unlevered beta, base business', value: CONFIG.company.unleveredBeta, unit: 'x', basis: 'game', note: 'Typical of packaged beverages; relevered with Hamada.' },
  { group: 'Operations', name: 'Expected nominal demand growth', value: '9% in FY27, fading in a straight line to 5% by FY36', unit: '', basis: 'game', note: 'The market expects the same path, so expectations are unbiased.' },
  { group: 'Operations', name: 'Random variation in growth (sd)', value: CONFIG.operations.growthNoiseSd, unit: '%', basis: 'game' },
  { group: 'Operations', name: 'Fixed cost growth', value: '1 point below demand growth in FY27, converging to it by FY36', unit: '', basis: 'game' },
  { group: 'Operations', name: 'Depreciation rate', value: CONFIG.operations.depreciationRate, unit: '% of opening NFA', basis: 'game' },
  { group: 'Operations', name: 'Sales-to-capital ratio for growth capex', value: CONFIG.operations.salesToCapital, unit: 'x', basis: 'game' },
  { group: 'Working capital', name: 'Credit 15/30/45/60 days: sales effect', value: '-3% / 0 / +3% / +5%', unit: '', basis: 'game' },
  { group: 'Working capital', name: 'Credit 15/30/45/60 days: bad debts', value: '0.5% / 1% / 2% / 3% of sales', unit: '', basis: 'game' },
  { group: 'Working capital', name: 'Inventory 30/45/60 days: sales effect', value: '-2.5% / 0 / +1%', unit: '', basis: 'game', note: 'Lower stock means more stockouts.' },
  { group: 'Working capital', name: 'Inventory holding cost', value: CONFIG.workingCapital.holdingCostRate, unit: '% of inventory', basis: 'game' },
  { group: 'Working capital', name: 'Payables 30-45/60/75 days: supplier premium', value: '0 / +1% / +2.5% of variable costs', unit: '', basis: 'game', note: 'Suppliers charge more when paid late.' },
  { group: 'Financing', name: 'Emergency loan premium', value: CONFIG.financing.emergencyPremium, unit: '% points', basis: 'game' },
  { group: 'Financing', name: 'Debt capacity', value: `${CONFIG.financing.maxDebtToEbitda}x EBITDA`, unit: '', basis: 'game' },
  { group: 'Financing', name: 'Expected distress costs by rating', value: 'A 0.1%, A- 0.25%, BBB 0.5%, BB+ 0.85%, BB 1.25%, B+ 1.9%, B 2.6%, B- 3.5%, CCC 4.5%, worse up to 7.5% of revenue', unit: '', basis: 'game', note: 'Trade-off theory: tax shields versus the indirect costs of distress. Lost customers, tighter supplier terms, management distraction.' },
  { group: 'Financing', name: 'Equity issue discount / flotation cost', value: '5% / 3%', unit: '', basis: 'game' },
  { group: 'Financing', name: 'Equity issue announcement effect', value: CONFIG.financing.issueAnnouncementEffect, unit: '% of price', basis: 'game', note: 'Behavioural: markets read issues as a signal that shares are overvalued.' },
  { group: 'Dividend', name: 'Dividend cut signalling effect (cut > 20%)', value: CONFIG.dividend.cutEffect, unit: '% of price', basis: 'game', note: 'Behavioural; half of any sentiment effect fades each year.' },
  { group: 'Valuation', name: 'Explicit forecast', value: 'Out to FY36 (at least 5 years), then a Gordon terminal value', unit: '', basis: 'theory' },
  { group: 'Valuation', name: 'Terminal growth', value: CONFIG.valuation.terminalGrowth, unit: '%', basis: 'game' },
];
