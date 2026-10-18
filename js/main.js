// ============================================================
// UI wiring: state -> solve -> 3D + BOM
// ============================================================
import { DEFAULT_STATE, PRESETS, TOPS, PIPE, FINISHES, fmtLen, INCH } from './config.js';
import { solve } from './solver.js';
import { initScene, rebuildTable, setAutoRotate, frameTable, captureISO } from './scene.js';
import { renderBOM, downloadBOM, copyBOM } from './bom.js';
import { openPlan } from './plan.js';

const state = structuredClone(DEFAULT_STATE);
const $ = (id) => document.getElementById(id);

// ---------- URL params (shareable configs) ---------------------
function applyParams() {
  const q = new URLSearchParams(location.search);
  // preset first, so explicit params can override it
  if (q.get('preset') && PRESETS[q.get('preset')]) {
    const p = PRESETS[q.get('preset')];
    Object.assign(state, { preset: q.get('preset'), L: p.L, D: p.D, H: p.H, top: p.top, legInset: p.legInset });
  }
  const num = (k) => (q.has(k) ? parseFloat(q.get(k)) : null);
  const L = num('L'), D = num('D'), H = num('H'), li = num('li');
  if (L) state.L = L;
  if (D) state.D = D;
  if (H) state.H = H;
  if (li) state.legInset = li;
  // validate enum params against config, so a bad share link can never
  // crash the app (falls back to the default instead)
  const pipe = q.get('pipe');
  if (pipe && PIPE[pipe]) state.pipe = pipe;
  const finish = q.get('finish');
  if (finish && FINISHES[finish]) state.finish = finish;
  const top = q.get('top');
  if (top && TOPS.some((t) => t.id === top)) state.top = top;
  if (q.get('cut') === '1') state.allowCut = true;
  const units = q.get('units');
  if (units === 'cm' || units === 'in') state.units = units;
  if (q.get('rotate') === '0') state.autoRotate = false;
  const acc = q.get('acc');
  if (acc !== null) {
    const set = new Set((acc || '').split(','));
    state.accessories.casters = set.has('casters');
    state.accessories.hangRail = set.has('hangrail');
    state.accessories.lowerShelf = set.has('shelf');
  }
}

// ---------- build dynamic controls -----------------------------
function buildPresets() {
  const box = $('presets');
  box.innerHTML = '';
  for (const [id, p] of Object.entries(PRESETS)) {
    const b = document.createElement('button');
    b.textContent = p.label;
    b.dataset.id = id;
    b.onclick = () => {
      state.preset = id;
      Object.assign(state, { L: p.L, D: p.D, H: p.H, top: p.top, legInset: p.legInset });
      syncControls();
      update(true);
    };
    box.appendChild(b);
  }
}

function buildTops() {
  const box = $('tops');
  box.innerHTML = '';
  for (const t of TOPS) {
    const b = document.createElement('button');
    b.dataset.v = t.id;
    const sw = t.type === 'wood' ? t.base : t.type === 'perf' ? '#8f979e' : '#aeb6bd';
    b.innerHTML = `<span class="sw" style="background:${sw}"></span>${t.label}`;
    b.onclick = () => { state.top = t.id; syncControls(); update(true); };
    box.appendChild(b);
  }
}

// ---------- sync UI <- state -----------------------------------
function cm2ui(cm) { return state.units === 'in' ? cm / INCH : cm; }
function ui2cm(v) { return state.units === 'in' ? v * INCH : v; }

function syncControls() {
  const sl = (id, v, dec = 1) => { const el = $(id); el.value = cm2ui(v).toFixed(dec); };
  sl('in-L', state.L, 0); sl('in-D', state.D); sl('in-H', state.H); sl('in-li', state.legInset);
  $('in-sy').value = state.shelfYFactor;
  for (const b of $('presets').children) b.classList.toggle('active', b.dataset.id === state.preset);
  for (const b of $('pipe-size').children) b.classList.toggle('active', b.dataset.v === state.pipe);
  for (const b of $('finish').children) b.classList.toggle('active', b.dataset.v === state.finish);
  for (const b of $('tops').children) b.classList.toggle('active', b.dataset.v === state.top);
  $('in-allowcut').checked = state.allowCut;
  $('acc-casters').checked = state.accessories.casters;
  $('acc-hangrail').checked = state.accessories.hangRail;
  $('acc-shelf').checked = state.accessories.lowerShelf;
  $('shelf-y-row').style.display = state.accessories.lowerShelf ? '' : 'none';
  $('in-rotate').checked = state.autoRotate;
  for (const b of $('units-toggle').children) b.classList.toggle('active', b.dataset.u === state.units);
  setAutoRotate(state.autoRotate);
}

