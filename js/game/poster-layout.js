/*
 * 한 컷 콜라주 포스터 — 디자인만 담당 (데이터·저장은 poster.js).
 * 원본: design-drafts "가족게임 콜라주 포스터.zip" → 글자 콜라주 포스터 v2 (900×1200).
 * 시안의 HTML/CSS(찢은 종이 clip-path, drop-shadow, 회전)를 캔버스로 옮겨 PNG 저장이 정확하게 되도록 했다.
 * 디자인을 바꾸려면 이 파일의 숫자·색만 고치면 된다.
 *
 * PosterLayout.draw(ctx, data, images)
 *   data:   { hashtags, letters:[{ch, img}], teams:{p,u,o,w,all:{name, img}}, dad }
 *   images: { url → HTMLImageElement } (미리 불러온 것)
 */
(function () {
  "use strict";

  var W = 900, H = 1200;
  var FONTS = ["Black Han Sans", "Gowun Batang", "Do Hyeon", "Jua", "Nanum Pen Script"];
  var FONT_CSS = "https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Do+Hyeon&family=Gowun+Batang:wght@400;700&family=Gowun+Dodum&family=Jua&family=Nanum+Pen+Script&display=swap";
  var PEN = "'Nanum Pen Script', cursive";

  // ── 시안과 같은 찢은 가장자리 (같은 seed → 같은 모양) ──
  function rng(s) {
    return function () {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      var t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // 상자 기준 % 좌표 목록 [[x%, y%], ...]
  function tear(seed, amp, n) {
    amp = amp == null ? 3 : amp; n = n || 22;
    var r = rng(seed * 9973 + 7), p = [], i;
    var j = function () { return +(r() * amp).toFixed(2); };
    for (i = 0; i <= n; i++) p.push([+(i / n * 100).toFixed(1), j()]);
    for (i = 1; i <= n; i++) p.push([+(100 - j()).toFixed(2), +(i / n * 100).toFixed(1)]);
    for (i = n - 1; i >= 0; i--) p.push([+(i / n * 100).toFixed(1), +(100 - j()).toFixed(2)]);
    for (i = n - 1; i > 0; i--) p.push([j(), +(i / n * 100).toFixed(1)]);
    return p;
  }
  function path(ctx, pts, x, y, w, h) {
    ctx.beginPath();
    pts.forEach(function (q, i) {
      var px = x + q[0] / 100 * w, py = y + q[1] / 100 * h;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    });
    ctx.closePath();
  }

  // ── 그리기 도구 ──
  function shadow(ctx, oy, blur, color) {
    ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = oy;
  }
  function noShadow(ctx) { ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }

  // 중심 기준 회전 상자 안에서 그리기 (CSS transform: rotate, origin center)
  function box(ctx, x, y, w, h, deg, fn) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(deg * Math.PI / 180);
    ctx.translate(-w / 2, -h / 2);
    fn();
    ctx.restore();
  }

  function cover(ctx, img, x, y, w, h) {
    var k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    var sw = w / k, sh = h / k;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }
  function contain(ctx, img, x, y, w, h) {
    var k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    var dw = img.naturalWidth * k, dh = img.naturalHeight * k;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  // repeating-linear-gradient(135deg, a 0 w1, b w1 period) — "/" 방향 줄무늬
  function stripes(ctx, x, y, w, h, a, b, w1, period) {
    if (a) { ctx.fillStyle = a; ctx.fillRect(x, y, w, h); }
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = b;
    var step = period * Math.SQRT2, band = (period - w1) * Math.SQRT2;
    for (var d = -h; d < w + h; d += step) {
      ctx.beginPath();
      ctx.moveTo(x + d + w1 * Math.SQRT2, y);
      ctx.lineTo(x + d + w1 * Math.SQRT2 + band, y);
      ctx.lineTo(x + d + w1 * Math.SQRT2 + band - h, y + h);
      ctx.lineTo(x + d + w1 * Math.SQRT2 - h, y + h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  var noiseCache = {};
  function noise(alphaMax, rgb) {
    var key = alphaMax + rgb.join();
    if (noiseCache[key]) return noiseCache[key];
    var c = document.createElement("canvas");
    c.width = c.height = 200;
    var g = c.getContext("2d"), d = g.createImageData(200, 200), r = rng(42);
    for (var i = 0; i < d.data.length; i += 4) {
      d.data[i] = rgb[0]; d.data[i + 1] = rgb[1]; d.data[i + 2] = rgb[2];
      d.data[i + 3] = Math.round(r() * alphaMax * 255);
    }
    g.putImageData(d, 0, 0);
    return (noiseCache[key] = c);
  }

  // 종이 라벨 (찢은 가장자리 + 손글씨). anchor: 상자 왼쪽 위 기준 (x, y), 회전은 라벨 중심
  function label(ctx, text, o) {
    ctx.font = o.font;
    var tw = ctx.measureText(text).width;
    var w = tw + o.pl + o.pr, h = o.size * (o.lh || 1) + o.pt + o.pb;
    var y = o.bottom != null ? o.bottom - h : o.y;
    var x = o.center != null ? o.center - w / 2 : o.x;
    box(ctx, x, y, w, h, o.rot || 0, function () {
      if (o.shadow) shadow(ctx, 4, 10, "rgba(0,0,0,.25)");
      path(ctx, tear(906, 8, 8), 0, 0, w, h);
      ctx.fillStyle = o.bg; ctx.fill();
      noShadow(ctx);
      ctx.fillStyle = o.color;
      ctx.textBaseline = "middle";
      ctx.fillText(text, o.pl, o.pt + o.size * (o.lh || 1) / 2 + o.size * 0.06);
    });
    return { w: w, h: h };
  }

  function placeholder(ctx, w, h, text, c1, c2, ink) {
    stripes(ctx, 0, 0, w, h, c1, c2, 10, 20);
    ctx.fillStyle = ink;
    ctx.font = "16px ui-monospace, Menlo, Consolas, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2);
    ctx.textAlign = "left";
  }

  // ── 팀 사진 (찢은 테두리 + 테이프 + 이름 라벨) ──
  function teamPhoto(ctx, t, img) {
    box(ctx, t.x, t.y, t.w, t.h, t.rot, function () {
      shadow(ctx, 12, 16, "rgba(30,30,50,.35)");
      path(ctx, tear(200 + t.i, 3.5, 26), 0, 0, t.w, t.h);
      ctx.fillStyle = "#FBF8F1"; ctx.fill();
      noShadow(ctx);
      var iw = t.w - 24, ih = t.h - 24;
      ctx.save();
      ctx.translate(12, 12);
      path(ctx, tear(240 + t.i, 2.5, 26), 0, 0, iw, ih);
      ctx.clip();
      if (img) cover(ctx, img, 0, 0, iw, ih);
      else placeholder(ctx, iw, ih, t.placeholder, "#EEF2F7", "#E2E9F1", "#7C8796");
      ctx.restore();
      // 테이프
      box(ctx, t.tapeX, -14, 110, 34, t.tapeRot, function () {
        path(ctx, tear(905, 8, 6), 0, 0, 110, 34);
        ctx.fillStyle = t.tape; ctx.fill();
      });
      // 이름 라벨
      var lo = { font: "34px " + PEN, size: 34, lh: 1.1, pt: 6, pb: 4, pl: 18, pr: 18, x: t.labelX, rot: t.labelRot, bg: t.labelBg, color: t.labelInk };
      if (t.labelTop != null) lo.y = t.labelTop; else lo.bottom = t.h + 14;
      label(ctx, t.name, lo);
    });
  }

  // ── 글자 칸 ──
  var LCH = ["정", "주", "의", "칠", "순", "을", "축", "하", "합", "니", "다", "♥"];
  var LFONTS = ["'Black Han Sans'", "'Gowun Batang'", "'Do Hyeon'", "'Jua'", "'Nanum Pen Script'"];
  var TINTS = ["#F4D3D6", "#F8DCC4", "#F6E9B8", "#CFE6DA", "#DCE8F4", "#E2D6F0"];
  var CHIPS = [["#2E2A30", "#fff"], ["#F4D3D6", "#2E2A30"], ["#fff", "#C2475A"], ["#F6E9B8", "#2E2A30"], ["#7FA6CF", "#fff"], ["#CFE6DA", "#2E2A30"]];
  var ROTS = [-4, 3, -2, 5, -3, 2, 4, -5, 2, -3, 5, -2];
  var DYS = [6, -8, 4, -4, 10, -6, -6, 8, -4, 6, -8, 4];

  function letterTile(ctx, i, ch, img, cx, cy) {
    var w = 120, h = 142;
    var heart = ch === "♥";
    var font = heart ? "'Jua'" : LFONTS[i % LFONTS.length];
    var chip = CHIPS[i % CHIPS.length];
    var chipInk = heart && chip[1] === "#2E2A30" ? "#D9677A" : chip[1];
    var chipRot = -ROTS[i] * 1.4;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ROTS[i] * Math.PI / 180);
    ctx.translate(-w / 2, -h / 2 + DYS[i]);
    shadow(ctx, 8, 10, "rgba(40,30,40,.35)");
    path(ctx, tear(i + 1, 5, 12), 0, 0, w, h);
    ctx.fillStyle = "#fff"; ctx.fill();
    noShadow(ctx);
    ctx.save();
    ctx.translate(7, 7);
    path(ctx, tear(i + 41, 4, 12), 0, 0, w - 14, h - 14);
    ctx.clip();
    if (img) cover(ctx, img, 0, 0, w - 14, h - 14);
    else {
      stripes(ctx, 0, 0, w - 14, h - 14, TINTS[i % TINTS.length], "rgba(255,255,255,.5)", 8, 14);
      ctx.fillStyle = heart ? "#D9677A" : "#4A4448";
      ctx.font = "78px " + font;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(ch, (w - 14) / 2, (h - 14) / 2 + 4);
      ctx.textAlign = "left";
    }
    ctx.restore();
    if (img) {
      // 사진 위 글자 스티커 (왼쪽 아래)
      ctx.font = "36px " + font;
      var cw = ctx.measureText(ch).width + 22, chh = 36 + 12;
      box(ctx, -10, h + 12 - chh, cw, chh, chipRot, function () {
        shadow(ctx, 4, 8, "rgba(0,0,0,.25)");
        path(ctx, tear(i + 81, 10, 5), 0, 0, cw, chh);
        ctx.fillStyle = chip[0]; ctx.fill();
        noShadow(ctx);
        ctx.fillStyle = chipInk; ctx.textBaseline = "middle";
        ctx.fillText(ch, 11, 7 + 18 + 2);
      });
    } else {
      // 빈 칸 위 테이프
      box(ctx, 30, -12, 60, 22, chipRot, function () {
        path(ctx, tear(i + 81, 10, 5), 0, 0, 60, 22);
        ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fill();
      });
    }
    ctx.restore();
  }

  function draw(ctx, data, images) {
    var im = function (url) { return url && images[url] && images[url].naturalWidth ? images[url] : null; };
    ctx.save();
    ctx.fillStyle = "#BCD1E7";
    ctx.fillRect(0, 0, W, H);

    // 종이 조각 두 장
    box(ctx, -60, 330, 420, 260, -8, function () {
      path(ctx, tear(901, 6, 16), 0, 0, 420, 260);
      ctx.save(); ctx.clip();
      ctx.fillStyle = "#EFEAE0"; ctx.fillRect(0, 0, 420, 260);
      ctx.fillStyle = "#DCD5C8";
      for (var ly = 13; ly < 260; ly += 14) ctx.fillRect(0, ly, 420, 1);
      ctx.restore();
    });
    box(ctx, 570, 300, 380, 280, 7, function () {
      path(ctx, tear(902, 7, 16), 0, 0, 380, 280);
      ctx.fillStyle = "#D9B98F"; ctx.fill();
    });

    // 아빠 뒤 분홍 햇살 종이
    box(ctx, 180, 60, 540, 500, -3, function () {
      shadow(ctx, 10, 18, "rgba(40,30,40,.25)");
      path(ctx, tear(903, 3, 30), 0, 0, 540, 500);
      ctx.fillStyle = "#FBF8F1"; ctx.fill();
      noShadow(ctx);
      var iw = 516, ih = 476;
      ctx.save();
      ctx.translate(12, 12);
      path(ctx, tear(904, 3, 30), 0, 0, iw, ih);
      ctx.clip();
      ctx.fillStyle = "#F4C9CF"; ctx.fillRect(0, 0, iw, ih);
      var cx = iw * .5, cy = ih * .4;
      ctx.fillStyle = "rgba(255,255,255,.22)";
      for (var a = 0; a < 360; a += 14) {
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, 900, (a - 90) * Math.PI / 180, (a + 6 - 90) * Math.PI / 180);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.beginPath(); ctx.arc(cx, cy, Math.hypot(iw - cx, ih - cy) * .3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // 위쪽 팀 사진 두 장 (부모님 · 언니네)
    var T = data.teams;
    teamPhoto(ctx, { i: 0, name: T.p.name, x: -24, y: -16, w: 390, h: 370, rot: -4, tapeX: 220, tapeRot: 8, labelX: 40, labelRot: -5,
      labelBg: "#F6E9B8", labelInk: "#3E383C", tape: "rgba(246,233,184,.82)", placeholder: "팀 단체사진" }, im(T.p.img));
    teamPhoto(ctx, { i: 1, name: T.u.name, x: 540, y: -10, w: 390, h: 360, rot: 5, tapeX: 50, tapeRot: -10, labelX: 170, labelRot: 4,
      labelBg: "#CFE6DA", labelInk: "#3E383C", tape: "rgba(246,233,184,.82)", placeholder: "팀 단체사진" }, im(T.u.img));

    // 아빠 (오려낸 사진 + 흰 테두리)
    var dad = im(data.dad);
    if (dad) {
      var outline = document.createElement("canvas");
      outline.width = 400 + 20; outline.height = 492 + 20;
      var o = outline.getContext("2d");
      // 흰 테두리: 사진을 상하좌우로 5px씩 흰색으로 찍은 뒤 원본
      var tmp = document.createElement("canvas");
      tmp.width = outline.width; tmp.height = outline.height;
      var t2 = tmp.getContext("2d");
      contain(t2, dad, 10, 10, 400, 492);
      t2.globalCompositeOperation = "source-in";
      t2.fillStyle = "#fff"; t2.fillRect(0, 0, tmp.width, tmp.height);
      [[5, 0], [-5, 0], [0, 5], [0, -5], [4, 4], [-4, 4], [4, -4], [-4, -4]].forEach(function (d) { o.drawImage(tmp, d[0], d[1]); });
      contain(o, dad, 10, 10, 400, 492);
      ctx.save();
      shadow(ctx, 16, 18, "rgba(40,30,40,.35)");
      ctx.drawImage(outline, 240, 18);
      ctx.restore();
    } else {
      box(ctx, 315, 90, 270, 330, -2, function () {
        ctx.beginPath(); ctx.ellipse(135, 165, 135, 165, 0, 0, Math.PI * 2); ctx.save(); ctx.clip();
        placeholder(ctx, 270, 330, "아빠 사진", "#F6E7D6", "#EFDCCB", "#9A8577");
        ctx.restore();
      });
    }
    label(ctx, "우리 아빠 ♡", { font: "36px " + PEN, size: 36, pt: 8, pb: 8, pl: 22, pr: 22, x: 520, y: 410, rot: 5, bg: "#fff", color: "#C2475A" });

    // 아래 팀 사진 (z1: 우리 · 오빠네, z2: 우리 가족)
    teamPhoto(ctx, { i: 2, name: T.w.name, x: -30, y: 915, w: 340, h: 305, rot: 4, tapeX: 160, tapeRot: 6, labelX: 60, labelRot: -4, labelTop: -24,
      labelBg: "#F4D3D6", labelInk: "#3E383C", tape: "rgba(207,230,218,.82)", placeholder: "팀 단체사진" }, im(T.w.img));
    teamPhoto(ctx, { i: 3, name: T.o.name, x: 590, y: 915, w: 340, h: 305, rot: -5, tapeX: 70, tapeRot: -8, labelX: 120, labelRot: 5, labelTop: -24,
      labelBg: "#E2D6F0", labelInk: "#3E383C", tape: "rgba(207,230,218,.82)", placeholder: "팀 단체사진" }, im(T.o.img));
    teamPhoto(ctx, { i: 4, name: T.all.name, x: 255, y: 910, w: 390, h: 280, rot: -1.5, tapeX: 140, tapeRot: -3, labelX: 110, labelRot: -3, labelTop: -24,
      labelBg: "#2E2A30", labelInk: "#fff", tape: "rgba(207,230,218,.82)", placeholder: "가족 단체사진 (관리자)" }, im(T.all.img));

    // z3: 글자 띠 종이
    box(ctx, -30, 540, 960, 340, -2, function () {
      shadow(ctx, 10, 18, "rgba(0,0,0,.2)");
      path(ctx, tear(900, 4, 40), 0, 0, 960, 340);
      ctx.fillStyle = "#FBF7F0"; ctx.fill();
      noShadow(ctx);
      ctx.save(); ctx.clip();
      ctx.fillStyle = ctx.createPattern(noise(.08, [90, 90, 90]), "repeat");
      ctx.fillRect(0, 0, 960, 340);
      ctx.restore();
    });

    // z4: "칠순 주인공!" + 화살표
    box(ctx, 24, 350, 280, 126, -6, function () {
      label(ctx, "칠순 주인공!", { font: "44px " + PEN, size: 44, pt: 6, pb: 2, pl: 16, pr: 16, x: 0, y: 74, bg: "#fff", color: "#C2475A" });
      ctx.save();
      ctx.translate(150, 0);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(6, 76); ctx.bezierCurveTo(40, 70, 90, 50, 120, 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(104, 18); ctx.lineTo(121, 12); ctx.lineTo(122, 30); ctx.stroke();
      ctx.restore();
    });

    // z4: 글자 12칸 (두 줄, 전체 -2도)
    box(ctx, 0, 560, 900, 316, -2, function () {
      for (var i = 0; i < 12; i++) {
        var row = Math.floor(i / 6), col = i % 6;
        var l = data.letters[i] || { ch: LCH[i] };
        letterTile(ctx, i, l.ch || LCH[i], im(l.img), 55 + col * 134 + 60, row * 174 + 71);
      }
    });

    // z5: 해시태그
    if (data.hashtags) {
      label(ctx, data.hashtags, { font: "18px 'Gowun Dodum', sans-serif", size: 18, lh: 1.3, pt: 8, pb: 6, pl: 20, pr: 20, center: W / 2, y: 14, rot: 1, bg: "#FBF7F0", color: "#5B5560" });
    }

    // z6: 종이 질감
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = ctx.createPattern(noise(.25 * .35, [128, 115, 102]), "repeat");
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 글꼴 불러오기 (처음 한 번)
  var fontsReady = null;
  function loadFonts() {
    if (fontsReady) return fontsReady;
    var sample = "정주의칠순을축하합니다♥우리아빠가족팀단체사진#칠순주인공";
    fontsReady = new Promise(function (res) {
      var l = document.createElement("link");
      l.rel = "stylesheet"; l.href = FONT_CSS;
      l.onload = l.onerror = function () { res(); };
      document.head.appendChild(l);
      setTimeout(res, 4000);   // 글꼴 서버가 느려도 4초 뒤에는 그린다
    }).then(function () {
      if (!document.fonts || !document.fonts.load) return;
      return Promise.all(FONTS.concat(["Gowun Dodum"]).map(function (f) {
        return document.fonts.load("36px '" + f + "'", sample).catch(function () {});
      }));
    });
    return fontsReady;
  }

  window.PosterLayout = { W: W, H: H, draw: draw, loadFonts: loadFonts };
})();
