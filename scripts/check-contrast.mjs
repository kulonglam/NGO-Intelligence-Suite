/**
 * Contrast gate for design-token pairs (WCAG 2.1 AA).
 * Text pairs need ≥ 4.5:1; large/UI pairs ≥ 3:1.
 */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = Number.parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a, b) {
  const L1 = luminance(a);
  const L2 = luminance(b);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

const pairs = [
  { name: 'ink on paper', fg: '#14262b', bg: '#f3f6f4', min: 4.5 },
  { name: 'ink-muted on paper', fg: '#3d555c', bg: '#f3f6f4', min: 4.5 },
  { name: 'on-brand on brand', fg: '#f4f8f7', bg: '#1f4e5f', min: 4.5 },
  { name: 'on-brand on brand-deep', fg: '#f4f8f7', bg: '#163944', min: 4.5 },
  { name: 'danger on paper', fg: '#8f2424', bg: '#f3f6f4', min: 4.5 },
  { name: 'ok on paper', fg: '#246247', bg: '#f3f6f4', min: 4.5 },
  { name: 'accent on white (button)', fg: '#ffffff', bg: '#a84a1a', min: 4.5 },
  { name: 'focus on brand (UI)', fg: '#c9a227', bg: '#1f4e5f', min: 3 },
];

let failed = false;
for (const p of pairs) {
  const r = ratio(p.fg, p.bg);
  const ok = r + 1e-6 >= p.min;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${p.name}: ${r.toFixed(2)} (need ≥ ${p.min})`);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
console.log('contrast: all token pairs pass');
