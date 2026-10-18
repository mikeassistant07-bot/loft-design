// ============================================================
// Parametric solver: target dimensions -> standard parts + layout
// Reproduces the temptingthyme.com DIY industrial pipe table:
//   2 end frames (cap -> leg -> tee -> 6" riser -> floor flange),
//   crossbar (nipple - tee - nipple) between the leg tees,
//   2 long rails joined by a middle tee whose riser + 5th flange
//   carry the center of the top.
// Coordinate system (cm): x = length, z = depth, y = up, origin at
// floor center of the table.
// ============================================================
import { PIPE, NIPPLE_STOCK, PIPE_STOCK, TOPS } from './config.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function snap(list, target) {
  let best = list[0];
  for (const s of list) if (Math.abs(s - target) < Math.abs(best - target)) best = s;
  return best;
}

// Snap to stock; if allowCut and no stock is within tol, return a custom cut
function snapPart(list, target, allowCut, tol = 2.5) {
  const stock = snap(list, target);
  if (allowCut && Math.abs(stock - target) > tol) return { len: Math.round(target * 10) / 10, cut: true };
  return { len: stock, cut: false };
}

// Part spans between two fittings at a FIXED distance: only a stock length
// within threading tolerance works, otherwise the store must cut & thread it.
function fixedSpanPart(list, ideal) {
  for (const s of list) if (Math.abs(s - ideal) <= 1.0) return { len: s, cut: false };
  return { len: Math.round(ideal * 10) / 10, cut: true };
}

// Largest stock length that fits within an available gap
function largestFitting(list, maxLen) {
  const fits = list.filter((s) => s <= maxLen);
  return fits.length ? fits[fits.length - 1] : list[0];
}

