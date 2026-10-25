/* 디자인 "Family World"의 family-sprites.js (전역 이름 충돌을 막으려고 IIFE로만 감쌈) */
(function () {
const INK = '#2a211b';
const SPECS = {
  dad:     { skin:'#f0c4a2', hair:'curly', hc:'#8e8780', top:'#26304a', stripe:'#e6d8c2', sleeve:'long', pants:'#2d2d33', shoes:'#3a2a20', extra:'halfzip', mouth:'flat', brow:'#4a4540', headband:true },
  mom:     { skin:'#f8d5b8', hair:'bob', hc:'#1d1918', top:'#eee4cf', sleeve:'short', pants:'#c4b192', shoes:'#8a6a4f', extra:'polo', mouth:'smile', blush:true },
  sister:  { skin:'#fad8bd', hair:'topbun', hc:'#1b1716', top:'#e2ad22', stripe:'#fbf6ea', sleeve:'long', pants:'#3d4a66', shoes:'#f2efe8', mouth:'grin', blush:true },
  hyungbu: { skin:'#f2c8a6', hair:'messy', hc:'#1b1716', top:'#1f1f22', sleeve:'none', pants:'#44506e', shoes:'#2a2a2e', extra:'tank', mouth:'smile', watch:true },
  niece:   { kid:true, skin:'#fde0c8', hair:'buns', hc:'#1b1716', top:'#1f2a44', stripe:'#f7f3ea', sleeve:'long', pants:'#7d93b8', shoes:'#f0a6b4', mouth:'grin', blush:true },
  nephew:  { kid:true, skin:'#fbdac0', hair:'bowl', hc:'#161312', top:'#1c1c20', sleeve:'long', pants:'#33333a', shoes:'#f2efe8', extra:'cyan', mouth:'grin', blush:true, pose:'wave' },
  oppa:    { skin:'#f8d5b8', hair:'fringe', hc:'#1b1716', top:'#efe7d8', sleeve:'long', pants:'#e6d3bf', shoes:'#8a6a4f', extra:'heart', scarf:'#eb9ea0', mouth:'grin' },
  saeonni: { skin:'#fcdcc2', hair:'medium', hc:'#6b4632', top:'#efe7d8', sleeve:'long', pants:'#2e3340', shoes:'#2a2522', extra:'heart', mouth:'smile', blush:true },
  me:      { skin:'#fcdcc2', hair:'longbangs', hc:'#33241d', top:'#f0dc9c', sleeve:'long', pants:'#6e6259', shoes:'#2f2a27', extra:'hoodie', mouth:'grin', blush:true },
  husband: { skin:'#f9d6b9', hair:'fringe', hc:'#1b1716', top:'#9b9b9d', sleeve:'long', pants:'#6b6358', shoes:'#2f2a27', extra:'hoodie', strings:true, mouth:'flat' },
};
const mix = (hex, k, toward) => {
  const n = parseInt(hex.slice(1), 16), t = toward === 'w' ? 255 : 0;
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (t - v) * k));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
};
const dark = (h, k) => mix(h, k, 'b'), light = (h, k) => mix(h, k, 'w');

