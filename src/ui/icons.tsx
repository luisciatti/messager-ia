const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconHash = () => (
  <svg {...base}><path d="M6 2 4.5 14M11.5 2 10 14M2.5 5.5h11.5M2 10.5h11.5" /></svg>
);
export const IconMemory = () => (
  <svg {...base}><rect x="2.5" y="3" width="11" height="10" rx="2" /><path d="M5.5 6.5h5M5.5 9.5h3" /></svg>
);
export const IconChart = () => (
  <svg {...base}><path d="M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5" /></svg>
);
export const IconPin = () => (
  <svg {...base}><path d="M9.5 2.5 13.5 6.5 11 7.5 8.5 10l.5 3-6-6 3 .5L8.5 5z" /><path d="m5.5 10.5-3 3" /></svg>
);
export const IconSend = () => (
  <svg {...base}><path d="M2.5 8 13.5 2.5 11 13.5 8 9z" /><path d="m8 9 5.5-6.5" /></svg>
);
export const IconMenu = () => (
  <svg {...base}><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /></svg>
);
export const IconImage = () => (
  <svg {...base}><rect x="2" y="3" width="12" height="10" rx="1.5" /><circle cx="6" cy="6.5" r="1.2" /><path d="m2.5 12 3.5-3.5 2.5 2.5 2-2 3 3" /></svg>
);
export const IconDiagram = () => (
  <svg {...base}><rect x="1.5" y="2.5" width="5" height="4" rx="1" /><rect x="9.5" y="9.5" width="5" height="4" rx="1" /><path d="M4 6.5v4.5h5.5" /></svg>
);
