// Canvas-drawn panels: the shop tablet / scoreboard and the banner. Redrawn only when something changes.
import * as THREE from 'three';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const INK = '#f1efe9';
const DIM = 'rgba(241,239,233,0.55)';

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function wrap(g, text, maxW) {
  const out = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}
function backdrop(g, w, h, color) {
  g.clearRect(0, 0, w, h);
  rr(g, 5, 5, w - 10, h - 10, 34);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(18,22,34,0.94)');
  gr.addColorStop(1, 'rgba(8,10,16,0.94)');
  g.fillStyle = gr; g.fill();
  g.lineWidth = 5; g.strokeStyle = color; g.stroke();
}

export class Panel {
  constructor(w, h, mw, mh) {
    this.c = document.createElement('canvas');
    this.c.width = w; this.c.height = h;
    this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), this.mat);
    this.mesh.renderOrder = 18;
    this.sig = '';
  }
  // draw(g, w, h) runs only when sig differs from last time
  paint(sig, draw) {
    if (sig === this.sig) return;
    this.sig = sig;
    draw(this.g, this.c.width, this.c.height);
    this.tex.needsUpdate = true;
  }
}

export function drawBanner(g, w, h, { title, lines = [], footer = '', color = '#f2c14e' }) {
  backdrop(g, w, h, color);
  g.textAlign = 'center';
  g.fillStyle = color;
  g.font = `800 84px ${FONT}`;
  g.fillText(title, w / 2, 118, w - 80);
  g.fillStyle = INK;
  g.font = `500 40px ${FONT}`;
  let y = 196;
  for (const l of lines) for (const s of wrap(g, l, w - 110)) { g.fillText(s, w / 2, y); y += 52; }
  if (footer) {
    g.fillStyle = color;
    g.font = `700 38px ${FONT}`;
    g.fillText(footer, w / 2, h - 44, w - 80);
  }
}

function header(g, w, st) {
  const p = st.players[st.cur];
  g.textAlign = 'left';
  g.fillStyle = p.color;
  g.font = `800 50px ${FONT}`;
  g.fillText(`${p.name} · ${st.phase}`, 36, 70);
  g.textAlign = 'right';
  g.fillStyle = DIM;
  g.font = `600 30px ${FONT}`;
  g.fillText(st.roundText, w - 36, 64);
}

// 7 x 3 grid of price tags, the selected one explained underneath
export function drawShop(g, w, h, st) {
  const p = st.players[st.cur];
  backdrop(g, w, h, p.color);
  header(g, w, st);
  g.textAlign = 'right';
  g.fillStyle = '#8dff9a';
  g.font = `800 56px ${FONT}`;
  g.fillText('$' + p.cash, w - 36, 124);
  g.textAlign = 'left';
  g.fillStyle = DIM;
  g.font = `500 26px ${FONT}`;
  g.fillText(`${st.count}/${st.max} gadgets on the course`, 36, 116);

  const cols = 7, cw = (w - 56) / cols, ch = 124, x0 = 28, y0 = 146;
  st.cells.forEach((c, i) => {
    const x = x0 + (i % cols) * cw, y = y0 + Math.floor(i / cols) * ch;
    const sel = i === st.sel, can = c.done || c.cost <= p.cash;
    rr(g, x + 4, y + 4, cw - 8, ch - 8, 16);
    g.fillStyle = sel ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)';
    g.fill();
    if (sel) { g.lineWidth = 4; g.strokeStyle = c.color; g.stroke(); }
    g.globalAlpha = can ? 1 : 0.32;
    g.textAlign = 'center';
    if (c.done) {
      g.fillStyle = '#8dff9a';
      g.font = `800 34px ${FONT}`;
      g.fillText('DONE', x + cw / 2, y + 62);
      g.font = `600 20px ${FONT}`;
      g.fillText('end turn', x + cw / 2, y + 92);
    } else {
      rr(g, x + cw / 2 - 44, y + 16, 88, 46, 23);
      g.fillStyle = c.color; g.fill();
      g.fillStyle = '#0b0d12';
      g.font = `800 30px ${FONT}`;
      g.fillText('$' + c.cost, x + cw / 2, y + 50);
      g.fillStyle = INK;
      g.font = `700 19px ${FONT}`;
      g.fillText(c.name, x + cw / 2, y + 94, cw - 14);
    }
    g.globalAlpha = 1;
  });

  const c = st.cells[st.sel];
  const dy = y0 + 3 * ch + 22;
  g.textAlign = 'left';
  g.fillStyle = c.color;
  g.font = `800 46px ${FONT}`;
  g.fillText(c.done ? 'DONE' : `${c.name}  $${c.cost}`, 36, dy + 34);
  g.fillStyle = INK;
  g.font = `500 30px ${FONT}`;
  wrap(g, st.note || c.blurb, w - 72).slice(0, 2).forEach((l, i) => g.fillText(l, 36, dy + 80 + i * 38));
  g.fillStyle = DIM;
  g.font = `500 24px ${FONT}`;
  g.fillText(st.hint, 36, h - 30, w - 72);
}

