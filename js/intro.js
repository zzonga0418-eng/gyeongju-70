/*
 * 입장 화면 오버레이 (Family World: 가족이 행성 위를 걷는 장면)
 * - 사이트(index.html)가 이미 떠 있는 위에 얹는 전체 화면 오버레이. 여기서 무슨 일이 생겨도 아래 사이트는 그대로.
 * - Three.js(CDN, 버전 고정)로 코드 도형만 그림. WebGL 불가·로드 실패·너무 느림 → 2D 대체 버전.
 * - 입장은 항상 [입장하기]/[건너뛰기]로만(자동 입장 없음). [건너뛰기]는 항상 표시.
 */
(function () {
  'use strict';

  var SEEN_KEY = 'trip_intro_v1';
  var THREE_URL = 'https://unpkg.com/three@0.184.0/build/three.module.js';
  var LOAD_TIMEOUT_MS = 7000;

  var overlay, ui = {}, timers = [], raf = 0, finished = false, soundOn = false;
  var seen = false, eve = false, mode = null; // mode: '3d' | '2d'
  var api = null; // { enter(), dispose() }

  // ── 데이터 ──────────────────────────────────────────────
  var PEOPLE = [ // 디자인 "Family World"의 명단 (스프라이트 id는 family-sprites.js의 SPECS)
    { id: 'dad', name: '정주', role: '아빠 · 57년생', tags: ['은빛 곱슬머리', '70 파티 머리띠'] },
    { id: 'mom', name: '영옥', role: '엄마 · 62년생', tags: ['단정한 단발', '크림 니트 카라'] },
    { id: 'sister', name: '서연', role: '언니 · 87년생', tags: ['똥머리', '옐로 스트라이프'] },
    { id: 'hyungbu', name: '인호', role: '형부 · 83년생', tags: ['뻗친 머리', '나이키 나시'] },
    { id: 'niece', name: '지유', role: '조카 · 8살', tags: ['양갈래 묶음', '네이비 줄무늬'] },
    { id: 'nephew', name: '승유', role: '조카 · 7살', tags: ['바가지 머리', '블랙 맨투맨'] },
    { id: 'oppa', name: '성훈', role: '오빠 · 90년생', tags: ['핑크 머플러', '하트 커플티'] },
    { id: 'saeonni', name: '아름', role: '새언니 · 92년생', tags: ['브라운 단발', '하트 커플티'] },
    { id: 'me', name: '아연', role: '나 · 94년생', tags: ['앞머리 긴 머리', '버터 옐로 후디'] },
    { id: 'husband', name: '정현', role: '남편 · 91년생', tags: ['덮은 앞머리', '그레이 후디'] }
  ];

  // ── 작은 도우미 ─────────────────────────────────────────
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function later(fn, ms) { var t = setTimeout(function () { if (!finished) fn(); }, ms); timers.push(t); return t; }
  function readSeen() { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; } }
  function writeSeen() { try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* 기록 실패해도 정상 동작 */ } }
  // ── 소리 (기본 꺼짐) ────────────────────────────────────
  var audio = null, musicTimer = 0;
  function setSound(on) {
    soundOn = on;
    ui.sound.classList.toggle('is-on', on);
    ui.sound.textContent = on ? '🔊' : '🔇';
    ui.sound.setAttribute('aria-pressed', on ? 'true' : 'false');
    clearInterval(musicTimer);
    if (!on) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio = audio || new AC();
      if (audio.resume) audio.resume();
      var scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5], i = 0;
      musicTimer = setInterval(function () {
        try {
          var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
          o.type = 'triangle';
          o.frequency.value = scale[(Math.random() * scale.length) | 0] / (i++ % 4 === 0 ? 2 : 1);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
          o.connect(g); g.connect(audio.destination);
          o.start(t); o.stop(t + 0.55);
        } catch (e) { /* 소리 실패는 무시 */ }
      }, 420);
    } catch (e) { /* 소리 실패는 무시 */ }
  }

  // ── 종료 ────────────────────────────────────────────────
  function finish() {
    if (finished) return;
    finished = true;
    writeSeen();
    clearInterval(musicTimer);
    timers.forEach(clearTimeout);
    if (overlay) overlay.classList.add('is-out');
    document.removeEventListener('keydown', onKey);
    setTimeout(function () {
      cancelAnimationFrame(raf);
      try { if (api && api.dispose) api.dispose(); } catch (e) { /* 정리 실패 무시 */ }
      try { if (audio && audio.close) audio.close(); } catch (e) { /* 무시 */ }
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
    }, 700);
  }
  function onKey(e) { if (e.key === 'Escape') finish(); }

  // ── 공용 UI ─────────────────────────────────────────────
  function buildUI() {
    overlay = el('div', 'intro' + (eve ? ' is-eve' : ''));
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '입장 화면');
    var top = el('div', 'intro-top');
    top.appendChild(el('span', 'intro-tag', '2026.11.20–22'));
    var btns = el('div', 'intro-btns');
    ui.sound = el('button', 'intro-btn', '🔇');
    ui.sound.type = 'button';
    ui.sound.setAttribute('aria-label', '소리 켜기/끄기');
    ui.sound.addEventListener('click', function () { setSound(!soundOn); });
    ui.skip = el('button', 'intro-btn', '건너뛰기');
    ui.skip.type = 'button';
    ui.skip.addEventListener('click', finish);
    btns.appendChild(ui.sound); btns.appendChild(ui.skip);
    top.appendChild(btns);

    ui.hero = el('div', 'intro-hero', '<h1>Family World</h1><div class="intro-pill">아빠 칠순 가족여행 · 11.20~22</div>');
    ui.stage = el('div'); ui.stage.style.cssText = 'position:absolute;inset:0';
    ui.cover = el('div', 'intro-cover');
    ui.labels = el('div');

    var bottom = el('div', 'intro-bottom');
    ui.card = el('div', 'intro-card');
    ui.title = el('p', 'intro-title');
    ui.sub = el('p', 'intro-sub');
    ui.card.appendChild(ui.title); ui.card.appendChild(ui.sub);
    ui.go = el('button', 'intro-go', '입장하기 →');
    ui.go.type = 'button';
    ui.go.hidden = true;
    bottom.appendChild(ui.card); bottom.appendChild(ui.go);

    overlay.appendChild(ui.stage); overlay.appendChild(ui.hero); overlay.appendChild(ui.labels); overlay.appendChild(ui.cover);
    overlay.appendChild(top); overlay.appendChild(bottom);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey);
  }
  function caption(title, sub) {
    ui.card.classList.add('is-swap');
    later(function () {
      ui.title.textContent = title;
      ui.sub.textContent = sub || '';
      ui.sub.style.display = sub ? '' : 'none';
      ui.card.classList.remove('is-swap');
    }, 180);
  }
  function captionNow(title, sub) {
    ui.title.textContent = title;
    ui.sub.textContent = sub || '';
    ui.sub.style.display = sub ? '' : 'none';
  }
  function earthCaption() {
    captionNow('Family World', '불러오는 중…');
  }
  function enterCaption() { // 지구 장면이 뜬 뒤: 첫 방문·재방문 모두 [입장하기]를 눌러야 넘어감 (자동 입장 없음)
    var greet = eve ? '좋은 저녁이에요 🌙' : '좋은 아침이에요 ☀️';
    ui.go.hidden = false;
    captionNow(seen ? '다시 오셨네요! ' + greet.slice(-2) : greet, '캐릭터를 눌러보세요 · 준비되면 입장!');
  }

  // ── 3D ──
  // Three.js 0.184(ES module)를 동적 import. 지구 장면은 디자인 "Family World"(family-sprites.js)를 그대로 옮김.
  function loadScript(src, cb) {
    var s = document.createElement('script');
    s.src = src; s.onload = function () { cb(true); }; s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }
  function loadThree(cb) {
    var done = false;
    function end(ok) { if (done) return; done = true; cb(ok); }
    loadScript('js/family-sprites.js', function (ok) {
      if (!ok || !window.FamilySprites) return end(false);
      import(THREE_URL).then(function (m) { window.THREE = m; end(true); }).catch(function () { end(false); });
    });
    later(function () { end(false); }, LOAD_TIMEOUT_MS);
  }

  function build3D() {
    var T = window.THREE, FS = window.FamilySprites, INK = FS.INK, D = Math.PI / 180;
    var canvas = el('canvas', 'intro-gl');
    ui.stage.appendChild(canvas);
    var renderer = new T.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(32, 1, 0.1, 100);
    var T2 = 2 * Math.tan(16 * D);
    scene.add(new T.HemisphereLight(eve ? 0xFFE6DA : 0xFFFFFF, eve ? 0x9C86B8 : 0x8FBCD8, 1.5));
    var key = new T.DirectionalLight(eve ? 0xFFD2B0 : 0xFFF2DE, 2.1);
    key.position.set(5, 8, 6);
    scene.add(key);

    var matCache = {}, geoms = {};
    function mat(c, extra) {
      var k = c + (extra ? JSON.stringify(extra) : '');
      return matCache[k] || (matCache[k] = new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, flatShading: true }, extra || {})));
    }
    function mesh(geo, c, x, y, z) { var m = new T.Mesh(geo, mat(c)); m.position.set(x || 0, y || 0, z || 0); return m; }
    function box(w, h, d, c, x, y, z) { return mesh(new T.BoxGeometry(w, h, d), c, x, y, z); }
    function cyl(rt, rb, h, seg, c, x, y, z) { return mesh(new T.CylinderGeometry(rt, rb, h, seg), c, x, y, z); }
    function G(key2, make) { return geoms[key2] || (geoms[key2] = make()); }
    function sprTex(grid) {
      var c = FS.paintGrid(document.createElement('canvas'), grid, 6);
      var t = new T.CanvasTexture(c);
      t.magFilter = T.NearestFilter; t.minFilter = T.LinearFilter; t.generateMipmaps = false; t.colorSpace = T.SRGBColorSpace;
      return t;
    }

    var stage = 'earth', target = new T.Vector3(), camDir = new T.Vector3(), camDist = 20;
    var w = 1, h = 1;

    // ── 지구 장면 (Family World) ──
    var R = 2, UP = new T.Vector3(0, 1, 0);
    var earthAll = new T.Group(); scene.add(earthAll);
    var tilt = new T.Group(); earthAll.add(tilt);
    var planet = new T.Group(); tilt.add(planet);
    function dirOf(lat, lon) { return new T.Vector3(Math.sin(lat), Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon)); }
    function place(obj, latDeg, lonDeg, spin, lift) {
      var n = dirOf(latDeg * D, lonDeg * D);
      obj.position.copy(n).multiplyScalar(R + (lift == null ? -0.01 : lift));
      obj.quaternion.setFromUnitVectors(UP, n);
      obj.rotateY(spin || 0);
      planet.add(obj);
      return obj;
    }
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

    var groundMesh;
    (function ground() {
      var geo = new T.IcosahedronGeometry(R, 5);
      var pos = geo.attributes.position, cols = [], v = new T.Vector3(), t = new T.Vector3();
      var greens = ['#80c75b', '#74bc52', '#8cd165', '#6cb04d'].map(function (c) { return new T.Color(c); });
      var water = new T.Color('#5cbce9');
      for (var i = 0; i < pos.count; i += 3) {
        v.set(0, 0, 0);
        for (var k = 0; k < 3; k++) v.add(t.fromBufferAttribute(pos, i + k));
        v.normalize();
        var lat = Math.asin(v.x);
        var n = Math.sin(v.x * 3.1 + 1.3) * Math.sin(v.z * 2.7 + 0.4) + Math.sin(v.y * 4.3 + v.x * 2) * 0.6;
        var c = (n > 0.65 && Math.abs(lat) > 0.5 && Math.abs(lat) < 1.1) ? water : greens[Math.floor(rnd() * 4)];
        for (var q = 0; q < 3; q++) cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
      groundMesh = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
      planet.add(groundMesh);
      var roadGeo = new T.SphereGeometry(R + 0.012, 96, 12, 0, Math.PI * 2, Math.PI / 2 - 0.36, 0.72); roadGeo.rotateZ(Math.PI / 2);
      planet.add(new T.Mesh(roadGeo, new T.MeshStandardMaterial({ color: '#efd8a0', roughness: 1 })));
      for (var d = 0; d < 40; d++) [-19, 19].forEach(function (la) { place(box(0.03, 0.006, 0.13, '#fffaf0'), la, d * 9, 0, 0.012); });
    })();

    (function house() { // 우리 집
      var g = new T.Group();
      g.add(box(0.5, 0.34, 0.4, '#f6ecd8', 0, 0.17, 0));
      var roof = mesh(new T.ConeGeometry(0.42, 0.3, 4), '#e0604f', 0, 0.49, 0); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.85; g.add(roof);
      g.add(box(0.1, 0.17, 0.02, '#8a5a3c', 0, 0.085, 0.205));
      g.add(box(0.1, 0.09, 0.02, '#9fd6f2', -0.16, 0.2, 0.205), box(0.1, 0.09, 0.02, '#9fd6f2', 0.16, 0.2, 0.205));
      g.add(box(0.06, 0.16, 0.06, '#b9483c', 0.13, 0.52, -0.06));
      g.add(box(0.5, 0.012, 0.18, '#d9c8a6', 0, 0.006, 0.3));
      g.scale.setScalar(1.15);
      place(g, -46, 200, Math.PI / 2);
    })();

    (function dabotap() { // 다보탑
      var g = new T.Group(), s1 = '#d8cdb5', s2 = '#c2b499', s3 = '#a99b81';
      g.add(box(0.56, 0.06, 0.56, s2, 0, 0.03, 0));
      [[0, 0.32], [0, -0.32], [0.32, 0], [-0.32, 0]].forEach(function (p) { g.add(box(p[0] ? 0.08 : 0.14, 0.04, p[0] ? 0.14 : 0.08, s2, p[0], 0.02, p[1])); });
      g.add(box(0.13, 0.2, 0.13, s1, 0, 0.16, 0));
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (p) { g.add(box(0.045, 0.2, 0.045, s1, p[0] * 0.17, 0.16, p[1] * 0.17)); });
      g.add(box(0.46, 0.04, 0.46, s2, 0, 0.28, 0));
      g.add(cyl(0.17, 0.17, 0.06, 8, s1, 0, 0.33, 0));
      g.add(cyl(0.11, 0.11, 0.12, 8, s1, 0, 0.42, 0));
      g.add(cyl(0.15, 0.1, 0.04, 8, s2, 0, 0.5, 0));
      for (var i = 0; i < 8; i++) { var a = i / 8 * Math.PI * 2; g.add(cyl(0.012, 0.012, 0.08, 6, s1, Math.cos(a) * 0.11, 0.56, Math.sin(a) * 0.11)); }
      g.add(cyl(0.05, 0.05, 0.08, 8, s1, 0, 0.56, 0));
      g.add(cyl(0.2, 0.2, 0.03, 8, s3, 0, 0.615, 0));
      g.add(cyl(0.12, 0.2, 0.035, 8, s3, 0, 0.647, 0));
      g.add(cyl(0.022, 0.03, 0.22, 8, s3, 0, 0.77, 0));
      g.add(cyl(0.05, 0.05, 0.015, 8, s3, 0, 0.72, 0), cyl(0.04, 0.04, 0.015, 8, s3, 0, 0.79, 0));
      g.add(mesh(new T.IcosahedronGeometry(0.035, 1), s3, 0, 0.9, 0));
      g.scale.setScalar(1.3);
      place(g, -48, 330, 0.4);
    })();

    function digitTexture(rows) {
      var s = 8, dw = rows[0].length + 4, dh = rows.length + 4;
      var c = document.createElement('canvas'); c.width = dw * s; c.height = dh * s;
      var ctx = c.getContext('2d');
      var on = function (x, y) { return rows[y] && rows[y][x] === '#'; };
      for (var y = -2; y < rows.length + 2; y++) for (var x = -2; x < rows[0].length + 2; x++) {
        var col = null;
        if (on(x, y)) col = (on(x - 1, y - 1) || !on(x, y - 1)) && !on(x - 1, y) ? '#fff3c2' : on(x + 1, y) ? '#f5c534' : '#e0a51c';
        else for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (on(x + dx, y + dy)) col = INK;
        if (col) { ctx.fillStyle = col; ctx.fillRect((x + 2) * s, (y + 2) * s, s, s); }
      }
      var t = new T.CanvasTexture(c); t.magFilter = T.NearestFilter; t.minFilter = T.LinearFilter; t.generateMipmaps = false; t.colorSpace = T.SRGBColorSpace;
      return { t: t, aspect: dw / dh };
    }
    var balloons = [], cake;
    (function cakeAndBalloons() { // 케이크 + 70
      var g = new T.Group(); cake = g;
      g.add(cyl(0.3, 0.3, 0.02, 24, '#ffffff', 0, 0.01, 0));
      g.add(cyl(0.24, 0.24, 0.14, 24, '#f7b9c6', 0, 0.09, 0));
      g.add(cyl(0.25, 0.25, 0.025, 24, '#fff6ec', 0, 0.16, 0));
      g.add(cyl(0.16, 0.16, 0.11, 24, '#fff6ec', 0, 0.225, 0));
      for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2; g.add(mesh(new T.IcosahedronGeometry(0.028, 0), '#e2394a', Math.cos(a) * 0.2, 0.19, Math.sin(a) * 0.2)); }
      ['#7cc4f0', '#f5c534', '#f06a8a'].forEach(function (c, i2) {
        var x = (i2 - 1) * 0.07;
        g.add(cyl(0.01, 0.01, 0.09, 6, c, x, 0.325, 0));
        var f = new T.Mesh(new T.IcosahedronGeometry(0.018, 0), new T.MeshBasicMaterial({ color: '#ffb340' }));
        f.position.set(x, 0.385, 0); g.add(f);
      });
      var glyphs = {
        7: ['#####', '....#', '...#.', '..#..', '..#..', '.#...', '.#...'],
        0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.']
      };
      [[7, -0.2, 0], [0, 0.2, 0.6]].forEach(function (b) {
        var dt = digitTexture(glyphs[b[0]]);
        var sp = new T.Sprite(new T.SpriteMaterial({ map: dt.t, alphaTest: 0.5 }));
        var hgt = 0.55; sp.scale.set(hgt * dt.aspect, hgt, 1);
        earthAll.add(sp);
        var line = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: '#ffffff' }));
        earthAll.add(line);
        balloons.push({ sp: sp, line: line, x: b[1], ph: b[2], hgt: hgt });
      });
      g.scale.setScalar(1.15);
      place(g, 44, 80, -Math.PI / 2);
    })();

    function tree(kind) {
      var g = new T.Group();
      g.add(cyl(0.025, 0.035, 0.12, 6, '#8a5a3c', 0, 0.06, 0));
      if (kind) { g.add(mesh(new T.ConeGeometry(0.14, 0.26, 6), '#4b9a47', 0, 0.24, 0)); g.add(mesh(new T.ConeGeometry(0.1, 0.2, 6), '#58a94f', 0, 0.36, 0)); }
      else g.add(mesh(new T.IcosahedronGeometry(0.15, 0), '#62b450', 0, 0.24, 0));
      g.scale.setScalar(0.8 + rnd() * 0.5);
      return g;
    }
    [[30, 10], [33, 140], [30, 200], [34, 250], [30, 310], [-30, 200], [-31, 340], [58, 30], [55, 170], [60, 230], [-38, 100], [-40, 150], [-37, 260], [-40, 40], [-58, 120], [-60, 290], [-55, 0], [72, 40], [-74, 90], [75, 280], [70, 150], [-72, 220]]
      .forEach(function (p, i) { place(tree(i % 3 === 0), p[0], p[1], rnd() * 6); });
    for (var fi = 0; fi < 60; fi++) {
      var fla = (25 + rnd() * 60) * (rnd() < 0.5 ? 1 : -1), flo = rnd() * 360;
      place(mesh(new T.IcosahedronGeometry(0.03, 0), ['#f49ab0', '#ffe066', '#ffffff', '#ff8a6a'][fi % 4]), fla, flo, 0, 0.01);
    }

    var clouds = new T.Group(); earthAll.add(clouds);
    [[70, 0.4], [-70, 0.9], [100, -1.2], [-110, 2.0], [180, 2.4], [-35, -1.7], [40, -2.0]].forEach(function (p) {
      var g = new T.Group(), n = 3 + Math.floor(rnd() * 2);
      for (var i = 0; i < n; i++) {
        var r = 0.16 + rnd() * 0.12;
        var m = new T.Mesh(new T.IcosahedronGeometry(r, 1), mat('#ffffff', { roughness: 1 }));
        m.position.set((i - (n - 1) / 2) * 0.2, (i % 2) * 0.07, (rnd() - 0.5) * 0.12);
        g.add(m);
      }
      var rr = 2.9 + rnd() * 0.3;
      g.position.set(Math.sin(p[0] * D) * rr, p[1], Math.cos(p[0] * D) * rr);
      clouds.add(g);
    });

    // 저녁 별
    if (eve) {
      var sp = new Float32Array(90 * 3);
      for (var si = 0; si < 90; si++) { sp[si * 3] = (Math.random() - 0.5) * 30; sp[si * 3 + 1] = (Math.random() - 0.1) * 16; sp[si * 3 + 2] = (Math.random() - 0.5) * 30 - 6; }
      var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3));
      scene.add(new T.Points(sg, new T.PointsMaterial({ color: 0xFFFFFF, size: 0.1, sizeAttenuation: true })));
    }

    // 캐릭터 (픽셀 스프라이트, 항상 카메라를 향하는 빌보드)
    var CH = 0.84, CW = CH * FS.W / FS.H;
    var charGeo = new T.PlaneGeometry(CW, CH); charGeo.translate(0, CH / 2, 0);
    var blobGeo = new T.CircleGeometry(0.11, 20);
    var blobMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false });
    var ROWS = { sister: [0, 0], hyungbu: [0, 1], dad: [0, 2], mom: [0, 3], oppa: [0, 4], niece: [1, 0], nephew: [1, 1], me: [1, 2], husband: [1, 3], saeonni: [1, 4] };
    var chars = PEOPLE.map(function (p, i) {
      var spec = FS.SPECS[p.id];
      var tex = [0, 1, 2, 3].map(function (step) { return sprTex(FS.walkGrid(spec, step)); });
      var m = new T.Mesh(charGeo, new T.MeshBasicMaterial({ map: tex[0], transparent: true, alphaTest: 0.5, side: T.DoubleSide }));
      m.matrixAutoUpdate = false; earthAll.add(m);
      var blob = new T.Mesh(blobGeo, blobMat); blob.matrixAutoUpdate = false; earthAll.add(blob);
      var row = ROWS[p.id];
      var th = row[0] ? 0.3 : -0.3, lane = (row[1] - 2 + (row[0] ? 0.5 : 0)) * 0.15 - (row[0] ? 0.075 : 0);
      return { p: p, mesh: m, blob: blob, tex: tex, idx: i, home: new T.Vector3(Math.sin(lane), Math.cos(lane) * Math.cos(th), Math.cos(lane) * Math.sin(th)) };
    });

    // 캐릭터 말풍선 (디자인의 #bubble)
    var bubble = el('div', 'intro-bubble');
    bubble.innerHTML = '<div><b></b><span class="role"></span></div><div class="tags"></div>';
    ui.labels.appendChild(bubble);
    var selected = null;

    var look = new T.Vector3(0, 1.75, 0);
    function resize() {
      w = overlay.clientWidth || window.innerWidth; h = overlay.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      var dist = Math.max(9.5, 2.7 / ((T2 / 2) * (w / h))), el2 = 18 * D;
      camera.position.set(0, look.y + Math.sin(el2) * dist, Math.cos(el2) * dist);
      camera.lookAt(look);
    }
    window.addEventListener('resize', resize);

    var lastNow = 0, perfN = 0, perfSum = 0, perfChecked = false;

    var ray = new T.Raycaster(), mouse = new T.Vector2();
    var nv = new T.Vector3(), pv = new T.Vector3(), fv = new T.Vector3(), rv = new T.Vector3(), mtx = new T.Matrix4(), tmp = new T.Vector3(), Z = new T.Vector3(0, 0, 1);
    var elapsed = 0;

    function earthTick(dt) {
      elapsed += dt;
      planet.rotation.x -= dt * 0.13;
      clouds.children.forEach(function (c, i) { c.position.y += Math.sin(elapsed * 0.6 + i) * 0.0015; });
      scene.updateMatrixWorld();
      for (var i = 0; i < chars.length; i++) {
        var c = chars[i];
        nv.copy(c.home);
        var frame = c === selected ? 0 : Math.floor(elapsed * 7 + c.idx * 1.3) % 4;
        c.mesh.material.map = c.tex[frame];
        var bob = frame % 2 ? 0.012 : 0;
        pv.copy(nv).multiplyScalar(R + 0.016 + bob);
        fv.copy(camera.position).sub(pv); fv.addScaledVector(nv, -fv.dot(nv)).normalize();
        rv.crossVectors(nv, fv).normalize();
        mtx.makeBasis(rv, nv, fv).setPosition(pv);
        c.mesh.matrix.copy(mtx); c.mesh.matrixWorldNeedsUpdate = true;
        tmp.copy(nv).multiplyScalar(R + 0.016);
        c.blob.matrix.compose(tmp, new T.Quaternion().setFromUnitVectors(Z, nv), new T.Vector3(1, 1, 1)); c.blob.matrixWorldNeedsUpdate = true;
      }
      if (selected) {
        var s = selected;
        nv.set(0, 1, 0).applyMatrix4(new T.Matrix4().extractRotation(s.mesh.matrix));
        tmp.setFromMatrixPosition(s.mesh.matrix).addScaledVector(nv, CH * 0.78);
        var facing = tmp.clone().normalize().dot(fv.copy(camera.position).normalize());
        if (facing < 0.15) { selected = null; bubble.style.display = 'none'; }
        else {
          tmp.project(camera);
          bubble.style.left = ((tmp.x + 1) / 2 * w) + 'px';
          bubble.style.top = ((1 - tmp.y) / 2 * h) + 'px';
        }
      }
      var cp = new T.Vector3(); cake.getWorldPosition(cp);
      var cakeUp = new T.Vector3(0, 1, 0).applyQuaternion(cake.getWorldQuaternion(new T.Quaternion()));
      var topP = cp.clone().addScaledVector(cakeUp, 0.4);
      balloons.forEach(function (b) {
        b.sp.position.set(topP.x + b.x + 0.35, topP.y + 0.75 + Math.sin(elapsed * 1.6 + b.ph) * 0.05, topP.z);
        var pa = b.line.geometry.attributes.position;
        pa.setXYZ(0, topP.x, topP.y, topP.z); pa.setXYZ(1, b.sp.position.x, b.sp.position.y - b.hgt * 0.45, b.sp.position.z); pa.needsUpdate = true;
      });
    }

    function frame(now) {
      if (finished) return;
      raf = requestAnimationFrame(frame);
      var raw = lastNow ? now - lastNow : 16;
      var dt = Math.min(raw, 100) / 1000;
      lastNow = now;
      try {
        // 느린 기기 감지 → 해상도 낮추기 → 그래도 느리면 2D로
        if (!perfChecked && raw < 400) {
          perfN++;
          if (perfN > 8) perfSum += raw;
          if (perfN === 48) {
            var avg = perfSum / 40; perfChecked = true;
            if (avg > 70) { fallbackTo2D(); return; }
            if (avg > 34 && dpr > 1) { dpr = 1; renderer.setPixelRatio(1); resize(); }
          }
        }
        earthTick(dt);
        renderer.render(scene, camera);
      } catch (err) { fallbackTo2D(); }
    }

    function setRay(ev) {
      var r = canvas.getBoundingClientRect(), p = ev.changedTouches ? ev.changedTouches[0] : ev;
      mouse.set(((p.clientX - r.left) / r.width) * 2 - 1, -((p.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
    }
    function charFacing(c) { // 머리가 행성 지평선 너머로 넘어간 캐릭터면 false (뒷줄은 발이 언덕에 가려도 머리는 보임)
      tmp.setFromMatrixPosition(c.mesh.matrix);
      nv.copy(tmp).normalize();
      tmp.addScaledVector(nv, CH * 0.7);
      return tmp.dot(camera.position) > R * R;
    }
    function pickChar(ev) { // 투명한 부분은 건너뛰고, 행성 뒤에 가려진 캐릭터는 제외
      setRay(ev);
      var hits = ray.intersectObjects(chars.map(function (c) { return c.mesh; }), false);
      for (var i = 0; i < hits.length; i++) {
        var hh = hits[i];
        var c = chars.filter(function (c2) { return c2.mesh === hh.object; })[0];
        if (!charFacing(c)) continue;
        var img = c.mesh.material.map.image;
        if (!img.__ctx) img.__ctx = img.getContext('2d', { willReadFrequently: true });
        var x = Math.min(img.width - 1, Math.floor(hh.uv.x * img.width)), y = Math.min(img.height - 1, Math.floor((1 - hh.uv.y) * img.height));
        if (img.__ctx.getImageData(x, y, 1, 1).data[3] > 0) return c;
      }
      return nearChar(ev);
    }
    // 폰에선 캐릭터가 작고 뒷줄이 앞줄·언덕에 가려져 정확히 누르기 어렵다 → 화면에서 가장 가까운 캐릭터를 고른다
    function nearChar(ev) {
      var r = canvas.getBoundingClientRect(), p = ev.changedTouches ? ev.changedTouches[0] : ev;
      var px = p.clientX - r.left, py = p.clientY - r.top, best = null, bestD = Infinity;
      chars.forEach(function (c) {
        if (!charFacing(c)) return;
        nv.set(0, 1, 0).applyMatrix4(mtx.extractRotation(c.mesh.matrix));
        var base = new T.Vector3().setFromMatrixPosition(c.mesh.matrix);
        var mid = base.clone().addScaledVector(nv, CH * 0.5).project(camera);
        var top = base.clone().addScaledVector(nv, CH).project(camera);
        var mx = (mid.x + 1) / 2 * r.width, my = (1 - mid.y) / 2 * r.height;
        var half = Math.abs(((1 - top.y) / 2 * r.height) - my);
        var d = Math.hypot(px - mx, py - my);
        if (d < Math.max(28, half * 1.1) && d < bestD) { best = c; bestD = d; }
      });
      return best;
    }
    function onTap(ev) {
      var c = pickChar(ev);
      selected = c && c !== selected ? c : null;
      if (selected) {
        bubble.querySelector('b').textContent = c.p.name;
        bubble.querySelector('.role').textContent = c.p.role;
        bubble.querySelector('.tags').innerHTML = c.p.tags.map(function (t) { return '<span>' + t + '</span>'; }).join('');
      }
      bubble.style.display = selected ? 'block' : 'none';
    }
    canvas.addEventListener('click', onTap);

    function fallbackTo2D() {
      if (mode === '2d') return;
      cancelAnimationFrame(raf);
      api.dispose();
      start2D();
    }

    api = {
      enter: finish,
      dispose: function () {
        window.removeEventListener('resize', resize);
        try { renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (e) { /* 무시 */ }
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        ui.labels.innerHTML = '';
        Object.keys(geoms).forEach(function (k) { geoms[k].dispose(); });
      }
    };
    mode = '3d';

    resize();
    enterCaption();
    raf = requestAnimationFrame(frame);
  }

  // ── 2D 대체 버전 (같은 픽셀 캐릭터가 걷는 간단한 그림) ──
  function start2D() {
    mode = '2d';
    cancelAnimationFrame(raf);
    ui.stage.innerHTML = ''; ui.labels.innerHTML = '';
    var root = el('div', 'i2d');
    ui.stage.appendChild(root);
    root.innerHTML = '<div class="i2d-sun"></div><div class="i2d-earth"></div>';
    var walk = el('div', 'i2d-walk');
    var FS = window.FamilySprites;
    PEOPLE.forEach(function (p) {
      var span = el('span');
      if (FS && FS.SPECS[p.id]) {
        var cv = FS.paintGrid(document.createElement('canvas'), FS.walkGrid(FS.SPECS[p.id], 0), 3);
        cv.className = 'i2d-px'; span.appendChild(cv);
      } else span.textContent = p.id === 'dad' ? '👑' : '🧍';
      walk.appendChild(span);
    });
    root.appendChild(walk);
    api = { enter: finish, dispose: function () { /* 정리할 것 없음 */ } };
    enterCaption();
  }

  // ── 시작 ────────────────────────────────────────────────
  function init() {
    var hr = new Date().getHours();
    eve = hr >= 17 || hr < 5;
    seen = readSeen();
    buildUI();
    ui.go.addEventListener('click', finish);
    earthCaption();

    var hasGL = false;
    try {
      var c = document.createElement('canvas');
      hasGL = !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { hasGL = false; }
    if (!hasGL) return loadScript('js/family-sprites.js', function () { if (!finished && !mode) start2D(); });

    loadThree(function (ok) {
      if (finished || mode) return;
      if (!ok) return start2D();
      try { build3D(); } catch (err) {
        try { if (api && api.dispose) api.dispose(); } catch (e2) { /* 무시 */ }
        start2D();
      }
    });
  }

  function boot() {
    try { init(); } catch (err) {
      // 어떤 이유로든 실패하면 오버레이를 걷어내 사이트를 그대로 보여줌
      finished = true;
      try { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { /* 무시 */ }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
