/*
 * 미션 탭 — M1 글자 찾기(선착순, 카메라 바로 열기, EXIF 날짜 확인) + 팀 단체사진.
 * 원본 디자인: Claude Design "Family Trip App" (현장미션 화면)
 */
(function () {
  "use strict";

  var G = window.Game;
  if (!G) return;
  var esc = G.esc;
  var st = { sel: null, busy: false, msg: "", kind: "" };

  function teamOf(id) { return id ? G.teamById(id) : null; }

  G.renderMission = function (host) {
    var m = G.mission;
    if (!m) { host.innerHTML = '<p class="g-loading">불러오는 중…</p>'; return; }
    var myId = m.me;
    var me = teamOf(myId);
    var letters = m.letters;
    if (st.sel != null && letters[st.sel].team_id) st.sel = null;   // 그새 다른 팀이 차지함
    var mine = letters.filter(function (l) { return l.team_id && l.team_id === myId; }).length;
    var open = letters.filter(function (l) { return !l.team_id; }).length;

    var tiles = letters.map(function (l) {
      var o = teamOf(l.team_id);
      var isMine = l.team_id && l.team_id === myId;
      var sel = st.sel === l.idx;
      var cls = "m-tile" + (l.team_id ? (isMine ? " mine" : " taken") : "") + (sel ? " sel" : "");
      var bg = isMine && me ? ' style="background:' + esc(me.color) + '"' : "";
      var tag = l.team_id
        ? '<span class="m-tag" style="background:' + (isMine ? "#fff" : esc(o ? o.color : "#fff")) + '">' + (isMine ? "우리 팀" : esc(o ? o.name : "")) + "</span>"
        : '<span class="m-tag empty">' + (sel ? "선택" : "비어 있음") + "</span>";
      return '<button class="' + cls + '"' + bg + ' data-act="m-pick" data-i="' + l.idx + '"' + (l.team_id ? " disabled" : "") +
        ' aria-pressed="' + sel + '"><span class="m-ch">' + esc(l.ch) + "</span>" + tag + "</button>";
    }).join("");

    var canShoot = st.sel != null && myId && !st.busy;
    var shootLabel = st.busy ? "올리는 중…" : !myId ? "팀으로 로그인하면 올릴 수 있어요"
      : st.sel == null ? "빈 글자를 먼저 골라요" : '"' + letters[st.sel].ch + '" 카메라로 찍기';
    var group = myId && m.groups[myId];

    host.innerHTML =
      '<div class="g-stack">' +
        '<div class="g-intro"><span class="g-mono">MISSION 01 · 11.21 경주 곳곳에서</span>' +
          '<span class="g-h2">글자를 찾아 사진으로 찍어요</span>' +
          "<span>먼저 올린 팀이 그 글자를 차지해요. 글자당 " + m.unit + "점. ♥는 하트 모양 물건이에요.</span></div>" +
        '<div class="m-grid">' + tiles + "</div>" +
        '<div class="m-stat"><span>' + (myId ? "우리 팀 " + mine + "글자 차지" : "") + '</span><span class="g-mono">남은 글자 ' + open + "</span></div>" +
        '<button class="m-shoot' + (canShoot ? " on" : "") + '" data-act="m-shoot"' + (canShoot ? "" : " disabled") + ">" + esc(shootLabel) + "</button>" +
        '<p class="m-note">카메라가 바로 열려요. 촬영 날짜가 11.21이 아니면 진행자가 한 번 더 확인해요.</p>' +
        (st.msg ? '<p class="m-msg ' + st.kind + '" role="status">' + esc(st.msg) + "</p>" : "") +

        '<div class="g-card m-card">' +
          '<span class="g-mono">MISSION 02 · 사진 유사도</span>' +
          '<span class="g-h2">예시 사진과 똑같이 찍기</span>' +
          '<div class="m-example">예시 사진은 진행자가 곧 올려요</div>' +
        "</div>" +

        (myId ? '<div class="g-card m-card m-group">' +
          '<span class="g-mono">MISSION 03 · 팀 단체사진</span>' +
          (group ? '<img class="m-group-img" src="' + esc(G.imgUrl(group)) + '" alt="우리 팀 단체사진">' : "") +
          '<button class="g-btn g-btn-wide m-pinkbtn" data-act="m-group"' + (st.busy ? " disabled" : "") + ">" +
            (group ? "단체사진 다시 올리기" : "팀 단체사진 올리기 · 1장") + "</button>" +
          '<p class="m-note">콜라주 포스터에 들어가요. 다시 올리면 바뀌어요.</p>' +
        "</div>" : "") +

        (m.poster_public ? '<button class="g-btn g-btn-wide g-btn-dark" data-act="poster-view">콜라주 포스터 보기</button>' : "") +
      "</div>";
  };

  function say(msg, kind) {
    st.msg = msg;
    st.kind = kind || "";
    G.emit("change");
  }

  function shoot() {
    var idx = st.sel;
    var ch = G.mission.letters[idx].ch;
    var file;
    G.pickPhoto(true).then(function (f) {
      if (!f) return null;
      file = f;
      st.busy = true;
      say('"' + ch + '" 사진 올리는 중…');
      return G.readTakenAt(file).then(function (taken) {
        return G.uploadPhoto(file, 1600).then(function (path) {
          return G.rpc("claim_letter", {
            p_token: G.teamToken, p_idx: idx, p_path: path,
            p_taken_at: taken, p_exif: G.isTripDay(taken) ? "ok" : "check"
          });
        });
      }).then(function () {
        st.busy = false;
        st.sel = null;
        say('🎉 "' + ch + '" 차지! 글자를 찾았어요', "ok");
        G.refresh();
      });
    }).catch(function (e) {
      st.busy = false;
      if (/먼저 차지/.test(e.message)) { st.sel = null; say(e.message, "warn"); G.refresh(); }
      else say("올리지 못했어요. 인터넷을 확인하고 다시 해주세요.", "warn");
    });
  }

  function groupPhoto() {
    G.pickPhoto(false).then(function (f) {
      if (!f) return;
      st.busy = true;
      say("단체사진 올리는 중…");
      return G.uploadPhoto(f, 1800).then(function (path) {
        return G.rpc("set_group_photo", { p_token: G.teamToken, p_path: path });
      }).then(function () {
        st.busy = false;
        say("✓ 단체사진을 올렸어요", "ok");
        G.refresh();
      });
    }).catch(function () {
      st.busy = false;
      say("올리지 못했어요. 다시 해주세요.", "warn");
    });
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b || !b.closest("#view-mission")) return;
    var act = b.dataset.act;
    if (act === "m-pick") {
      var i = +b.dataset.i;
      st.sel = st.sel === i ? null : i;
      st.msg = "";
      G.emit("change");
    } else if (act === "m-shoot" && st.sel != null && !st.busy) shoot();
    else if (act === "m-group" && !st.busy) groupPhoto();
    else if (act === "poster-view" && G.openPoster) G.openPoster(false);
  });
})();
