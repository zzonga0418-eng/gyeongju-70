/*
 * 팀원 화면 — 로그인(팀 선택 + PIN), 레이스 현황판, 미션·퀴즈 안내, 내 팀 메뉴.
 * 원본 디자인: Claude Design "Family Trip App" (로그인 · 레이스 화면)
 */
(function () {
  "use strict";

  var G = window.Game;
  if (!G) return;
  var esc = G.esc;

  var el = {
    race: document.getElementById("view-race"),
    mission: document.getElementById("view-mission"),
    quiz: document.getElementById("view-quiz"),
    me: document.getElementById("topbar-me")
  };
  var login = { teams: null, team: null, pin: "", msg: "", busy: false };
  var openGames = {};
  var STATUS = { ready: "대기", live: "진행 중", done: "완료" };
  var PLACE = { field: "현장미션 · 11.21 낮", lodge: "숙소 게임 · 11.21 저녁", final: "마무리" };

  // ── 공통 ──
  function offline() {
    return '<div class="g-card g-warn">서버에 연결하지 못했어요. 인터넷을 확인해 주세요.<br>일정 탭은 그대로 볼 수 있어요.</div>';
  }

  function render() {
    renderMe();
    var v = G.view;
    if (v !== "race" && v !== "mission" && v !== "quiz") return;
    var host = el[v];
    if (!G.token() || !G.board) {
      if (!G.token()) return renderLogin(host);
      if (!G.online) host.innerHTML = offline();
      return;
    }
    if (v === "race") renderRace(host);
    else if (v === "mission") renderMission(host);
    else renderQuiz(host);
  }

  // ── 로그인 ──
  function renderLogin(host) {
    if (!login.teams) {
      host.innerHTML = '<p class="g-loading">불러오는 중…</p>';
      G.rpc("login_teams", {}).then(function (t) { login.teams = t || []; render(); }, function () {
        host.innerHTML = offline();
      });
      return;
    }
    host.innerHTML =
      '<div class="g-login">' +
        '<div class="g-login-head">' +
          '<span class="g-kicker g-kicker-sky">2026.11.20 — 11.22 · GYEONGJU</span>' +
          '<h2 class="g-h1">우리 팀을 골라요</h2>' +
          "<p>팀을 고르고 팀 PIN 4자리를 눌러주세요.</p>" +
        "</div>" +
        '<div class="g-teamgrid">' + login.teams.map(function (t) {
          var on = login.team === t.id;
          return '<button class="g-teambtn' + (on ? " on" : "") + '" data-act="pick-team" data-team="' + t.id + '"' +
            (on ? ' style="background:' + esc(t.color) + '"' : "") + ">" +
            G.avatar(t, 44) +
            '<span class="g-teambtn-name">' + esc(t.name) + "</span>" +
            '<span class="g-mono">' + esc(t.fam) + "</span>" +
          "</button>";
        }).join("") + "</div>" +
        keypadHtml(4, login.team ? "" : "disabled") +
        '<button class="g-textbtn" data-act="admin-login">진행자 로그인</button>' +
      "</div>";
  }

  function keypadHtml(max, dis) {
    var dots = "";
    for (var i = 0; i < max; i++) dots += '<span class="g-dot' + (i < login.pin.length ? " on" : "") + '"></span>';
    var keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
    return '<div class="g-pinbox">' +
      '<div class="g-dots" aria-label="PIN ' + login.pin.length + "자리 입력됨" + '">' + dots + "</div>" +
      '<p class="g-pinmsg" role="status">' + esc(login.msg) + "</p>" +
      '<div class="g-keys">' + keys.map(function (k) {
        if (!k) return "<span></span>";
        return '<button class="g-key" data-act="key" data-k="' + k + '" ' + dis + ' aria-label="' + (k === "⌫" ? "지우기" : k) + '">' + k + "</button>";
      }).join("") + "</div>" +
    "</div>";
  }

  function pressKey(k) {
    if (login.busy || !login.team) return;
    if (k === "⌫") login.pin = login.pin.slice(0, -1);
    else if (login.pin.length < 4) login.pin += k;
    login.msg = "";
    if (login.pin.length === 4) {
      login.busy = true;
      G.loginTeam(login.team, login.pin).then(function (ok) {
        login.busy = false;
        login.pin = "";
        login.msg = ok ? "" : "PIN이 달라요. 다시 눌러주세요.";
        render();
      }, function (e) {
        login.busy = false;
        login.pin = "";
        login.msg = /10분/.test(e.message) ? e.message : "연결이 안 돼요. 다시 눌러주세요.";
        render();
      });
    }
    render();
  }

  // ── 레이스 현황판 ──
  function nextGame(games) {
    var live = games.filter(function (g) { return g.status === "live"; })[0];
    if (live) return { label: "지금 진행 중", title: live.title };
    var next = games.filter(function (g) { return g.status === "ready" && !g.skipped; })[0];
    return next ? { label: "NEXT GAME", title: next.title } : { label: "NEXT GAME", title: "모두 끝났어요" };
  }

  function renderRace(host) {
    var b = G.board;
    if (!host.querySelector(".g-race")) {
      host.innerHTML =
        '<div class="g-race">' +
          '<div class="g-leader" data-part="leader"></div>' +
          '<div class="g-card g-track">' +
            '<div class="g-track-head"><span>START</span><span>점수는 결과 발표 때 공개</span><span>GOAL</span></div>' +
            '<div class="g-lane" data-part="lane"><div class="g-band"></div><div class="g-dash"></div><div class="g-flag"></div>' +
              '<p class="g-lane-hide" data-part="lanehide" hidden>🤫 순위 비공개 중</p></div>' +
          "</div>" +
          '<div class="g-two"><div class="g-mini g-mint" data-part="next"></div><div class="g-mini g-pink" data-part="progress"></div></div>' +
          '<div class="g-card g-feed" data-part="feed"></div>' +
          '<div class="g-games" data-part="games"></div>' +
        "</div>";
    }
    var part = function (n) { return host.querySelector('[data-part="' + n + '"]'); };
    var myId = b.me && b.me.team_id;

    // 1등
    var leaders = b.teams.filter(function (t) { return t.rank === 1; });
    var lead = part("leader");
    if (b.hide_rank) {
      lead.innerHTML = '<span class="g-avatar" style="width:48px;height:48px;background:#fff;font-size:24px">🤫</span>' +
        '<div><span class="g-mono">NOW LEADING · 현재 1등</span><span class="g-leader-name">지금은 순위 비공개</span></div>';
    } else if (!leaders.length) {
      lead.innerHTML = '<span class="g-avatar" style="width:48px;height:48px;background:#fff;font-size:24px">🏁</span>' +
        '<div><span class="g-mono">NOW LEADING · 현재 1등</span><span class="g-leader-name">아직 점수가 없어요</span></div>';
    } else {
      lead.innerHTML = G.avatar(leaders[0], 48) +
        '<div><span class="g-mono">👑 NOW LEADING · 현재 1등</span><span class="g-leader-name">' +
        leaders.map(function (t) { return esc(t.name); }).join(" · ") + "</span></div>";
    }

    // 트랙: 토큰은 한 번 만들고 transform만 바꿔서 부드럽게 이동
    var lane = part("lane");
    part("lanehide").hidden = !b.hide_rank;
    // 숨김 중에는 팀 순서대로 고르게 세우고 흐리게 (순위처럼 보이지 않게)
    var order = b.hide_rank ? b.teams.slice() : b.teams.slice().sort(function (a, c) { return (c.pos || 0) - (a.pos || 0); });
    order.forEach(function (t, i) {
      var tok = lane.querySelector('[data-team="' + t.id + '"]');
      if (!tok) {
        tok = document.createElement("div");
        tok.className = "g-tok";
        tok.dataset.team = t.id;
        lane.appendChild(tok);
      }
      var x = b.hide_rank ? 8 + 28 * i : 4 + 86 * (t.pos || 0);
      var low = i % 2 === 1;
      tok.style.transform = "translate(" + x + "%," + (low ? 104 : 0) + "px)";
      tok.style.zIndex = 10 - i;
      tok.classList.toggle("dim", !!b.hide_rank);
      tok.innerHTML = '<div class="g-tok-in' + (low ? " low" : "") + '">' + G.avatar(t, 42) +
        '<span class="g-tok-name">' + esc(t.name) + (t.id === myId ? " (우리)" : "") + "</span></div>";
    });

    var games = b.games;
    var nx = nextGame(games);
    part("next").innerHTML = '<span class="g-mono">' + nx.label + '</span><span class="g-mini-title">' + esc(nx.title) + "</span>";
    var counted = games.filter(function (g) { return !g.skipped; });
    var done = counted.filter(function (g) { return g.status === "done"; }).length;
    part("progress").innerHTML = '<span class="g-mono">PROGRESS</span><span class="g-mini-title">' + done + " / " + counted.length + " 완료</span>";

    part("feed").innerHTML = '<span class="g-card-title">최근 소식</span>' +
      (b.feed.length ? b.feed.map(function (f) {
        return '<div class="g-feed-row"><span>' + esc(f.text) + '</span><span class="g-mono">' + G.ago(f.at) + "</span></div>";
      }).join("") : '<div class="g-feed-row"><span>아직 소식이 없어요</span></div>');

    part("games").innerHTML = gameListHtml(games);
  }

  function gameListHtml(games) {
    var out = "";
    var n = 0;
    ["field", "lodge", "final"].forEach(function (place) {
      var list = games.filter(function (g) { return g.place === place; });
      if (!list.length) return;
      out += '<p class="g-mono g-group">' + PLACE[place] + " · " + list.length + "개</p>";
      out += list.map(function (g) {
        n++;
        var st = g.skipped ? "진행 안 함" : STATUS[g.status];
        var cls = "g-game" + (g.status === "live" && !g.skipped ? " live" : "") + (g.status === "done" || g.skipped ? " past" : "") + (g.skipped ? " skip" : "");
        return '<details class="' + cls + '" data-game="' + g.id + '"' + (openGames[g.id] ? " open" : "") + ">" +
          "<summary>" +
            '<span class="g-game-n">' + ("0" + n).slice(-2) + "</span>" +
            '<span class="g-game-title">' + esc(g.title) + "</span>" +
            '<span class="g-chip">' + st + "</span>" +
          "</summary>" +
          '<p class="g-game-desc">' + esc(g.description) + "</p>" +
        "</details>";
      }).join("");
    });
    return out;
  }

  // ── 미션 · 퀴즈 (자리) ──
  function renderMission(host) {
    var games = G.board.games.filter(function (g) { return g.place === "field"; });
    host.innerHTML =
      '<div class="g-stack">' +
        '<div class="g-intro"><span class="g-mono">MISSION · 11.21 경주 곳곳에서</span>' +
          '<span class="g-h2">현장미션</span>' +
          "<span>11월 21일 낮에 이 화면에서 사진을 올려요. 아래 미션을 미리 확인해 두세요!</span></div>" +
        '<div class="g-games">' + gameListHtml(games) + "</div>" +
      "</div>";
  }

  function renderQuiz(host) {
    host.innerHTML =
      '<div class="g-card g-quiz-wait">' +
        '<span class="g-mono">아빠 퀴즈 · 11.21 저녁</span>' +
        '<span class="g-h2">문제는 그날 공개돼요 🤫</span>' +
        "<p>칠순잔치 날 저녁, 진행자 폰으로 다 같이 풀어요.<br>엄마도 참가해요!</p>" +
      "</div>";
  }

  // ── 위쪽 내 팀 칩 + 메뉴 ──
  function renderMe() {
    var b = G.board;
    var t = b && b.me && b.me.team_id ? G.teamById(b.me.team_id) : null;
    if (t) el.me.innerHTML = '<button class="g-mechip" data-act="menu">' + G.avatar(t, 24) + esc(t.name) + "</button>";
    else if (G.adminToken) el.me.innerHTML = '<button class="g-mechip" data-act="menu">🎤 진행자</button>';
    else el.me.textContent = "🎂 칠순";
    el.me.classList.toggle("g-me-on", !!(t || G.adminToken));
  }

  function sheet(html) {
    closeSheet();
    var s = document.createElement("div");
    s.className = "g-sheet-wrap";
    s.innerHTML = '<div class="g-sheet" role="dialog" aria-modal="true">' + html + "</div>";
    s.addEventListener("click", function (e) { if (e.target === s) closeSheet(); });
    document.getElementById("app").appendChild(s);
    return s;
  }
  function closeSheet() {
    var s = document.querySelector(".g-sheet-wrap");
    if (s) s.parentNode.removeChild(s);
  }
  G.sheet = sheet;
  G.closeSheet = closeSheet;

  function openMenu() {
    var b = G.board;
    var t = b && b.me && b.me.team_id ? G.teamById(b.me.team_id) : null;
    var html = "";
    if (t) {
      html +=
        '<div class="g-sheet-head">' + G.avatar(t, 56) +
          '<div><span class="g-h2">' + esc(t.name) + '</span><span class="g-mono">' + esc(t.fam) + "</span></div></div>" +
        '<label class="g-label" for="g-name">팀 이름 (10글자까지)</label>' +
        '<div class="g-row"><input id="g-name" class="g-input" maxlength="10" value="' + esc(t.name) + '">' +
          '<button class="g-btn" data-act="save-name">저장</button></div>' +
        '<label class="g-btn g-btn-wide g-file">팀 이미지 바꾸기<input type="file" accept="image/*" data-act="team-image" hidden></label>' +
        '<p class="g-sheet-msg" role="status"></p>' +
        '<button class="g-btn g-btn-wide g-btn-ghost" data-act="logout-team">팀 로그아웃</button>';
    }
    html += G.adminToken
      ? '<div class="g-sheet-sep"></div><button class="g-btn g-btn-wide g-btn-dark" data-act="go-admin">진행자 화면 열기</button>' +
        '<button class="g-btn g-btn-wide g-btn-ghost" data-act="logout-admin">진행자 로그아웃</button>'
      : '<div class="g-sheet-sep"></div><button class="g-btn g-btn-wide g-btn-ghost" data-act="admin-login">진행자 로그인</button>';
    html += '<button class="g-textbtn" data-act="close-sheet">닫기</button>';
    sheet(html);
  }

  // 진행자 PIN (4~8자리) 키패드
  var adminPin = "";
  function openAdminLogin(msg) {
    var dots = "";
    for (var i = 0; i < 8; i++) dots += '<span class="g-dot sm' + (i < adminPin.length ? " on" : "") + '"></span>';
    var keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"];
    sheet(
      '<span class="g-h2">진행자 로그인</span>' +
      "<p>진행자 PIN을 누르고 ✓를 눌러요.</p>" +
      '<div class="g-pinbox"><div class="g-dots">' + dots + "</div>" +
      '<p class="g-pinmsg" role="status">' + esc(msg || "") + "</p>" +
      '<div class="g-keys">' + keys.map(function (k) {
        return '<button class="g-key' + (k === "✓" ? " ok" : "") + '" data-act="akey" data-k="' + k + '" aria-label="' +
          (k === "⌫" ? "지우기" : k === "✓" ? "확인" : k) + '">' + k + "</button>";
      }).join("") + "</div></div>" +
      '<button class="g-textbtn" data-act="close-sheet">닫기</button>'
    );
  }
  function pressAdminKey(k) {
    if (k === "⌫") adminPin = adminPin.slice(0, -1);
    else if (k === "✓") {
      if (adminPin.length < 4) return openAdminLogin("4자리 이상 눌러주세요");
      var pin = adminPin;
      adminPin = "";
      G.loginAdmin(pin).then(function (ok) {
        if (!ok) return openAdminLogin("PIN이 달라요");
        closeSheet();
        location.hash = "#admin";
      }, function (e) { openAdminLogin(/10분/.test(e.message) ? e.message : "연결이 안 돼요"); });
      return;
    } else if (adminPin.length < 8) adminPin += k;
    openAdminLogin();
  }

  // 팀 이미지: 가운데를 정사각형으로 잘라 480px JPEG로 줄여서 올림
  function squareJpeg(file, size) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var s = Math.min(img.naturalWidth, img.naturalHeight);
        var c = document.createElement("canvas");
        c.width = c.height = size;
        c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error("변환 실패")); }, "image/jpeg", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("사진을 못 읽었어요")); };
      img.src = url;
    });
  }

  function sheetMsg(text) {
    var m = document.querySelector(".g-sheet-msg");
    if (m) m.textContent = text;
  }

  function uploadTeamImage(file) {
    sheetMsg("올리는 중…");
    var path = "team/" + G.randomName() + ".jpg";
    squareJpeg(file, 480).then(function (blob) {
      return SB.upload("media", path, blob, "image/jpeg");
    }).then(function () {
      return G.rpc("my_team_image", { p_token: G.teamToken, p_path: path });
    }).then(function () {
      return G.refresh();
    }).then(openMenu, function () { sheetMsg("올리지 못했어요. 다시 해주세요."); });
  }

  // ── 이벤트 ──
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b || !b.closest("#app")) return;
    var act = b.dataset.act;
    if (act === "pick-team") { login.team = b.dataset.team; login.pin = ""; login.msg = ""; render(); }
    else if (act === "key") pressKey(b.dataset.k);
    else if (act === "admin-login") { adminPin = ""; openAdminLogin(); }
    else if (act === "akey") pressAdminKey(b.dataset.k);
    else if (act === "menu") openMenu();
    else if (act === "close-sheet") closeSheet();
    else if (act === "go-admin") { closeSheet(); location.hash = "#admin"; }
    else if (act === "logout-team") { closeSheet(); G.logoutTeam(); }
    else if (act === "logout-admin") { closeSheet(); G.logoutAdmin(); }
    else if (act === "save-name") {
      var name = document.getElementById("g-name").value;
      sheetMsg("저장하는 중…");
      G.rpc("my_team_update", { p_token: G.teamToken, p_name: name }).then(function () { return G.refresh(); })
        .then(openMenu, function (err) { sheetMsg(/글자/.test(err.message) ? err.message : "저장하지 못했어요"); });
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.dataset && e.target.dataset.act === "team-image" && e.target.files[0]) uploadTeamImage(e.target.files[0]);
  });
  // 게임 설명 펼침 상태 기억 (새로고침 때 접히지 않게)
  document.addEventListener("toggle", function (e) {
    var d = e.target;
    if (d.dataset && d.dataset.game) openGames[d.dataset.game] = d.open;
  }, true);

  G.on("change", render);
  G.on("view", render);
  G.on("online", render);
  render();
  if (G.token()) G.refresh();
})();
