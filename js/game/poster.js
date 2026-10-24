/*
 * 한 컷 콜라주 포스터 — 데이터 연결 · 보기 · 진행자 편집(칸 교체, 해시태그, 공개) · PNG 저장.
 * 디자인은 poster-layout.js 에만 있다.
 */
(function () {
  "use strict";

  var G = window.Game;
  var L = window.PosterLayout;
  if (!G || !L) return;
  var esc = G.esc;
  var imgCache = {};
  var ed = { msg: "", busy: false };
  var LETTERS = ["정", "주", "의", "칠", "순", "을", "축", "하", "합", "니", "다", "♥"];

  function loadImage(url) {
    if (!url) return Promise.resolve(null);
    if (imgCache[url]) return imgCache[url];
    imgCache[url] = new Promise(function (res) {
      var img = new Image();
      img.crossOrigin = "anonymous";   // Storage가 CORS 허용 → PNG 저장 가능
      img.onload = function () { res(img); };
      img.onerror = function () { res(null); };
      img.src = url;
    });
    return imgCache[url];
  }

  function model(d) {
    var p = d.poster || {}, ov = p.overrides || {};
    var team = function (id) { return (d.teams || []).filter(function (t) { return t.id === id; })[0] || { name: "" }; };
    var url = function (path) { return path ? G.imgUrl(path) : null; };
    var teams = {};
    ["p", "u", "o", "w"].forEach(function (id) { teams[id] = { name: team(id).name, img: url(d.groups[id]) }; });
    teams.all = { name: "우리 가족 ♡", img: url(d.groups.all) };
    return {
      hashtags: p.hashtags || "",
      dad: url(p.dad),
      letters: d.letters.map(function (l) { return { ch: l.ch, img: url(ov["letter:" + l.idx] || l.photo) }; }),
      teams: teams
    };
  }

  // canvas에 포스터 그리기 (scale 2 = PNG 저장용 1800×2400)
  function paint(canvas, d, scale) {
    var m = model(d);
    var urls = [m.dad].concat(m.letters.map(function (l) { return l.img; }),
      ["p", "u", "o", "w", "all"].map(function (k) { return m.teams[k].img; }));
    return Promise.all([L.loadFonts()].concat(urls.map(loadImage))).then(function (res) {
      var images = {};
      urls.forEach(function (u, i) { if (u && res[i + 1]) images[u] = res[i + 1]; });
      canvas.width = L.W * scale;
      canvas.height = L.H * scale;
      var ctx = canvas.getContext("2d");
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      L.draw(ctx, m, images);
    });
  }

  function fetchData() {
    return G.rpc("poster_data", { p_token: G.adminToken || G.token() });
  }

  // PNG 저장: 다운로드 + (인앱 브라우저용) 길게 눌러 저장할 수 있게 이미지로 보여주기
  function savePng(d) {
    var c = document.createElement("canvas");
    return paint(c, d, 2).then(function () {
      return new Promise(function (res) { c.toBlob(res, "image/png"); });
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "칠순_콜라주_포스터.png";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      G.sheet(
        '<span class="g-h2">포스터 이미지</span>' +
        "<p>다운로드가 안 되면 이미지를 <b>길게 눌러 저장</b>하세요.</p>" +
        '<img class="p-full" src="' + url + '" alt="콜라주 포스터">' +
        '<button class="g-textbtn" data-act="close-sheet">닫기</button>');
    });
  }

  // ── 가족·진행자 공통: 포스터 보기 ──
  G.openPoster = function () {
    G.sheet('<span class="g-h2">콜라주 포스터</span><canvas class="p-canvas" id="p-view"></canvas>' +
      '<p class="g-sheet-msg" id="p-view-msg">그리는 중…</p>' +
      '<button class="g-btn g-btn-wide g-btn-yellow" data-act="p-save-view">이미지로 저장</button>' +
      '<button class="g-textbtn" data-act="close-sheet">닫기</button>');
    fetchData().then(function (d) {
      G._posterView = d;
      return paint(document.getElementById("p-view"), d, 1);
    }).then(function () {
      var m = document.getElementById("p-view-msg"); if (m) m.textContent = "";
    }, function (e) {
      var m = document.getElementById("p-view-msg"); if (m) m.textContent = /비공개/.test(e.message) ? e.message : "불러오지 못했어요";
    });
  };

  // ── 진행자 편집 화면 (admin.js의 "포스터" 탭) ──
  G.mountPosterEditor = function (host) {
    host.innerHTML = '<p class="g-loading">포스터 불러오는 중…</p>';
    fetchData().then(function (d) {
      G._posterAdmin = d;
      renderEditor(host, d);
    }, function () { host.innerHTML = '<p class="a-note">포스터를 불러오지 못했어요.</p>'; });
  };

  function slotBtn(key, label, has, hasOverride) {
    return '<button class="p-slot' + (has ? " on" : "") + '" data-act="p-slot" data-key="' + key + '">' +
      '<span class="p-slot-l">' + esc(label) + "</span>" +
      '<span class="g-mono">' + (has ? "사진 있음" : "비어 있음") + "</span>" +
      (hasOverride ? '<span class="p-slot-x" data-act="p-unset" data-key="' + key + '" role="button" aria-label="원래 사진으로">원래대로</span>' : "") +
    "</button>";
  }

  function renderEditor(host, d) {
    var p = d.poster || {}, ov = p.overrides || {};
    var team = function (id) { return (d.teams || []).filter(function (t) { return t.id === id; })[0] || { name: id }; };
    host.innerHTML =
      '<div class="g-stack">' +
        '<canvas class="p-canvas" id="p-edit"></canvas>' +
        (ed.msg ? '<p class="a-msg" role="status">' + esc(ed.msg) + "</p>" : "") +
        '<button class="g-btn g-btn-wide g-btn-yellow" data-act="p-save"' + (ed.busy ? " disabled" : "") + ">PNG로 저장</button>" +
        '<button class="a-switch' + (p.public ? " on" : "") + '" data-act="p-public" role="switch" aria-checked="' + !!p.public + '">' +
          '<span class="a-switch-knob"></span><span>' + (p.public ? "가족에게 공개 중 (미션 탭에서 볼 수 있어요)" : "진행자만 보는 중 · 가족에게 공개하기") + "</span></button>" +
        '<label class="g-label" for="p-tags">해시태그 문구</label>' +
        '<div class="g-row"><input id="p-tags" class="g-input" maxlength="120" value="' + esc(p.hashtags || "") + '">' +
          '<button class="g-btn" data-act="p-tags-save">저장</button></div>' +
        '<p class="g-card-title">칸 사진 바꾸기</p>' +
        '<p class="a-hint">칸을 누르면 사진을 골라 바꿀 수 있어요. 글자 칸은 팀이 올린 사진 대신 들어가고, "원래대로"로 되돌릴 수 있어요.</p>' +
        '<div class="p-slots">' +
          slotBtn("dad", "아빠", !!p.dad, false) +
          ["p", "u", "o", "w"].map(function (id) { return slotBtn("group:" + id, team(id).name, !!d.groups[id], false); }).join("") +
          slotBtn("group:all", "우리 가족 ♡", !!d.groups.all, false) +
        "</div>" +
        '<div class="p-slots p-slots-letters">' +
          d.letters.map(function (l) {
            var k = "letter:" + l.idx;
            return slotBtn(k, LETTERS[l.idx], !!(ov[k] || l.photo), !!ov[k]);
          }).join("") +
        "</div>" +
      "</div>";
    paint(document.getElementById("p-edit"), d, 1);
  }

  function setSlot(key, path) {
    if (key === "dad") return G.admin("admin_poster_update", { p_patch: { dad: path } });
    if (key.indexOf("group:") === 0) return G.admin("admin_set_group_photo", { p_slot: key.slice(6), p_path: path });
    return G.admin("admin_poster_update", { p_patch: { override: { key: key, path: path } } });
  }

  function reload(msg) {
    ed.busy = false;
    ed.msg = msg || "";
    var host = document.getElementById("p-editor");
    if (host) G.mountPosterEditor(host);
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.dataset.act;
    if (act === "p-save-view" && G._posterView) savePng(G._posterView);
    if (!b.closest("#p-editor")) return;
    var d = G._posterAdmin;
    if (!d || ed.busy) return;
    if (act === "p-save") {
      ed.busy = true; b.textContent = "만드는 중…";
      savePng(d).then(function () { ed.busy = false; b.textContent = "PNG로 저장"; }, function () { reload("저장하지 못했어요"); });
    } else if (act === "p-public") {
      G.admin("admin_poster_update", { p_patch: { public: !(d.poster && d.poster.public) } }).then(function () { reload(); }, function (er) { reload("⚠️ " + er.message); });
    } else if (act === "p-tags-save") {
      G.admin("admin_poster_update", { p_patch: { hashtags: document.getElementById("p-tags").value } }).then(function () { reload("✓ 해시태그를 저장했어요"); }, function (er) { reload("⚠️ " + er.message); });
    } else if (act === "p-unset") {
      e.stopPropagation();
      ed.busy = true;
      setSlot(b.dataset.key, null).then(function () { reload("✓ 원래 사진으로 돌렸어요"); }, function (er) { reload("⚠️ " + er.message); });
    } else if (act === "p-slot") {
      var key = b.dataset.key;
      G.pickPhoto(false).then(function (f) {
        if (!f) return;
        ed.busy = true;
        ed.msg = "사진 올리는 중…";
        // 아빠는 투명 배경 PNG일 수 있어서 그대로 올림
        var up = key === "dad" && /png/i.test(f.type)
          ? (function () { var path = "m/" + G.randomName() + ".png"; return SB.upload("media", path, f, "image/png"); })()
          : G.uploadPhoto(f, key.indexOf("group:") === 0 ? 1800 : 1200);
        return up.then(function (path) { return setSlot(key, path); }).then(function () { reload("✓ 사진을 바꿨어요"); });
      }).catch(function () { reload("올리지 못했어요. 다시 해주세요."); });
    }
  }, true);
})();
