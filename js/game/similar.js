/*
 * M2 사진 유사도 채점 도우미 — 예시 사진 + 팀 사진을 팀 이름과 함께 한 장으로 합치고,
 * 진행자 폰의 Claude 앱에 붙여넣을 채점 프롬프트를 만든다. (앱 안에서 AI를 부르지 않음)
 */
(function () {
  "use strict";

  var G = window.Game;
  if (!G) return;
  var esc = G.esc;

  function load(url) {
    return new Promise(function (res) {
      if (!url) return res(null);
      var im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = function () { res(im); };
      im.onerror = function () { res(null); };
      im.src = url;
    });
  }

  function cover(ctx, img, x, y, w, h) {
    ctx.fillStyle = "#E6DED2";
    ctx.fillRect(x, y, w, h);
    if (!img) {
      ctx.fillStyle = "#7C8796";
      ctx.font = "28px Jua, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("사진 없음", x + w / 2, y + h / 2);
      ctx.textAlign = "left";
      return;
    }
    var k = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / k, sh = h / k;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }

  function tag(ctx, text, x, y, bg) {
    ctx.font = "34px Jua, sans-serif";
    var w = ctx.measureText(text).width + 28;
    ctx.fillStyle = bg; ctx.strokeStyle = "#2B2B2B"; ctx.lineWidth = 3;
    ctx.fillRect(x, y, w, 52); ctx.strokeRect(x, y, w, 52);
    ctx.fillStyle = "#2B2B2B"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + 14, y + 28);
  }

  function frame(ctx, x, y, w, h) {
    ctx.strokeStyle = "#2B2B2B"; ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
  }

  G.composeSimilar = function (v) {
    var teams = G.adminBoard.teams;
    var exById = {};
    v.examples.forEach(function (x, i) { exById[x.id] = { url: G.imgUrl(x.path), no: i + 1 }; });
    var rows = teams.map(function (t) {
      var x = v.teams[t.id] || {};
      return { t: t, photo: x.photo ? G.imgUrl(x.photo) : null, ex: exById[x.example] || null };
    });
    var same = v.mode === "same";
    var urls = rows.map(function (r) { return r.photo; }).concat(rows.map(function (r) { return r.ex && r.ex.url; }));
    if (!v.examples.length) return G.sheet('<p>예시 사진을 먼저 추가해 주세요.</p><button class="g-textbtn" data-act="close-sheet">닫기</button>');
    G.sheet('<span class="g-h2">비교 이미지 만드는 중…</span>');

    Promise.all(urls.map(load)).then(function (imgs) {
      var photoImg = imgs.slice(0, 4), exImg = imgs.slice(4);
      var c = document.createElement("canvas"), ctx = c.getContext("2d"), W = 1200, P = 30;
      if (same) {
        var cell = (W - P * 3) / 2, eh = 640, ch = cell * .78;
        c.width = W; c.height = P + eh + P + (ch + P) * 2;
        ctx.fillStyle = "#F4EFEA"; ctx.fillRect(0, 0, c.width, c.height);
        cover(ctx, exImg[0], P, P, W - P * 2, eh); frame(ctx, P, P, W - P * 2, eh);
        tag(ctx, "예시", P + 16, P + 16, "#FFD93D");
        rows.forEach(function (r, i) {
          var x = P + (i % 2) * (cell + P), y = P + eh + P + Math.floor(i / 2) * (ch + P);
          cover(ctx, photoImg[i], x, y, cell, ch); frame(ctx, x, y, cell, ch);
          tag(ctx, r.t.name, x + 14, y + 14, r.t.color);
        });
      } else {
        var half = (W - P * 3) / 2, rh = 420;
        c.width = W; c.height = P + (rh + P) * rows.length;
        ctx.fillStyle = "#F4EFEA"; ctx.fillRect(0, 0, c.width, c.height);
        rows.forEach(function (r, i) {
          var y = P + i * (rh + P);
          cover(ctx, exImg[i], P, y, half, rh); frame(ctx, P, y, half, rh);
          tag(ctx, "예시" + (r.ex ? " " + r.ex.no : ""), P + 14, y + 14, "#FFD93D");
          cover(ctx, photoImg[i], P * 2 + half, y, half, rh); frame(ctx, P * 2 + half, y, half, rh);
          tag(ctx, r.t.name, P * 2 + half + 14, y + 14, r.t.color);
        });
      }
      var names = teams.map(function (t) { return t.name; });
      var prompt =
        "첨부한 이미지는 가족 여행 '사진 따라 찍기' 미션 결과예요.\n" +
        (same ? "맨 위 \"예시\" 사진과 아래 팀 사진 4장이 얼마나 비슷한지 채점해 주세요.\n"
              : "줄마다 왼쪽이 그 팀이 받은 \"예시\" 사진, 오른쪽이 팀이 찍은 사진이에요. 각 팀 사진이 자기 예시와 얼마나 비슷한지 채점해 주세요.\n") +
        "\n기준 (각 25점, 합계 0~100점)\n- 구도: 대상의 배치와 화면 속 위치\n- 포즈: 사람의 자세·동작\n- 각도: 촬영 높이와 방향\n- 분위기: 빛·색감·느낌\n" +
        "\n'사진 없음'인 팀은 0점이에요. 팀 이름은 사진 위 라벨을 보세요.\n" +
        "\n아래 형식으로만, 팀마다 한 줄씩 답해 주세요. 다른 설명은 쓰지 마세요.\n" +
        names.map(function (n) { return n + ": 점수 / 한 줄 평"; }).join("\n");
      c.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        G.sheet(
          '<span class="g-h2">비교 이미지</span>' +
          '<p class="a-hint">이미지를 길게 눌러 저장하거나 아래 버튼으로 내려받아요.</p>' +
          '<img class="p-full" src="' + url + '" alt="비교 이미지">' +
          '<a class="g-btn g-btn-wide" href="' + url + '" download="사진유사도_비교.jpg">이미지 내려받기</a>' +
          '<label class="g-label" for="sim-prompt">채점 프롬프트</label>' +
          '<textarea id="sim-prompt" class="g-input sim-prompt" rows="9" readonly>' + esc(prompt) + "</textarea>" +
          '<button class="g-btn g-btn-wide g-btn-yellow" data-act="sim-copy">프롬프트 복사</button>' +
          '<p class="g-sheet-msg" role="status"></p>' +
          '<button class="g-textbtn" data-act="close-sheet">닫기</button>');
      }, "image/jpeg", 0.9);
    });
  };

  document.addEventListener("click", function (e) {
    var b = e.target.closest('[data-act="sim-copy"]');
    if (!b) return;
    var ta = document.getElementById("sim-prompt");
    var msg = document.querySelector(".g-sheet-msg");
    var done = function () { if (msg) msg.textContent = "✓ 복사했어요. Claude 앱에 이미지와 함께 붙여넣으세요."; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, function () { ta.select(); document.execCommand("copy"); done(); });
    else { ta.select(); document.execCommand("copy"); done(); }
  });
})();