function syncOutputs(solved) {
  const u = state.units;
  $('out-L').textContent = fmtLen(state.L, u);
  $('out-D').textContent = fmtLen(state.D, u);
  $('out-H').textContent = `${fmtLen(state.H, u)} → ${fmtLen(solved.H, u)}`;
  $('out-li').textContent = fmtLen(solved.legInsetR, u);
  $('out-sy').textContent = fmtLen(solved.shelf ? solved.shelf.y : state.H * state.shelfYFactor, u);
  $('dim-badge').innerHTML =
    `Top <b>${fmtLen(state.L, u)} × ${fmtLen(state.D, u)} × ${solved.t} cm</b> · H <b>${fmtLen(solved.H, u)}</b> · ${solved.P.label} pipe · ${solved.top.label}`;
}

// ---------- update pipeline ------------------------------------
let pending = false;
function update(reframe = false) {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const solved = solve(state);
    rebuildTable(state, solved);
    if (reframe) frame(solved);
    renderBOM(solved, state);
    syncOutputs(solved);
    window.__solved = solved;
  });
}

function frame(solved) { frameTable(solved); }

// ---------- events ---------------------------------------------
function bindSlider(id, key, transform = (v) => v) {
  $(id).addEventListener('input', (e) => {
    state[key] = transform(parseFloat(e.target.value));
    state.preset = 'custom';
    for (const b of $('presets').children) b.classList.toggle('active', false);
    update();
  });
}

function bindSeg(id, key) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state[key] = b.dataset.v;
    syncControls();
    update(true);
  });
}

function init() {
  applyParams();
  buildPresets();
  buildTops();
  initScene($('c'));

  bindSlider('in-L', 'L', (v) => ui2cm(v));
  bindSlider('in-D', 'D', (v) => ui2cm(v));
  bindSlider('in-H', 'H', (v) => ui2cm(v));
  bindSlider('in-li', 'legInset', (v) => ui2cm(v));

  $('in-sy').addEventListener('input', (e) => { state.shelfYFactor = parseFloat(e.target.value); update(); });

  bindSeg('pipe-size', 'pipe');
  bindSeg('finish', 'finish');

  $('in-allowcut').addEventListener('change', (e) => { state.allowCut = e.target.checked; update(); });
  $('acc-casters').addEventListener('change', (e) => { state.accessories.casters = e.target.checked; syncControls(); update(true); });
  $('acc-hangrail').addEventListener('change', (e) => { state.accessories.hangRail = e.target.checked; syncControls(); update(true); });
  $('acc-shelf').addEventListener('change', (e) => { state.accessories.lowerShelf = e.target.checked; syncControls(); update(true); });
  $('in-rotate').addEventListener('change', (e) => { state.autoRotate = e.target.checked; setAutoRotate(state.autoRotate); });

  $('units-toggle').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    // keep slider positions consistent when switching units
    const solved = solve(state);
    state.units = b.dataset.u;
    const set = (id, cm, dec) => { $(id).value = (state.units === 'in' ? cm / INCH : cm).toFixed(dec); };
    set('in-L', state.L, 0); set('in-D', state.D, 1); set('in-H', state.H, 1); set('in-li', solved.legInsetR, 1);
    $('in-L').min = state.units === 'in' ? 20 : 50; $('in-L').max = state.units === 'in' ? 100 : 250;
    $('in-D').min = state.units === 'in' ? 10 : 25; $('in-D').max = state.units === 'in' ? 40 : 100;
    $('in-H').min = state.units === 'in' ? 14 : 35; $('in-H').max = state.units === 'in' ? 45 : 110;
    $('in-li').min = state.units === 'in' ? 1 : 3; $('in-li').max = state.units === 'in' ? 10 : 25;
    syncControls();
    update();
  });

  $('btn-plan').onclick = () => {
    const solved = window.__solved || solve(state);
    openPlan(solved, state, captureISO());
  };
  $('btn-download').onclick = () => downloadBOM(window.__solved, state);
  $('btn-copy').onclick = async (e) => {
    const ok = await copyBOM(window.__solved, state);
    e.target.textContent = ok ? 'Copied ✓' : 'Copy failed';
    setTimeout(() => (e.target.textContent = 'Copy'), 1400);
  };

  // unit-dependent slider ranges for default cm
  $('in-L').min = 50; $('in-L').max = 250;
  syncControls();
  update(true);
}

init();
