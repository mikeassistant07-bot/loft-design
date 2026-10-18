// ============================================================
// Bill of materials rendering + export
// ============================================================
import { fmtLen } from './config.js';

export function renderBOM(solved, state) {
  const u = state.units;
  const dims = document.getElementById('dims-summary');
  dims.innerHTML = `
    <div class="dim"><span>Top (L×D)</span><b>${fmtLen(state.L, u)} × ${fmtLen(state.D, u)}</b></div>
    <div class="dim"><span>Height (realized)</span><b>${fmtLen(solved.H, u)}</b></div>
    <div class="dim"><span>Leg gauge (c/c)</span><b>${fmtLen(solved.gauge, u)}</b></div>
    <div class="dim"><span>Frame span (c/c)</span><b>${fmtLen(solved.frameSpan, u)}</b></div>
    <div class="dim"><span>End overhang</span><b>${fmtLen(solved.endInset, u)}</b></div>
    <div class="dim"><span>Total pipe/nipple</span><b>${fmtLen(solved.pipeTotal, u)}</b></div>`;

  const warn = document.getElementById('bom-warnings');
  warn.innerHTML = solved.warn.map((w) => `<div class="warn">⚠ ${w}</div>`).join('');

  const list = document.getElementById('bom-list');
  list.innerHTML = solved.parts
    .map(
      (p) => `
      <div class="bom-row">
        <span class="qty">×${p.qty}</span>
        <span class="lbl">${p.label}${p.note ? `<i>${p.note}</i>` : ''}</span>
      </div>`
    )
    .join('');
}

export function bomText(solved, state) {
  const u = state.units;
  const lines = [];
  lines.push('INDUSTRIAL PIPE TABLE — PARTS LIST');
  lines.push(`Design: loft-design configurator (based on temptingthyme.com DIY build)`);
  lines.push(`Top: ${fmtLen(state.L, u)} x ${fmtLen(state.D, u)} x ${solved.t} cm — ${solved.top.label}`);
  lines.push(`Height: ${fmtLen(solved.H, u)} (realized) | Pipe size: ${solved.P.label}`);
  lines.push(`Leg gauge ${fmtLen(solved.gauge, u)} c/c | Frame span ${fmtLen(solved.frameSpan, u)} c/c`);
  lines.push('');
  for (const p of solved.parts) lines.push(`  ${String(p.qty).padStart(3)} ×  ${p.label}${p.note ? '   — ' + p.note : ''}`);
  lines.push('');
  lines.push(`Total pipe + nipple length: ${fmtLen(solved.pipeTotal, u)}`);
  lines.push('');
  lines.push('Tips: wash fittings (dish soap + TSP) before assembly;');
  lines.push('threads never fully tighten — use that to level the top;');
  lines.push('swap caps for floor flanges if the table wobbles.');
  return lines.join('\n');
}

export function downloadBOM(solved, state) {
  const blob = new Blob([bomText(solved, state)], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pipe-table-parts-list.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function copyBOM(solved, state) {
  try {
    await navigator.clipboard.writeText(bomText(solved, state));
    return true;
  } catch {
    return false;
  }
}
