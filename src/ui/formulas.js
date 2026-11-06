/** Static, trusted formula markup (rendered with innerHTML). */
const fr = (n, d) => `<span class="f-frac"><span>${n}</span><span>${d}</span></span>`;
const v = (x) => `<var>${x}</var>`;
const note = (t) => `<span class="f-note">${t}</span>`;

export const FORMULAS = {
  pvLump: `${v('PV')} = ${fr(v('FV'), `(1 + ${v('r')})<sup>${v('n')}</sup>`)}${note('Present value of a single amount received after n periods.')}`,
  fvLump: `${v('FV')} = ${v('PV')} &times; (1 + ${v('r')})<sup>${v('n')}</sup>`,
  pvAnnuity: `${v('PV')} = ${v('C')} &times; ${fr(`1 &minus; (1 + ${v('r')})<sup>&minus;${v('n')}</sup>`, v('r'))}${note('For an annuity due (payments at the start of each period) multiply by (1 + r).')}`,
  fvAnnuity: `${v('FV')} = ${v('C')} &times; ${fr(`(1 + ${v('r')})<sup>${v('n')}</sup> &minus; 1`, v('r'))}`,
  perpetuity: `${v('PV')} = ${fr(v('C'), v('r'))} &nbsp;&nbsp; ${v('PV')}<sub>growing</sub> = ${fr(`${v('C')}<sub>1</sub>`, `${v('r')} &minus; ${v('g')}`)}${note('A growing perpetuity needs r &gt; g.')}`,
  emi: `${v('EMI')} = ${fr(`${v('P')} &times; ${v('i')} &times; (1 + ${v('i')})<sup>${v('N')}</sup>`, `(1 + ${v('i')})<sup>${v('N')}</sup> &minus; 1`)}${note('i is the periodic rate (annual rate / 12) and N the number of instalments.')}`,
  ear: `${v('EAR')} = (1 + ${fr(v('APR'), v('m'))})<sup>${v('m')}</sup> &minus; 1`,
  npv: `${v('NPV')} = &sum;<sub>t=0</sub><sup>n</sup> ${fr(`${v('CF')}<sub>t</sub>`, `(1 + ${v('r')})<sup>t</sup>`)}${note('IRR is the rate at which NPV = 0. MIRR compounds inflows at the reinvestment rate and discounts outflows at the finance rate.')}`,
  mirr: `${v('MIRR')} = (${fr(`FV of inflows at ${v('r')}<sub>reinvest</sub>`, `PV of outflows at ${v('r')}<sub>finance</sub>`)})<sup>1/${v('n')}</sup> &minus; 1`,
  pi: `${v('PI')} = ${fr(`PV of future cash flows`, `Initial investment`)}${note('Under capital rationing, rank by PI as a first cut, then check the best combination that fits the budget.')}`,
  dol: `${v('DOL')} = ${fr('Contribution', 'EBIT')} &nbsp;&nbsp; ${v('DFL')} = ${fr('EBIT', `EBIT &minus; ${v('I')}`)} &nbsp;&nbsp; ${v('DCL')} = ${v('DOL')} &times; ${v('DFL')}`,
  ebitEps: `${v('EPS')} = ${fr(`(EBIT &minus; ${v('I')}) (1 &minus; ${v('t')})`, v('N'))} &nbsp;&nbsp; EBIT* = ${fr(`${v('I')}<sub>A</sub>${v('N')}<sub>B</sub> &minus; ${v('I')}<sub>B</sub>${v('N')}<sub>A</sub>`, `${v('N')}<sub>B</sub> &minus; ${v('N')}<sub>A</sub>`)}`,
  wc: `${v('DSO')} = ${fr('Receivables', 'Revenue')} &times; 365 &nbsp; ${v('DIO')} = ${fr('Inventory', 'COGS')} &times; 365 &nbsp; ${v('DPO')} = ${fr('Payables', 'COGS')} &times; 365<br>Operating cycle = ${v('DIO')} + ${v('DSO')} &nbsp;&nbsp; ${v('CCC')} = ${v('DIO')} + ${v('DSO')} &minus; ${v('DPO')}`,
  capm: `${v('K')}<sub>e</sub> = ${v('R')}<sub>f</sub> + &beta;<sub>L</sub> &times; ERP &nbsp;&nbsp; &beta;<sub>L</sub> = &beta;<sub>U</sub> [1 + (1 &minus; ${v('t')}) ${fr(v('D'), v('E'))}]${note('Hamada: beta rises with leverage because shareholders bear more risk.')}`,
  wacc: `WACC = ${fr(v('E'), `${v('D')} + ${v('E')}`)} ${v('K')}<sub>e</sub> + ${fr(v('D'), `${v('D')} + ${v('E')}`)} ${v('K')}<sub>d</sub> (1 &minus; ${v('t')})${note('Market-value weights. In CFO Arena, D is net debt (debt minus cash).')}`,
  bond: `${v('P')} = &sum;<sub>t=1</sub><sup>${v('n')}</sup> ${fr(v('C'), `(1 + ${v('y')})<sup>t</sup>`)} + ${fr(v('F'), `(1 + ${v('y')})<sup>${v('n')}</sup>`)}${note('With semi-annual coupons, C and y are halved and n doubled. Modified duration = Macaulay duration / (1 + y per period).')}`,
  duration: `${v('D')}<sub>Mac</sub> = ${fr(`&sum; ${v('t')} &times; PV(${v('CF')}<sub>t</sub>)`, v('P'))} &nbsp;&nbsp; ${v('D')}<sub>mod</sub> = ${fr(`${v('D')}<sub>Mac</sub>`, `1 + ${v('y')}/${v('m')}`)}`,
  gordon: `${v('P')}<sub>0</sub> = ${fr(`${v('D')}<sub>1</sub>`, `${v('r')} &minus; ${v('g')}`)} &nbsp;&nbsp; ${v('g')} = ${v('r')} &minus; ${fr(`${v('D')}<sub>1</sub>`, `${v('P')}<sub>0</sub>`)} &nbsp;&nbsp; ${fr(v('P'), v('E'))} = ${fr('Payout', `${v('r')} &minus; ${v('g')}`)}`,
  twoStage: `${v('P')}<sub>0</sub> = &sum;<sub>t=1</sub><sup>${v('n')}</sup> ${fr(`${v('D')}<sub>0</sub>(1 + ${v('g')}<sub>1</sub>)<sup>t</sup>`, `(1 + ${v('r')})<sup>t</sup>`)} + ${fr(`${v('D')}<sub>n</sub>(1 + ${v('g')}<sub>2</sub>)`, `(${v('r')} &minus; ${v('g')}<sub>2</sub>)(1 + ${v('r')})<sup>${v('n')}</sup>`)}`,
  fcff: `FCFF = EBIT (1 &minus; ${v('t')}) + Depreciation &minus; Capex &minus; &Delta;NWC`,
  terminal: `TV<sub>N</sub> = ${fr(`NOPAT<sub>N+1</sub> &minus; ${v('g')} &times; Invested capital<sub>N</sub>`, `WACC &minus; ${v('g')}`)}${note('Steady-state reinvestment: growing at g needs g times today’s capital.')}`,
  alpha: `&alpha; = ${fr(`1 + TSR`, `1 + ${v('K')}<sub>e</sub>`)} &minus; 1 &nbsp;&nbsp;(annualised)${note('TSR reinvests dividends. Ke is the cost of equity your own decisions created, year by year, so taking extra risk raises your hurdle.')}`,
  eva: `EVA = NOPAT &minus; WACC &times; Invested capital`,
};
