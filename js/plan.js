// ============================================================
// CAD plan generator: 2-sheet A4-landscape drawing set (SVG)
//   Sheet 1: front / side / top orthographic views with
//            dimensions + isometric 3D render
//   Sheet 2: every part as a 2D cut-sheet drawing
// Pure vector SVG -> print / save as PDF from the browser.
// ============================================================

const INK = '#1a1c20';

// ---------- tiny SVG sheet builder (units: mm) -----------------
class Sheet {
  constructor(title) {
    this.title = title;
    this.el = [];
    this.defs = [];
  }
  add(s) { this.el.push(s); }
  line(x1, y1, x2, y2, cls = 't') {
    this.add(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" class="${cls}"/>`);
  }
  rect(x, y, w, h, cls = 't', fill = 'none') {
    const style = fill !== 'none' ? ` style="fill:${fill}"` : '';
    this.add(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" class="${cls}"${style}/>`);
  }
  circle(cx, cy, r, cls = 't', fill = 'none') {
    const style = fill !== 'none' ? ` style="fill:${fill}"` : '';
    this.add(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" class="${cls}"${style}/>`);
  }
  poly(pts, cls = 'dimarr') {
    this.add(`<polygon points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" class="${cls}"/>`);
  }
  text(x, y, str, o = {}) {
    const { size = 2.6, anchor = 'middle', cls = 'lbl', rot = 0 } = o;
    const tr = rot ? ` transform="rotate(${rot} ${f(x)} ${f(y)})"` : '';
    this.add(`<text x="${f(x)}" y="${f(y)}" font-size="${size}" text-anchor="${anchor}" class="${cls}"${tr}>${esc(str)}</text>`);
  }
  // horizontal dimension with arrows + witnesses
  dimH(x1, x2, y, label, witnessY) {
    this.line(x1, witnessY, x1, y + 1.2, 'ext');
    this.line(x2, witnessY, x2, y + 1.2, 'ext');
    this.line(x1, y, x2, y, 'dim');
    this.poly([[x1, y], [x1 + 2.2, y - 0.7], [x1 + 2.2, y + 0.7]]);
    this.poly([[x2, y], [x2 - 2.2, y - 0.7], [x2 - 2.2, y + 0.7]]);
    this.text((x1 + x2) / 2, y - 1.1, label, { size: 2.7 });
  }
  dimV(x, y1, y2, label, witnessX, rotLabel = true) {
    this.line(witnessX, y1, x - 1.2, y1, 'ext');
    this.line(witnessX, y2, x - 1.2, y2, 'ext');
    this.line(x, y1, x, y2, 'dim');
    this.poly([[x, y1], [x - 0.7, y1 + 2.2], [x + 0.7, y1 + 2.2]]);
    this.poly([[x, y2], [x - 0.7, y2 - 2.2], [x + 0.7, y2 - 2.2]]);
    this.text(x - 1.2, (y1 + y2) / 2, label, { size: 2.7, rot: rotLabel ? -90 : 0 });
  }
}

const f = (n) => Math.round(n * 100) / 100;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// map real cm (x right, y UP) -> sheet mm
function mapper(ox, oy, s) {
  return {
    s,
    X: (x) => ox + x * s,
    Y: (y) => oy - y * s,
  };
}

// fit scale (mm per cm) for a real-size box into a paper box
function fitScale(wReal, hReal, wPaper, hPaper) {
  return Math.min(wPaper / Math.max(wReal, 0.1), hPaper / Math.max(hReal, 0.1));
}

const HATCH = (id, color, gap, angle) =>
  `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})">` +
  `<line x1="0" y1="0" x2="0" y2="${gap}" stroke="${color}" stroke-width="0.18"/></pattern>`;

// ---------- orthographic view content (real cm, y up) ----------
// prims: rect(x,y,w,h,hatch) with y = bottom, circ(cx,cy,r), cline(x1,y1,x2,y2)
function frontPrims(S, state) {
  const P = S.P, r = P.od / 2, fx = S.frameSpan / 2;
  const p = [];
  p.push({ t: 'rect', x: -state.L / 2, y: S.H - S.t, w: state.L, h: S.t, hatch: S.top.type === 'wood' ? 'wood' : 'metal' });
  for (const sx of [-1, 1]) {
    const x = sx * fx;
    p.push({ t: 'rect', x: x - P.capD / 2, y: 0, w: P.capD, h: P.capH });
    p.push({ t: 'rect', x: x - r, y: S.capEff, w: P.od, h: S.legTop - S.capEff });
    p.push({ t: 'rect', x: x - P.e, y: S.legTop, w: 2 * P.e, h: 2 * P.e });
    p.push({ t: 'rect', x: x - r, y: S.legTop + 2 * P.e, w: P.od, h: S.flangeY - S.legTop - 2 * P.e });
    p.push({ t: 'rect', x: x - P.flangeD / 2, y: S.flangeY, w: P.flangeD, h: P.flangeT });
    p.push({ t: 'cline', x1: x, y1: -2, x2: x, y2: S.H + 2 });
  }
  // rails + middle tee + center riser
  p.push({ t: 'rect', x: -fx + P.b - P.eng, y: S.railY - r, w: 2 * (fx - P.b + P.eng), h: P.od });
  p.push({ t: 'rect', x: -P.e, y: S.railY - r, w: 2 * P.e, h: P.od });
  p.push({ t: 'rect', x: -r, y: S.railY + P.b - P.eng, w: P.od, h: S.flangeY - S.railY - P.b + P.eng });
  p.push({ t: 'rect', x: -P.flangeD / 2, y: S.flangeY, w: P.flangeD, h: P.flangeT });
  p.push({ t: 'cline', x1: -state.L / 2 - 2, y1: S.railY, x2: state.L / 2 + 2, y2: S.railY });
  return p;
}

function sidePrims(S, state) {
  const P = S.P, r = P.od / 2, lz = S.gauge / 2;
  const p = [];
  p.push({ t: 'rect', x: -state.D / 2, y: S.H - S.t, w: state.D, h: S.t, hatch: S.top.type === 'wood' ? 'wood' : 'metal' });
  for (const sz of [-1, 1]) {
    const z = sz * lz;
    p.push({ t: 'rect', x: z - P.capD / 2, y: 0, w: P.capD, h: P.capH });
    p.push({ t: 'rect', x: z - r, y: S.capEff, w: P.od, h: S.legTop - S.capEff });
    p.push({ t: 'rect', x: z - P.e, y: S.legTop, w: 2 * P.e, h: 2 * P.e });
    p.push({ t: 'rect', x: z - r, y: S.legTop + 2 * P.e, w: P.od, h: S.flangeY - S.legTop - 2 * P.e });
    p.push({ t: 'rect', x: z - P.flangeD / 2, y: S.flangeY, w: P.flangeD, h: P.flangeT });
    p.push({ t: 'cline', x1: z, y1: -2, x2: z, y2: S.H + 2 });
    p.push({ t: 'rect', x: z - r, y: S.legTop, w: P.od, h: 2 * P.e }); // leg-tee run (vertical)
  }
  // crossbar between leg tees + center tee
  p.push({ t: 'rect', x: -(lz - P.b), y: S.teeY - r, w: 2 * (lz - P.b), h: P.od });
  p.push({ t: 'rect', x: -P.e, y: S.teeY - P.e, w: 2 * P.e, h: 2 * P.e });
  // center riser + flange (on the rail, x=0 -> visible in side view)
  p.push({ t: 'rect', x: -r, y: S.teeY + P.b - P.eng, w: P.od, h: S.flangeY - S.teeY - P.b + P.eng });
  p.push({ t: 'rect', x: -P.flangeD / 2, y: S.flangeY, w: P.flangeD, h: P.flangeT });
  p.push({ t: 'cline', x1: -state.D / 2 - 2, y1: S.teeY, x2: state.D / 2 + 2, y2: S.teeY });
  if (S.shelf) {
    p.push({ t: 'rect', x: -S.shelf.D / 2, y: S.shelf.y + r, w: S.shelf.D, h: S.shelf.t, hatch: S.top.type === 'wood' ? 'wood' : 'metal' });
    for (const sz of [-1, 1]) p.push({ t: 'rect', x: sz * lz - r, y: S.shelf.y - r, w: P.od, h: P.od });
    p.push({ t: 'rect', x: -(lz - P.b), y: S.shelf.y - r, w: 2 * (lz - P.b), h: P.od });
  }
  if (S.hang) {
    p.push({ t: 'rect', x: S.hang.z - r, y: S.topUnder - P.flangeT, w: P.od, h: (S.topUnder - P.flangeT) - S.hang.y });
    p.push({ t: 'circ', cx: S.hang.z, cy: S.hang.y, r: r });
  }
  return p;
}

function topPrims(S, state) {
  const P = S.P, fx = S.frameSpan / 2, lz = S.gauge / 2;
  const p = [];
  p.push({ t: 'rect', x: -state.L / 2, y: -state.D / 2, w: state.L, h: state.D, hatch: S.top.type === 'wood' ? 'wood' : 'metal' });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.push({ t: 'circ', cx: sx * fx, cy: sz * lz, r: P.flangeD / 2, dash: true });
    }
    // rails (hidden under top) + crossbar
    p.push({ t: 'cline', x1: -fx, y1: 0, x2: fx, y2: 0 });
    p.push({ t: 'cline', x1: sx * fx, y1: -lz, x2: sx * fx, y2: lz });
  }
  p.push({ t: 'cline', x1: -state.L / 2 - 2, y1: 0, x2: state.L / 2 + 2, y2: 0 });
  p.push({ t: 'cline', x1: 0, y1: -state.D / 2 - 2, x2: 0, y2: state.D / 2 + 2 });
  if (S.shelf) p.push({ t: 'rect', x: -S.shelf.L / 2, y: -S.shelf.D / 2, w: S.shelf.L, h: S.shelf.D, dash: true });
  if (S.hang) p.push({ t: 'cline', x1: -S.hang.teeX, y1: S.hang.z, x2: S.hang.teeX, y2: S.hang.z });
  return p;
}

// render prims through a mapper onto a sheet
function drawPrims(sheet, prims, M) {
  for (const p of prims) {
    if (p.t === 'rect') {
      const x = M.X(p.x), y = M.Y(p.y + p.h), w = p.w * M.s, h = p.h * M.s;
      if (w < 0.45 || h < 0.45) { // too thin on paper -> draw as double line
        sheet.rect(x, y, Math.max(w, 0.45), Math.max(h, 0.45));
      } else {
        sheet.rect(x, y, w, h, 't', p.hatch ? `url(#${p.hatch}${sheetTitleId(sheet)})` : 'none');
      }
    } else if (p.t === 'circ') {
      const c = sheetTitleId(sheet);
      sheet.circle(M.X(p.cx), M.Y(p.cy), Math.max(p.r * M.s, 0.6), p.dash ? 'hid' : 't');
      void c;
    } else if (p.t === 'cline') {
      sheet.line(M.X(p.x1), M.Y(p.y1), M.X(p.x2), M.Y(p.y2), 'cl');
    }
  }
}

// sheet identity for hatch pattern ids
const _ids = new WeakMap();
let _idc = 0;
function sheetTitleId(sheet) {
  if (!_ids.has(sheet)) _ids.set(sheet, 's' + (_idc++));
  return _ids.get(sheet);
}

// ---------- part cards (sheet 2) --------------------------------
function partCards(S, state) {
  const P = S.P, cards = [];
  const pipeCard = (label, len, qty, cut, note = '') =>
    cards.push({ kind: 'pipe', label, qty, len, cut, note, od: P.od });
  if (S.shelf) {
    pipeCard('Leg — lower section', S.shelf.lowerLeg.len, 4, S.shelf.lowerLeg.cut);
    pipeCard('Leg — upper section', S.shelf.upperLeg.len, 4, S.shelf.upperLeg.cut);
  } else {
    pipeCard('Leg', S.legPart.len, 4, S.legPart.cut);
  }
  pipeCard('Long rail', S.rail.len, 2, S.rail.cut, 'end frame to end frame');
  pipeCard('Top riser', S.midNip.len, 5, false, '4 legs + 1 center');
  pipeCard('Crossbar nipple', S.nip.len, 4, S.nip.cut);
  if (S.shelf) pipeCard('Shelf support rail', S.shelf.rail.len, 2, S.shelf.rail.cut);
  if (S.hang) {
    pipeCard('Hang rail', S.hang.rail.len, 1, false);
    pipeCard('Hang drop', S.hang.nip.len, 2, false);
  }
  cards.push({ kind: 'tee', label: 'Tee', qty: 7 + (S.shelf ? 4 : 0) + (S.hang ? 2 : 0), od: P.od, e: P.e, b: P.b });
  cards.push({ kind: 'flange', label: 'Floor flange', qty: 5 + (S.hang ? 2 : 0), dia: P.flangeD, t: P.flangeT, od: P.od });
  if (state.accessories.casters) cards.push({ kind: 'caster', label: 'Swivel caster w/ brake', qty: 4 });
  else cards.push({ kind: 'cap', label: 'Pipe cap (foot)', qty: 4, capH: P.capH, capD: P.capD });
  if (S.top.type === 'wood') {
    const n = S.plankCount, gap = 0.4;
    const w = (state.D - (n - 1) * gap) / n;
    cards.push({ kind: 'board', label: `${S.top.label} plank — top`, qty: n, L: state.L, w, t: S.t, mat: 'wood' });
    if (n > 1) cards.push({ kind: 'text', label: 'Wood glue + biscuits/dowels', qty: n - 1, note: 'join planks' });
  } else {
    cards.push({ kind: 'plate', label: `${S.top.label} — top`, qty: 1, L: state.L, w: state.D, t: S.t, holeD: S.top.holeD, pitch: S.top.pitch });
  }
  if (S.shelf) cards.push({ kind: 'board', label: `Shelf board (${S.top.label})`, qty: 1, L: S.shelf.L, w: S.shelf.D, t: S.shelf.t, mat: S.top.type === 'wood' ? 'wood' : 'metal' });
  cards.push({ kind: 'text', label: '#8 wood screw 3/4"', qty: (5 + (S.hang ? 2 : 0)) * 4 + 4, note: 'flanges' + (S.shelf ? ' + shelf' : '') });
  if (S.top.type !== 'wood') cards.push({ kind: 'text', label: 'M6 countersunk bolt + nut', qty: 8, note: 'fix top to flanges' });
  return cards;
}

function drawCard(sheet, card, x, y, w, h) {
  sheet.rect(x, y, w, h, 'frame');
  const pad = 3;
  const dx = x + pad, dy = y + 4, dw = w - 2 * pad, dh = h - 15;
  const S = 10; // cm -> mm helper
  if (card.kind === 'pipe') {
    const s = Math.min(dw / card.len, (dh - 8) / card.od);
    const cx = dx + dw / 2, cy = dy + dh / 2;
    const L = card.len * s, od = Math.max(card.od * s, 1.4);
    sheet.rect(cx - L / 2, cy - od / 2, L, od, 't');
    sheet.line(cx - L / 2 - 2, cy, cx + L / 2 + 2, cy, 'cl');
    sheet.dimH(cx - L / 2, cx + L / 2, cy + od / 2 + 4, lenLabel(card), cy + od / 2);
    sheet.text(x + w / 2, y + h - 8.6, `Ø ${f(card.od * 10)} mm pipe`, { size: 2.2, cls: 'sub' });
  } else if (card.kind === 'tee') {
    const cx = dx + dw / 2, cy = dy + dh / 2 + 2;
    const run = 16, br = 9, od = 5;
    sheet.rect(cx - run / 2, cy - od / 2, run, od, 't');
    sheet.rect(cx - od / 2, cy - od / 2 - br, od, br, 't');
    sheet.line(cx - run / 2 - 2, cy, cx + run / 2 + 2, cy, 'cl');
    sheet.line(cx, cy - od / 2 - br - 2, cx, cy + od / 2 + 2, 'cl');
    sheet.dimH(cx - run / 2, cx + run / 2, cy + od / 2 + 4.5, `${f(2 * card.e)} cm c/c`, cy + od / 2);
  } else if (card.kind === 'flange') {
    const cx = dx + dw / 2, cy = dy + dh / 2 + 1;
    const s = Math.min(dw / 3.4 / card.dia, (dh - 6) / card.dia);
    sheet.circle(cx, cy, (card.dia / 2) * s, 't');
    sheet.circle(cx, cy, (card.od / 2) * s * 1.4, 't');
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      sheet.circle(cx + Math.cos(a) * (card.dia / 2 - 0.85) * s, cy - Math.sin(a) * (card.dia / 2 - 0.85) * s, 0.9, 't');
    }
    sheet.rect(cx + (card.dia / 2) * s + 4, cy - 1.4, 6, 2.8, 't');
    sheet.text(cx + (card.dia / 2) * s + 7, cy + 4.4, `Ø ${f(card.dia)} cm`, { size: 2.1, cls: 'sub' });
  } else if (card.kind === 'cap') {
    const cx = dx + dw / 2, cy = dy + dh / 2 + 2;
    sheet.rect(cx - 4, cy, 8, 5, 't');
    sheet.add(`<path d="M ${f(cx - 4)},${f(cy)} A 4 2.6 0 0 1 ${f(cx + 4)},${f(cy)}" class="t"/>`);
    sheet.dimV(cx + 12, cy - 2.6, cy + 5, `${f(card.capH)} cm`, cx + 4, false);
  } else if (card.kind === 'caster') {
    const cx = dx + dw / 2, cy = dy + dh / 2;
    sheet.rect(cx - 6, cy - 4, 12, 1.2, 't');
    sheet.line(cx - 3.4, cy - 2.8, cx - 2.2, cy + 4.4, 't');
    sheet.line(cx + 3.4, cy - 2.8, cx + 2.2, cy + 4.4, 't');
    sheet.circle(cx, cy + 1.6, 3, 't');
    sheet.circle(cx, cy + 1.6, 1.1, 't');
  } else if (card.kind === 'board' || card.kind === 'plate') {
    const s = Math.min((dw - 14) / card.L, (dh - 16) / card.w);
    const cx = dx + dw / 2, cy = dy + dh / 2;
    const L = card.L * s, W = card.w * s;
    sheet.rect(cx - L / 2, cy - W / 2, L, W, 't', card.mat === 'wood' ? `url(#wood${sheetTitleId(sheet)})` : 'none');
    if (card.kind === 'plate') {
      const step = Math.max(card.pitch * s, 2.2);
      for (let px = cx - L / 2 + step; px < cx + L / 2 - step / 2; px += step)
        for (let py = cy - W / 2 + step; py < cy + W / 2 - step / 2; py += step)
          sheet.circle(px + ((Math.round((py - cy + W / 2) / step) % 2) * step) / 2, py, Math.max(card.holeD * s / 2, 0.5), 'thin');
    }
    sheet.dimH(cx - L / 2, cx + L / 2, cy + W / 2 + 4, lenLabel({ len: card.L }), cy + W / 2);
    sheet.dimV(cx + L / 2 + 4, cy - W / 2, cy + W / 2, lenLabel({ len: card.w }), cx + L / 2, false);
  } else {
    sheet.text(x + w / 2, dy + dh / 2, `${card.qty}×`, { size: 7, cls: 'big' });
    if (card.note) sheet.text(x + w / 2, dy + dh / 2 + 5, card.note, { size: 2.2, cls: 'sub' });
  }
  // caption
  sheet.text(x + 2, y + h - 4.6, `${card.qty}×  ${card.label}${card.cut ? '  — CUT ' + f(card.len) + ' cm & thread' : ''}`, { size: 2.6, anchor: 'start' });
}

