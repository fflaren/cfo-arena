/** Inline SVG icons (24x24, stroke-based). Static, trusted markup. */
const wrap = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  home: wrap('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>'),
  play: wrap('<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 14 4-4 3 3 5-6"/>'),
  toolkit: wrap('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 11h2M12 11h2M16 11h0"/><path d="M8 15h2M12 15h2M16 15v3"/><path d="M8 18h2M12 18h2"/>'),
  classroom: wrap('<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2A5 5 0 0 1 21 19"/>'),
  learn: wrap('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8 7h8M8 11h6"/>'),
  sun: wrap('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: wrap('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z"/>'),
  auto: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'),
  arrowRight: wrap('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
  arrowLeft: wrap('<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>'),
  check: wrap('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  copy: wrap('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  refresh: wrap('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  up: wrap('<path d="m4 15 6-6 4 4 6-6"/><path d="M15 7h5v5"/>'),
  down: wrap('<path d="m4 9 6 6 4-4 6 6"/><path d="M15 17h5v-5"/>'),
  alert: wrap('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>'),
  info: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  cycle: wrap('<path d="M20 12a8 8 0 0 1-13.7 5.7"/><path d="M4 12a8 8 0 0 1 13.7-5.7"/><path d="M18 3v4h-4M6 21v-4h4"/>'),
  factory: wrap('<path d="M3 21V10l6 4V10l6 4V6l6 3v12z"/><path d="M7 18h2M12 18h2M17 18h1"/>'),
  bank: wrap('<path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 21h18"/>'),
  coins: wrap('<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M15 11.2c3.2.2 6 1.4 6 2.8v5c0 1.7-2.7 3-6 3-2 0-3.9-.5-5-1.3"/>'),
  print: wrap('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>'),
  qr: wrap('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3M14 20v1"/>'),
};

/** An element containing an icon. */
export function icon(name, cls = '') {
  const holder = document.createElement('span');
  holder.innerHTML = ICONS[name] ?? '';
  const svg = holder.firstElementChild;
  if (!svg) return holder;
  svg.setAttribute('class', `svg-icon ${cls}`.trim());
  return svg;
}
