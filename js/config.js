// ============================================================
// Loft Design — standard parts catalog
// All internal units are CENTIMETERS.
// Fitting dimensions are practical approximations of common
// NPT black-iron / galvanized fittings (verify at the store).
// ============================================================

// Pipe sizes (NPT nominal). OD = actual outside diameter.
// e  = tee: centerline -> face of run opening (half of run length)
// b  = tee: centerline of run -> face of branch opening
// flangeD/flangeT = floor flange diameter / thickness
// capH/capD       = pipe cap height / diameter
// eng             = thread engagement depth (how far pipe enters a fitting)
export const PIPE = {
  '1/2': { label: '1/2"', od: 2.13, e: 1.5, b: 2.2, flangeD: 7.0, flangeT: 0.9, capH: 2.6, capD: 3.0, eng: 1.0 },
  '3/4': { label: '3/4"', od: 2.67, e: 1.8, b: 2.6, flangeD: 8.3, flangeT: 1.0, capH: 3.0, capD: 3.5, eng: 1.2 },
  '1':   { label: '1"',   od: 3.34, e: 2.1, b: 3.0, flangeD: 9.8, flangeT: 1.1, capH: 3.4, capD: 4.1, eng: 1.4 },
};

// Off-the-shelf lengths sold in stores (US "close nipples" and full pipes)
export const NIPPLE_STOCK = [2.5, 3.8, 5.1, 6.4, 7.6, 8.9, 10.2, 12.7, 15.2, 20.3, 25.4, 30.5]; // 1"..12"
export const PIPE_STOCK = [30.5, 45.7, 61, 76.2, 91.4, 121.9, 152.4, 182.9]; // 12"..72"

// Table top options. t = thickness (cm)
export const TOPS = [
  { id: 'walnut', type: 'wood', label: 'Walnut', t: 3.8, base: '#4e3222', grain: '#38220f', light: '#6b452c', dark: '#2a1808' },
  { id: 'oak',    type: 'wood', label: 'Oak', t: 3.8, base: '#a87c4f', grain: '#85603a', light: '#c39a67', dark: '#6b4c2c' },
  { id: 'pine',   type: 'wood', label: 'Pine', t: 3.8, base: '#c9a468', grain: '#a5824c', light: '#e0c08a', dark: '#8a6b3d' },
  { id: 'ebony',  type: 'wood', label: 'Ebony (stained)', t: 3.8, base: '#2e2622', grain: '#1d1714', light: '#453a33', dark: '#141010' },
  { id: 'perf',   type: 'perf', label: 'Perforated steel', t: 0.5, holeD: 1.4, pitch: 4.2 },
  { id: 'steel',  type: 'steel', label: 'Brushed steel', t: 0.6 },
];

// Finishes for the pipe frame
export const FINISHES = {
  black: { label: 'Black iron', color: 0x2b2b2f, roughness: 0.52, metalness: 0.85 },
  galv:  { label: 'Galvanized', color: 0x9fa6ad, roughness: 0.38, metalness: 0.92 },
};

export const PRESETS = {
  sofa:    { label: 'Sofa table (the original)', L: 188, D: 30.5, H: 85, top: 'walnut', legInset: 8.5 },
  desk:    { label: 'Desk',                      L: 150, D: 70,  H: 74, top: 'oak',    legInset: 14 },
  dining:  { label: 'Dining table',              L: 180, D: 90,  H: 76, top: 'walnut', legInset: 18 },
  coffee:  { label: 'Coffee table',              L: 110, D: 60,  H: 45, top: 'ebony',  legInset: 12 },
  bar:     { label: 'Bar / counter',             L: 160, D: 60,  H: 105, top: 'steel', legInset: 12 },
  side:    { label: 'Side table',                L: 55,  D: 55,  H: 55, top: 'pine',   legInset: 10 },
};

export const DEFAULT_STATE = {
  preset: 'sofa',
  L: 188, D: 30.5, H: 85,
  pipe: '1/2',
  finish: 'black',
  top: 'walnut',
  legInset: 8.5,
  allowCut: false,
  accessories: { casters: false, hangRail: false, lowerShelf: false },
  shelfYFactor: 0.32,     // lower shelf height as a fraction of H
  units: 'cm',            // 'cm' | 'in'
  autoRotate: true,
};

export const INCH = 2.54;

export function fmtLen(cm, units) {
  if (units === 'in') {
    const inch = cm / INCH;
    const whole = Math.floor(inch);
    const frac = Math.round((inch - whole) * 16);
    if (frac === 16) return `${whole + 1}"`;
    if (frac === 0) return `${whole}"`;
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const d = 16 / gcd(frac, 16);
    const n = frac / gcd(frac, 16);
    return whole > 0 ? `${whole} ${n}/${d}"` : `${n}/${d}"`;
  }
  return `${(Math.round(cm * 10) / 10).toLocaleString('en-US')} cm`;
}