function lenLabel(p) {
  return `${f(p.len)} cm`;
}

// ---------- document --------------------------------------------
export function buildPlanDocument(S, state, isoUrl) {
  const sheets = [];
  const PW = 297, PH = 210, M = 8;

  // ======== SHEET 1: views ========
  const sh1 = new Sheet('VIEWS');
  sh1.defs.push(HATCH('wood' + sheetTitleId(sh1), '#7a6a52', 1.6, 45));
  sh1.defs.push(HATCH('metal' + sheetTitleId(sh1), '#5a636e', 1.2, 45));

  const frameBox = (x, y, w, h, title, scaleTxt) => {
    sh1.rect(x, y, w, h, 'frame');
    sh1.text(x + 2, y + h - 2, title, { size: 3.2, anchor: 'start', cls: 'viewttl' });
    if (scaleTxt) sh1.text(x + w - 2, y + h - 2, scaleTxt, { size: 2.4, anchor: 'end', cls: 'sub' });
  };

  // FRONT
  {
    const bx = M + 2, by = M + 2, bw = 128, bh = 92;
    frameBox(bx, by, bw, bh, 'FRONT ELEVATION');
    const s = fitScale(state.L + 8, S.H + 8, bw - 18, bh - 16);
    const Mm = mapper(bx + bw / 2, by + bh - 10, s);
    drawPrims(sh1, frontPrims(S, state), Mm);
    sh1.dimH(Mm.X(-state.L / 2), Mm.X(state.L / 2), by + bh - 4, fmt(state.L, state), Mm.Y(0));
    sh1.dimV(Mm.X(state.L / 2) + 5, Mm.Y(S.H), Mm.Y(0), fmt(S.H, state), Mm.X(state.L / 2));
    sh1.text(Mm.X(0), Mm.Y(S.railY) - 3, `rail Ø ${S.P.label}`, { size: 2, cls: 'sub' });
  }
  // SIDE
  {
    const bx = M + 134, by = M + 2, bw = 66, bh = 92;
    frameBox(bx, by, bw, bh, 'SIDE');
    const s = fitScale(state.D + 8, S.H + 8, bw - 16, bh - 16);
    const Mm = mapper(bx + bw / 2, by + bh - 10, s);
    drawPrims(sh1, sidePrims(S, state), Mm);
    sh1.dimH(Mm.X(-state.D / 2), Mm.X(state.D / 2), by + bh - 4, fmt(state.D, state), Mm.Y(0));
    sh1.dimV(Mm.X(state.D / 2) + 4.5, Mm.Y(S.H), Mm.Y(0), fmt(S.H, state), Mm.X(state.D / 2));
    sh1.dimH(Mm.X(-S.gauge / 2), Mm.X(S.gauge / 2), Mm.Y(0) - 7, fmt(S.gauge, state) + ' gauge', Mm.Y(0));
  }
  // TOP
  {
    const bx = M + 2, by = M + 98, bw = 128, bh = 62;
    frameBox(bx, by, bw, bh, 'PLAN');
    const s = fitScale(state.L + 8, state.D + 8, bw - 16, bh - 14);
    const Mm = mapper(bx + bw / 2, by + bh / 2 + 2, s);
    drawPrims(sh1, topPrims(S, state), Mm);
    sh1.dimH(Mm.X(-state.L / 2), Mm.X(state.L / 2), by + bh - 4, fmt(state.L, state), Mm.Y(-state.D / 2));
    sh1.dimV(Mm.X(state.L / 2) + 5, Mm.Y(-state.D / 2), Mm.Y(state.D / 2), fmt(state.D, state), Mm.X(state.L / 2), false);
    sh1.dimH(Mm.X(-S.frameSpan / 2), Mm.X(S.frameSpan / 2), Mm.Y(state.D / 2) - 4, fmt(S.frameSpan, state) + ' frame c/c', Mm.Y(S.gauge / 2));
  }
  // ISO
  {
    const bx = M + 138, by = M + 98, bw = 143, bh = 62;
    frameBox(bx, by, bw, bh, 'ISOMETRIC VIEW');
    if (isoUrl) {
      sh1.add(`<image x="${bx + 4}" y="${by + 3}" width="${bw - 8}" height="${bh - 9}" preserveAspectRatio="xMidYMid meet" href="${isoUrl}"/>`);
    } else {
      sh1.text(bx + bw / 2, by + bh / 2, '(open the 3D configurator for the live view)', { size: 3, cls: 'sub' });
    }
  }
  // NOTES
  {
    const bx = M + 2, by = M + 164, bw = 178, bh = 30;
    sh1.rect(bx, by, bw, bh, 'frame');
    sh1.text(bx + 2, by + 5, 'NOTES', { size: 2.8, anchor: 'start', cls: 'viewttl' });
    const notes = [
      '1. All fittings 1/2" malleable iron; wash parts (dish soap + TSP) before assembly.',
      '2. Threads never fully tighten — use the slack to level the top (see build source).',
      '3. If the table wobbles, swap feet caps for floor flanges or felt pads.',
      '4. Fix flanges to the top with #8 × 3/4" wood screws, 4 per flange.',
    ];
    notes.forEach((n, i) => sh1.text(bx + 3, by + 10 + i * 4.6, n, { size: 2.5, anchor: 'start' }));
  }
  titleBlock(sh1, 1, 2, S, state);
  sheets.push(sh1);

  // ======== SHEET 2+: parts ========
  const cards = partCards(S, state);
  const perPage = 12;
  const pages = Math.max(1, Math.ceil(cards.length / perPage));
  for (let pg = 0; pg < pages; pg++) {
    const sh = new Sheet('PARTS');
    sh.defs.push(HATCH('wood' + sheetTitleId(sh), '#7a6a52', 1.6, 45));
    sh.defs.push(HATCH('metal' + sheetTitleId(sh), '#5a636e', 1.2, 45));
    sh.text(M + 2, M + 6, pages > 1 ? `PARTS — 2D CUT SHEET  (${pg + 1}/${pages})` : 'PARTS — 2D CUT SHEET', { size: 4.5, anchor: 'start', cls: 'viewttl' });
    sh.text(PW - M - 2, M + 6, 'drawings proportional — fittings schematic', { size: 2.4, anchor: 'end', cls: 'sub' });
    const cols = 4, rows = 3;
    const cw = (PW - 2 * M - 3 * 3) / cols, ch = 40;
    const chunk = cards.slice(pg * perPage, (pg + 1) * perPage);
    chunk.forEach((card, i) => {
      const cx = M + (i % cols) * (cw + 3);
      const cy = M + 10 + Math.floor(i / cols) * (ch + 3);
      drawCard(sh, card, cx, cy, cw, ch);
    });
    titleBlock(sh, 2 + pg, 1 + pages, S, state);
    sheets.push(sh);
  }

  // ======== html ========
  const body = sheets
    .map((sh, i) => `<div class="sheet">${sh.svg(`0 0 ${PW} ${PH}`)}</div>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pipe table — CAD plan ${f(state.L)}×${f(state.D)}×${f(S.H)} cm</title><style>${css()}</style></head><body>
  <div class="bar"><span>LOFT//DESIGN — CAD plan & parts</span>
    <button onclick="window.print()">🖨 Print / Save as PDF</button></div>
  ${body}</body></html>`;
}

function fmt(cm, state) {
  return state.units === 'in' ? `${(cm / 2.54).toFixed(1)}"` : `${f(cm)} cm`;
}

function titleBlock(sh, sheetNo, sheetTotal, S, state) {
  const x = 297 - 8 - 96, y = 210 - 8 - 26, w = 96, h = 26;
  sh.rect(x, y, w, h, 'thick');
  sh.line(x + 58, y, x + 58, y + h, 't');
  sh.line(x, y + 13, x + w, y + 13, 't');
  sh.text(x + 2, y + 5.4, 'INDUSTRIAL PIPE TABLE', { size: 3.6, anchor: 'start', cls: 'viewttl' });
  sh.text(x + 2, y + 10.4, `LOFT//DESIGN configurator · ${new Date().toISOString().slice(0, 10)}`, { size: 2.3, anchor: 'start', cls: 'sub' });
  sh.text(x + 2, y + 17.4, `TOP  ${f(state.L)} × ${f(state.D)} × ${f(S.t)} cm — ${S.top.label}`, { size: 2.5, anchor: 'start' });
  sh.text(x + 2, y + 22.6, `HEIGHT ${f(S.H)} cm · PIPE ${S.P.label} ${state.finish === 'galv' ? 'GALVANIZED' : 'BLACK IRON'}`, { size: 2.5, anchor: 'start' });
  sh.text(x + 61, y + 5.4, `SHEET ${sheetNo} / ${sheetTotal}`, { size: 3, anchor: 'start', cls: 'viewttl' });
  sh.text(x + 61, y + 10.4, 'SCALE: AS NOTED', { size: 2.3, anchor: 'start', cls: 'sub' });
  sh.text(x + 61, y + 17.4, 'UNITS: CM', { size: 2.3, anchor: 'start', cls: 'sub' });
  sh.text(x + 61, y + 22.6, 'PROJECTION: FIRST ANGLE', { size: 2.3, anchor: 'start', cls: 'sub' });
}

Sheet.prototype.svg = function (viewBox) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}" class="plan">
    <defs>${this.defs.join('')}
      <style>
        .t{stroke:${INK};stroke-width:0.35;fill:none}
        .thick{stroke:${INK};stroke-width:0.7;fill:none}
        .frame{stroke:${INK};stroke-width:0.5;fill:none}
        .dim{stroke:${INK};stroke-width:0.22;fill:none}
        .ext{stroke:${INK};stroke-width:0.15;fill:none}
        .cl{stroke:#8a6d3a;stroke-width:0.18;stroke-dasharray:4 1.2 0.8 1.2;fill:none}
        .hid{stroke:${INK};stroke-width:0.25;stroke-dasharray:1.4 1;fill:none}
        .thin{stroke:${INK};stroke-width:0.15;fill:none}
        .dimarr{fill:${INK}}
        text{font-family:'Segoe UI',system-ui,sans-serif;fill:${INK}}
        .lbl{font-weight:600}
        .sub{fill:#5a5e66}
        .viewttl{font-weight:700;letter-spacing:0.06em}
        .big{font-weight:700;fill:#5a5e66}
        .plan{width:100%;height:100%;display:block;background:#fdfdfb}
      </style>
    </defs>
    ${this.el.join('\n')}
  </svg>`;
};

function css() {
  return `
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #3a3d42; font-family: 'Segoe UI', system-ui, sans-serif; }
    .bar { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center;
           padding: 8px 14px; background: #17181c; color: #e8e6e1; font-size: 13px; }
    .bar button { background: #e0862a; border: 0; border-radius: 6px; padding: 8px 14px; font-weight: 600; cursor: pointer; }
    .sheet { width: 297mm; height: 210mm; margin: 10px auto; background: #fdfdfb; box-shadow: 0 2px 14px #0007; }
    @media print {
      body { background: #fff; }
      .bar { display: none; }
      .sheet { margin: 0; box-shadow: none; page-break-after: always; }
    }
  `;
}

// ---------- open (popup with fallback) ---------------------------
export function openPlan(S, state, isoUrl) {
  const html = buildPlanDocument(S, state, isoUrl);
  const win = window.open('', '_blank');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return true;
  }
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pipe-table-plan.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return false;
}