function sprite(s) {
  const G = new Map();
  const set = (x, y, c) => G.set(x + ',' + y, c);
  const del = (x, y) => G.delete(x + ',' + y);
  const R = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  const P = (xs, y, c) => xs.forEach(x => set(x, y, c));
  const kid = !!s.kid, hy = kid ? 7 : 4, by = hy + 10;
  const rows = kid ? 4 : 6, legs = kid ? 2 : 3, hc = s.hc, sk = s.skin;
  const band = y => (s.stripe && (y - by) % 2 === 1) ? s.stripe : s.top;

  for (let y = by; y < by + rows; y++) R(5, y, 12, y, band(y));
  const armEnd = by + rows - 2;
  const armC = (y, i) => (s.sleeve === 'none' || (s.sleeve === 'short' && i > 1)) ? sk : band(y);
  // arms swing out from the shoulder, leaving a gap at the waist
  const downArm = (side) => {
    for (let y = by; y <= armEnd; y++) {
      const i = y - by, off = i < 1 ? 0 : i < 3 ? 1 : 2, c = armC(y, i);
      const a = side < 0 ? 3 - off : 13 + off, b = a + 1;
      set(a, y, c); set(b, y, c);
      if (i > 0) set(side < 0 ? b : a, y, dark(c, 0.12));
    }
    const li = armEnd - by, lo = li < 1 ? 0 : li < 3 ? 1 : 2;
    const a = side < 0 ? 3 - lo : 13 + lo;
    set(a, armEnd + 1, sk); set(a + 1, armEnd + 1, sk);
    if (side < 0 && s.watch) { set(a, armEnd, '#c2c6cc'); set(a + 1, armEnd, '#c2c6cc'); }
  };
  const waveArm = () => {
    const cells = [[13, by], [14, by], [14, by - 1], [15, by - 1], [15, by - 2], [16, by - 2], [15, by - 3], [16, by - 3]];
    cells.forEach(([x, y], i) => set(x, y, armC(by, i)));
    set(16, by - 1, dark(armC(by, 3), 0.12));
    R(15, by - 5, 16, by - 4, sk); set(17, by - 5, sk);
  };
  const ly = by + rows;
  R(6, ly, 11, ly + legs - 1, s.pants);
  for (let y = ly + 1; y < ly + legs; y++) { del(8, y); del(9, y); }
  R(5, ly + legs, 7, ly + legs, s.shoes); R(10, ly + legs, 12, ly + legs, s.shoes);

  if (s.extra === 'hoodie') {
    R(5, by, 12, by, dark(s.top, 0.12));
    R(6, by + 3, 11, by + 4, dark(s.top, 0.07));
    if (s.strings) { R(7, by + 1, 7, by + 2, INK); R(10, by + 1, 10, by + 2, INK); }
  }
  if (s.extra === 'halfzip') { R(6, by, 11, by, dark(s.top, 0.3)); R(8, by, 8, by + 2, '#a4a5aa'); }
  if (s.extra === 'polo') { P([6, 7, 10, 11], by, '#fffbf2'); set(8, by + 2, '#8d806a'); set(8, by + 4, '#8d806a'); }
  if (s.extra === 'heart') { const r = '#d8333a'; set(9, by + 2, r); set(11, by + 2, r); R(9, by + 3, 11, by + 3, r); set(10, by + 4, r); }
  if (s.scarf) { R(5, by, 12, by, s.scarf); R(6, by + 1, 7, by + 4, s.scarf); set(7, by + 2, dark(s.scarf, 0.12)); set(7, by + 4, dark(s.scarf, 0.12)); }
  if (s.extra === 'print') R(7, by + 2, 10, by + 3, '#e8e4dc');
  if (s.extra === 'tank') {
    P([7, 8, 9, 10], by, sk); P([8, 9], by + 1, sk);
    [[7, by + 2], [8, by + 3], [9, by + 3], [10, by + 2], [11, by + 1]].forEach(([x, y]) => set(x, y, '#ffffff'));
  }
  if (s.extra === 'cyan') R(6, by + 2, 11, by + 2, '#4fd1d9');

  R(5, hy, 12, hy, sk); R(4, hy + 1, 13, hy + 9, sk);
  set(3, hy + 5, sk); set(3, hy + 6, sk); set(14, hy + 5, sk); set(14, hy + 6, sk);
  R(6, hy + 5, 6, hy + 6, INK); R(11, hy + 5, 11, hy + 6, INK);
  if (!kid) { R(5, hy + 4, 6, hy + 4, s.brow || hc); R(11, hy + 4, 12, hy + 4, s.brow || hc); }
  if (s.mouth === 'grin') { R(7, hy + 8, 10, hy + 8, '#a2463d'); }
  else if (s.mouth === 'smile') { R(8, hy + 8, 9, hy + 8, '#a2463d'); set(7, hy + 7, '#a2463d'); set(10, hy + 7, '#a2463d'); }
  else R(8, hy + 8, 9, hy + 8, dark(sk, 0.3));
  if (s.blush) { set(5, hy + 7, '#f2a297'); set(12, hy + 7, '#f2a297'); }
  if (s.glasses) {
    const g = s.glasses;
    [5, 10].forEach(x0 => {
      R(x0, hy + 4, x0 + 2, hy + 4, g); R(x0, hy + 7, x0 + 2, hy + 7, g);
      R(x0, hy + 5, x0, hy + 6, g); R(x0 + 2, hy + 5, x0 + 2, hy + 6, g);
    });
    P([8, 9], hy + 5, g); set(4, hy + 5, g); set(13, hy + 5, g);
    if (s.blush) { set(5, hy + 8, '#f2a297'); set(12, hy + 8, '#f2a297'); }
  }

  const top1 = () => { R(5, hy - 1, 12, hy - 1, hc); };
  switch (s.hair) {
    case 'curly': {
      const l = '#cfc8bc', d = '#57514b';
      R(4, hy - 1, 13, hy + 2, hc); P([5, 7, 8, 11, 12], hy - 2, hc);
      R(3, hy, 3, hy + 4, hc); R(14, hy, 14, hy + 4, hc); P([4, 5, 6, 12, 13], hy + 3, hc);
      [[5, hy - 2], [8, hy - 2], [6, hy], [10, hy - 1], [12, hy + 1], [4, hy + 1], [9, hy + 1], [3, hy + 2], [14, hy + 3], [11, hy], [7, hy - 1]].forEach(([x, y]) => set(x, y, l));
      [[7, hy + 1], [11, hy + 2], [5, hy + 3], [13, hy], [3, hy + 4], [9, hy - 1]].forEach(([x, y]) => set(x, y, d));
      break; }
    case 'bob':
      top1(); R(4, hy, 13, hy + 2, hc); R(2, hy + 1, 3, hy + 8, hc); R(14, hy + 1, 15, hy + 8, hc);
      R(4, hy + 3, 9, hy + 3, hc); R(4, hy + 4, 5, hy + 4, hc);
      break;
    case 'long': case 'longbangs':
      top1(); R(4, hy, 13, hy + 1, hc);
      if (s.hair === 'long') { P([4, 5, 6, 7, 10, 11, 12, 13], hy + 2, hc); P([4, 5, 12, 13], hy + 3, hc); }
      else { R(4, hy + 2, 13, hy + 2, hc); P([4, 5, 7, 10, 12, 13], hy + 3, hc); }
      R(4, hy + 4, 4, hy + 6, hc); R(13, hy + 4, 13, hy + 6, hc);
      R(2, hy + 1, 3, hy + 14, hc); R(14, hy + 1, 15, hy + 14, hc);
      break;
    case 'topbun':
      top1(); R(4, hy, 13, hy + 1, hc); P([4, 5, 6, 7, 10, 11, 12, 13], hy + 2, hc); P([4, 13], hy + 3, hc);
      R(3, hy + 1, 3, hy + 5, hc); R(14, hy + 1, 14, hy + 5, hc);
      R(7, hy - 2, 10, hy - 2, hc); R(6, hy - 5, 11, hy - 3, hc); R(7, hy - 6, 10, hy - 6, hc);
      set(7, hy - 5, light(hc, 0.12)); set(8, hy - 5, light(hc, 0.12));
      break;
    case 'medium':
      top1(); R(4, hy, 13, hy + 1, hc); R(4, hy + 2, 10, hy + 2, hc); P([4, 5, 6], hy + 3, hc); P([4, 13], hy + 3, hc);
      R(3, hy + 1, 3, hy + 12, hc); R(14, hy + 1, 14, hy + 12, hc); R(2, hy + 3, 2, hy + 12, hc); R(15, hy + 3, 15, hy + 12, hc);
      set(6, hy, light(hc, 0.15)); set(7, hy, light(hc, 0.15));
      break;
    case 'pony':
      top1(); R(4, hy, 13, hy + 1, hc); R(4, hy + 2, 10, hy + 2, hc); P([4, 5, 6], hy + 3, hc);
      R(3, hy + 1, 3, hy + 6, hc); R(14, hy + 1, 14, hy + 6, hc);
      R(15, hy + 4, 16, hy + 11, hc); set(15, hy + 3, '#c4704f'); set(16, hy + 3, '#c4704f');
      break;
    case 'buns':
      top1(); R(4, hy, 13, hy + 1, hc); P([4, 5, 6, 7, 10, 11, 12, 13], hy + 2, hc); P([4, 13], hy + 3, hc);
      R(3, hy + 1, 3, hy + 11, hc); R(14, hy + 1, 14, hy + 11, hc); R(2, hy + 4, 2, hy + 10, hc); R(15, hy + 4, 15, hy + 10, hc);
      R(4, hy - 4, 6, hy - 3, hc); R(11, hy - 4, 13, hy - 3, hc);
      R(4, hy - 2, 6, hy - 2, '#ee8aa0'); R(11, hy - 2, 13, hy - 2, '#ee8aa0');
      break;
    case 'messy':
      R(4, hy, 13, hy + 2, hc); P([5, 6, 8, 9, 10, 12], hy - 1, hc); P([6, 9], hy - 2, hc);
      R(3, hy + 1, 3, hy + 4, hc); R(14, hy + 1, 14, hy + 4, hc); P([4, 5, 6, 10, 11, 12, 13], hy + 3, hc);
      break;
    case 'bowl':
      top1(); R(4, hy, 13, hy + 4, hc); R(3, hy + 1, 3, hy + 5, hc); R(14, hy + 1, 14, hy + 5, hc);
      break;
    case 'fringe':
      top1(); R(4, hy, 13, hy + 3, hc); R(3, hy + 1, 3, hy + 4, hc); R(14, hy + 1, 14, hy + 4, hc);
      P([4, 5, 7, 8, 10, 12, 13], hy + 4, hc);
      break;
    default:
      top1(); R(4, hy, 13, hy + 2, hc); R(3, hy + 1, 3, hy + 4, hc); R(14, hy + 1, 14, hy + 4, hc);
      P([4, 5, 6, 7, 8, 12, 13], hy + 3, hc);
  }
  if (s.hair !== 'curly') { set(6, hy, light(hc, 0.1)); set(7, hy, light(hc, 0.1)); }
  if (s.headband) {
    const band = '#f06a8a', gold = '#f5c534', shine = '#fff3c2', t = hy - 9;
    R(4, hy - 2, 13, hy - 2, band); R(3, hy - 1, 3, hy + 1, band); R(14, hy - 1, 14, hy + 1, band);
    R(5, hy - 4, 5, hy - 3, band); R(11, hy - 4, 11, hy - 3, band);
    R(2, t, 6, t, gold); R(5, t + 1, 6, t + 1, gold); R(4, t + 2, 5, t + 2, gold); R(3, t + 3, 4, t + 4, gold);
    R(10, t, 14, t, gold); R(10, t + 4, 14, t + 4, gold); R(10, t + 1, 11, t + 3, gold); R(13, t + 1, 14, t + 3, gold);
    set(2, t, shine); set(10, t + 1, shine); set(10, t, shine);
    R(5, t + 5, 5, hy - 3, band); R(11, t + 5, 11, hy - 3, band);
  }
  downArm(-1);
  if (s.pose === 'wave') waveArm(); else downArm(1);
  return G;
}