export function drawScore(g, w, h, st) {
  const p = st.players[st.cur];
  backdrop(g, w, h, p.color);
  header(g, w, st);
  // shots left
  for (let i = 0; i < st.shotsMax; i++) {
    g.beginPath();
    g.arc(60 + i * 62, 132, 22, 0, Math.PI * 2);
    if (i < st.shotsLeft) { g.fillStyle = p.color; g.fill(); } else { g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.3)'; g.stroke(); }
  }
  g.textAlign = 'left';
  g.fillStyle = DIM;
  g.font = `500 28px ${FONT}`;
  g.fillText(st.shotsText, 60 + st.shotsMax * 62, 142);

  st.players.forEach((q, i) => {
    const x = 36 + i * (w - 72) / 2, bw = (w - 72) / 2 - 16;
    rr(g, x, 190, bw, 230, 22);
    g.fillStyle = i === st.cur ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
    g.fill();
    if (i === st.cur) { g.lineWidth = 4; g.strokeStyle = q.color; g.stroke(); }
    g.textAlign = 'center';
    g.fillStyle = q.color;
    g.font = `700 34px ${FONT}`;
    g.fillText(q.name, x + bw / 2, 240);
    g.fillStyle = INK;
    g.font = `800 110px ${FONT}`;
    g.fillText(String(q.score), x + bw / 2, 352);
    g.fillStyle = '#8dff9a';
    g.font = `600 30px ${FONT}`;
    g.fillText('$' + q.cash + ' banked', x + bw / 2, 400);
  });
  g.textAlign = 'center';
  g.fillStyle = INK;
  g.font = `600 34px ${FONT}`;
  wrap(g, st.note, w - 80).slice(0, 2).forEach((l, i) => g.fillText(l, w / 2, 478 + i * 42));
  g.fillStyle = DIM;
  g.font = `500 24px ${FONT}`;
  g.fillText(st.hint, w / 2, h - 30, w - 72);
}

export function bullseyeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const cols = ['#ffffff', '#ff3b5c', '#ffffff', '#ff3b5c', '#ffd24a'];
  cols.forEach((col, i) => { g.beginPath(); g.arc(128, 128, 126 - i * 25, 0, Math.PI * 2); g.fillStyle = col; g.fill(); });
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(128, 128, 126 - i * 25, 0, Math.PI * 2); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function teeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0.05)');
  gr.addColorStop(0.78, 'rgba(255,255,255,0.22)');
  gr.addColorStop(0.86, 'rgba(255,255,255,1)');
  gr.addColorStop(0.93, 'rgba(255,255,255,0.3)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 5;
  for (let i = 0; i < 12; i++) { // tick marks
    const a = i * Math.PI / 6;
    g.beginPath(); g.moveTo(128 + Math.cos(a) * 84, 128 + Math.sin(a) * 84); g.lineTo(128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98); g.stroke();
  }
  return new THREE.CanvasTexture(c);
}
