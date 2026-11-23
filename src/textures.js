import * as THREE from 'three';

export function makeGridTexture(base, line, accent) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line;
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = i * 64;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(256, p); g.stroke();
  }
  g.lineWidth = 4;
  g.strokeRect(0, 0, 256, 256);
  if (accent) {
    g.fillStyle = accent;
    g.globalAlpha = 0.5;
    g.fillRect(124, 124, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrap(g, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function makeLabelTexture(title, line, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  roundRect(g, 4, 4, 504, 248, 28);
  g.fillStyle = 'rgba(14,16,22,0.92)';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = color;
  g.stroke();
  g.fillStyle = color;
  g.font = '700 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(title, 256, 84);
  g.fillStyle = '#e8e6e1';
  g.font = '500 32px system-ui, sans-serif';
  wrap(g, line, 450).slice(0, 3).forEach((l, i) => g.fillText(l, 256, 140 + i * 40));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function makePanelTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  roundRect(g, 6, 6, 1012, 500, 36);
  g.fillStyle = 'rgba(14,16,22,0.9)';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#f2c14e';
  g.stroke();
  g.fillStyle = '#f2c14e';
  g.font = '800 92px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('WEIRD PHYSICS', 512, 130);
  g.fillStyle = '#e8e6e1';
  g.font = '500 40px system-ui, sans-serif';
  [
    'Grab: grip button, or pinch with bare hands.',
    'Throw things. Physics here is a suggestion.',
    'Laws switch on after the first throw.',
    'B / Y or the red button sends everything home.',
    'Bored objects wander home on their own.',
  ].forEach((l, i) => g.fillText(l, 512, 215 + i * 58));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