const X0 = -3, X1 = 20, Y0 = -8, Y1 = 26;
function paint(canvas, s, scale, sticker) {
  const G = sprite(s);
  const has = (x, y) => G.has(x + ',' + y);
  const out = new Map(G);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    if (has(x, y)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (has(x + dx, y + dy)) out.set(x + ',' + y, INK);
  }
  const final = new Map(out);
  if (sticker) for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const k = x + ',' + y; if (out.has(k)) continue;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
      if (out.has((x + dx) + ',' + (y + dy))) { near = true; break; }
    }
    if (near) final.set(k, '#ffffff');
  }
  const w = X1 - X0 + 1, h = Y1 - Y0 + 1;
  canvas.width = w * scale; canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  final.forEach((c, k) => {
    const [x, y] = k.split(',').map(Number);
    ctx.fillStyle = c; ctx.fillRect((x - X0) * scale, (y - Y0) * scale, scale, scale);
  });
}


function walkGrid(s, step) {
  const G = sprite(s);
  if (step % 2 === 0) return G;
  const kid = !!s.kid, hy = kid ? 7 : 4, by = hy + 10, rows = kid ? 4 : 6, legs = kid ? 2 : 3, fy = by + rows + legs;
  const xs = step === 1 ? [5, 6, 7] : [10, 11, 12];
  xs.forEach(x => { const c = G.get(x + ',' + fy); G.delete(x + ',' + fy); if (c) G.set(x + ',' + (fy - 1), c); });
  return G;
}
function paintGrid(canvas, G, scale) {
  const has = (x, y) => G.has(x + ',' + y);
  const out = new Map(G);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    if (has(x, y)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (has(x + dx, y + dy)) out.set(x + ',' + y, INK);
  }
  canvas.width = (X1 - X0 + 1) * scale; canvas.height = (Y1 - Y0 + 1) * scale;
  const ctx = canvas.getContext('2d');
  out.forEach((c, k) => { const [x, y] = k.split(',').map(Number); ctx.fillStyle = c; ctx.fillRect((x - X0) * scale, (y - Y0) * scale, scale, scale); });
  return canvas;
}
window.FamilySprites = { SPECS, sprite, walkGrid, paintGrid, INK, W: X1 - X0 + 1, H: Y1 - Y0 + 1 };
})();