export function solve(state) {
  const P = PIPE[state.pipe];
  const top = TOPS.find((t) => t.id === state.top) || TOPS[0];
  const t = top.t;
  const eng = P.eng, e = P.e, b = P.b;
  const acc = state.accessories;

  // ---- vertical stack: floor -> top underside ------------------
  // Try every stock riser nipple x nearest stock leg to best hit the
  // target height while staying 100% off-the-shelf.
  const capEff = P.capH - eng;              // visible leg below the cap top
  let best = null;
  for (const riserLen of NIPPLE_STOCK) {
    if (riserLen < 5.1) continue;           // risers shorter than 2" make no sense
    const riserEff = riserLen - 2 * eng;
    const fixed = capEff + 2 * e + riserEff + P.flangeT + t;
    const leg = snapPart(PIPE_STOCK, state.H - fixed, state.allowCut);
    const Hr = capEff + leg.len + 2 * e + riserEff + P.flangeT + t;
    // reject combos where the rail tee branch would poke past the flange line
    const railYr = Hr - t - P.flangeT - riserEff - e;
    if (Hr - t - P.flangeT < railYr + P.b + 0.5) continue;
    const err = Math.round(Math.abs(Hr - state.H) * 10) / 10; // stable tie-break
    if (!best || err < best.err) best = { riserLen, riserEff, leg, H: Hr, err };
  }
  if (!best) best = { riserLen: 15.2, riserEff: 15.2 - 2 * eng, leg: snapPart(PIPE_STOCK, state.H - capEff - 2 * e - (15.2 - 2 * eng) - P.flangeT - t, state.allowCut), H: state.H, err: 0 };
  const { riserLen, riserEff, leg: legPart, H: H } = best;
  const topUnder = H - t;
  const flangeY = topUnder - P.flangeT;     // top of riser / bottom of flange
  const legTop = flangeY - riserEff;        // top face of leg pipe
  const teeY = legTop + e;                  // leg-tee run centerline
  const railY = teeY;                       // rails sit at the crossbar line

  // ---- crossbar & leg gauge ------------------------------------
  const legInset = clamp(state.legInset, 3, (state.D - 8) / 2);
  const halfGauge = state.D / 2 - legInset;              // leg centerline to table center
  const nipIdeal = halfGauge - e - b + 2 * eng;          // stock nipple length needed
  const nip = snapPart(NIPPLE_STOCK, nipIdeal, state.allowCut, 1.5);
  const nipEff = nip.len - 2 * eng;
  const gauge = 2 * (nipEff + e + b);                    // realized leg c/c distance
  const legInsetR = (state.D - gauge) / 2;

  // ---- long rails ----------------------------------------------
  const endInsetTarget = clamp(Math.round(state.L * 0.1), 5, 25);
  const railIdeal = state.L / 2 - endInsetTarget - e + 2 * eng + b;
  let rail;
  if (state.allowCut) {
    rail = snapPart(PIPE_STOCK, railIdeal, true, 2);
  } else {
    // prefer the stock that leaves a sane end overhang (>= 2.5 cm)
    let best = null;
    for (const s of PIPE_STOCK) {
      const span = 2 * (s + e - 2 * eng - b);
      const inset = (state.L - span) / 2;
      if (inset < 2.5) continue;
      if (!best || Math.abs(inset - endInsetTarget) < Math.abs(best.inset - endInsetTarget)) {
        best = { len: s, cut: false, inset };
      }
    }
    // fallback: shortest stock rail (top is too short for off-the-shelf rails)
    rail = best || { len: PIPE_STOCK[0], cut: false, inset: (state.L - 2 * (PIPE_STOCK[0] + e - 2 * eng - b)) / 2 };
  }
  const frameSpan = 2 * (rail.len + e - 2 * eng - b);    // c/c of the end frames
  const endInset = (state.L - frameSpan) / 2;

  // middle riser: same stock as the leg risers (as in the original build);
  // thread engagement slack absorbs the small difference ("tighten to suit")
  const midNip = { len: riserLen, cut: false };

  // ---- lower shelf accessory -----------------------------------
  let shelf = null;
  if (acc.lowerShelf) {
    const shelfY = clamp(Math.round(H * state.shelfYFactor), 10, railY - 8);
    const lowerLeg = snapPart(PIPE_STOCK, shelfY - e - capEff, state.allowCut);
    const upperLeg = snapPart(PIPE_STOCK, legTop - shelfY - e, state.allowCut);
    const sRailIdeal = gauge - 2 * b + 2 * eng;          // depth-wise rail between tee branches
    const sRail = fixedSpanPart(NIPPLE_STOCK.concat(PIPE_STOCK), sRailIdeal);
    shelf = {
      y: shelfY,
      lowerLeg, upperLeg, rail: sRail,
      L: frameSpan + 10,
      D: Math.round((gauge - P.od - 1.2) * 10) / 10,     // leg clearance
      t: top.type === 'perf' ? 0.5 : 1.8,
    };
  }

  // ---- hang rail accessory (front, under the top) ---------------
  // Pick the rail stock first, then place its tees to suit — no cutting needed.
  let hang = null;
  if (acc.hangRail) {
    const dropTarget = 12;
    const need = dropTarget - P.flangeT - b + 2 * eng;   // min nipple for the drop
    const nipLen = largestFitting(NIPPLE_STOCK, Math.max(need, 5.1));
    const y = topUnder - P.flangeT - (nipLen - 2 * eng) - b;
    const railIdealLen = frameSpan - 2 * b - 2 * e + 4 * eng;
    const railLen = largestFitting(NIPPLE_STOCK.concat(PIPE_STOCK), railIdealLen);
    hang = {
      y,
      nip: { len: nipLen, cut: false },
      rail: { len: railLen, cut: false },
      teeX: railLen / 2 - eng + e,                       // tee centers to suit the rail
      z: -gauge / 2 - 1.5,
    };
  }

  // ---- bill of materials ----------------------------------------
  const parts = [];
  const add = (qty, label, note, kind = 'pipe') => { if (qty > 0) parts.push({ qty, label, note, kind }); };

  const legLabel = (p) => `${p.cut ? 'Cut to' : ''} ${p.cut ? p.len.toFixed(1) + ' cm' : stockLabel(p.len)} ${P.label} pipe`;
  function stockLabel(cm) {
    const names = {
      2.5: '1"', 3.8: '1.5"', 5.1: '2"', 6.4: '2.5"', 7.6: '3"', 8.9: '3.5"', 10.2: '4"',
      12.7: '5"', 15.2: '6"', 20.3: '8"', 25.4: '10"', 30.5: '12"',
      30.5: '12"', 45.7: '18"', 61: '24"', 76.2: '30"', 91.4: '36"', 121.9: '48"', 152.4: '60"', 182.9: '72"',
    };
    if (names[cm]) return names[cm];
    return `${cm.toFixed(1)} cm`;
  }

  if (shelf) {
    add(4, legLabel(shelf.lowerLeg), 'lower leg');
    add(4, legLabel(shelf.upperLeg), 'upper leg');
  } else {
    add(4, legLabel(legPart), 'legs');
  }
  add(2, legLabel(rail), 'long rails, end to end');
  if (shelf) add(2, legLabel(shelf.rail), 'shelf support rails');
  if (hang) add(1, legLabel(hang.rail), 'hang rail');

  // group riser nipples by stock length (legs risers, center riser, hang drops)
  const nippleGroups = new Map();
  const bump = (len, cut, n) => {
    const k = len.toFixed(1);
    if (!nippleGroups.has(k)) nippleGroups.set(k, { len, cut, qty: 0, roles: [] });
    const g = nippleGroups.get(k);
    g.qty += n;
    g.cut = g.cut || cut;
  };
  bump(riserLen, false, 5);
  if (hang) bump(hang.nip.len, hang.nip.cut, 2);
  for (const g of nippleGroups.values()) {
    const role = g.len === riserLen && g.qty >= 5 ? 'top risers (4 legs + 1 center)' : 'hang rail drops';
    add(g.qty, `${g.cut ? 'Cut to ' + g.len.toFixed(1) + ' cm' : stockLabel(g.len)} ${P.label} nipple`, role);
  }
  add(4, `${stockLabel(nip.len)} ${P.label} nipple${nip.cut ? ' (cut to ' + nip.len.toFixed(1) + ' cm)' : ''}`, 'crossbar');
  const teeQty = 7 + (shelf ? 4 : 0) + (hang ? 2 : 0);
  add(teeQty, `${P.label} tee`, 'leg / rail joints');
  const flangeQty = 5 + (hang ? 2 : 0);
  add(flangeQty, `${P.label} floor flange`, 'mount under the top');
  add(acc.casters ? 0 : 4, `${P.label} pipe cap`, 'feet');
  if (acc.casters) add(4, 'Swivel caster w/ brake', 'stem or plate mount');
  add(flangeQty * 4 + 4, '#8 wood screw, 3/4"', 'flanges + shelf');

  // top material
  if (top.type === 'wood') {
    const plankCount = state.D > 46 ? 3 : state.D > 18 ? 2 : 1;
    const gap = 0.4;
    const w = (state.D - (plankCount - 1) * gap) / plankCount;
    add(plankCount, `${top.label} plank ${state.L.toFixed(0)} × ${w.toFixed(1)} × ${t} cm`, 'table top');
    if (plankCount > 1) add(plankCount - 1, 'Wood glue + biscuit / dowels', 'join planks');
  } else {
    add(1, `${top.label} ${state.L.toFixed(0)} × ${state.D.toFixed(1)} × ${t} cm`, 'table top');
    add(8, 'M6 countersunk bolt + nut', 'fix top to flanges');
  }
  if (shelf) {
    if (top.type === 'wood') add(1, `${top.label} shelf ${shelf.L.toFixed(0)} × ${shelf.D.toFixed(1)} × ${shelf.t} cm`, 'lower shelf');
    else add(1, `${top.label} shelf ${shelf.L.toFixed(0)} × ${shelf.D.toFixed(1)} × ${shelf.t} cm`, 'lower shelf');
  }

  const pipeTotal =
    (shelf ? 4 * (shelf.lowerLeg.len + shelf.upperLeg.len) : 4 * legPart.len) +
    2 * rail.len + 4 * riserLen + midNip.len + 4 * nip.len +
    (shelf ? 2 * shelf.rail.len : 0) + (hang ? hang.rail.len + 2 * hang.nip.len : 0);

  // ---- warnings --------------------------------------------------
  const warn = [];
  if (gauge < H / 3.2) warn.push(`Narrow base: legs are only ${gauge.toFixed(0)} cm apart vs ${H.toFixed(0)} cm height — the table may tip. Increase depth or leg inset.`);
  if (!legPart.cut && Math.abs(state.H - H) > 3) warn.push(`Height snaps to ${H.toFixed(1)} cm with stock parts (${stockLabel(legPart.len)} legs). Enable "allow cut & threaded" for exact height.`);
  if (endInset < 0) warn.push('The top is too short for off-the-shelf rails — enable "allow cut & threaded" or make the top longer.');
  else if (endInset < 2.5) warn.push('Rails almost touch the top ends — consider a longer top.');
  if (state.L > 200 && !acc.lowerShelf) warn.push('Long top: consider a second center riser in a v2 — or keep loads light.');
  if (nip.cut) warn.push('Crossbar nipples need cutting & threading at the store.');

  return {
    P, top, t, H, topUnder, flangeY, legTop, teeY, railY,
    gauge, legInsetR, endInset, frameSpan,
    legPart, rail, nip, midNip, riserEff, capEff,
    shelf, hang,
    parts, pipeTotal, warn,
    plankCount: top.type === 'wood' ? (state.D > 46 ? 3 : state.D > 18 ? 2 : 1) : 0,
  };
}
