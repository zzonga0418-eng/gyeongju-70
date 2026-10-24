/*
 * 진행자 화면 (#admin) — 게임 진행·점수 입력·진행 안 함·순서·기록 되돌리기·점수표·등수 숨기기.
 * 숙소 게임은 진행자 폰 하나로 진행한다.
 */
(function () {
  "use strict";

  var G = window.Game;
  if (!G) return;
  var esc = G.esc;
  var host = document.getElementById("view-admin");

  var ui = { tab: "run", open: null, drafts: {}, msg: "", dad: null };
  var sw = { start: 0, acc: 0, timer: 0 };   // 스톱워치
  var STATUS = { ready: "대기", live: "진행 중", done: "완료" };
  var PLACE = { field: "현장미션", lodge: "숙소 게임", final: "마무리" };
  // 입력 방식: rank=순위 버튼, count=개수×배점, song=노래방 점수 자릿수 합, points=점수 직접
  // 글자 찾기(letters)는 차지할 때 자동으로 점수가 들어가서 직접 입력하지 않는다
  var MODE = { rank: "rank", points: "points", song: "song", proverb: "count", chosung: "count", ox: "points" };
  var COUNT_LABEL = { proverb: "맞힌 속담 수", chosung: "성공 횟수" };
  // 진행 화면(live.js)이 있는 게임
  var LIVE = { g5: "proverb", g7: "ox", g8: "chosung", dad: "dadquiz", final: "final" };

  function digitSum(n) {
    return String(Math.abs(parseInt(n, 10) || 0)).split("").reduce(function (a, d) { return a + (+d); }, 0);
  }

  function activeEntries(gameId) {
    return G.adminBoard.entries.filter(function (e) { return e.game_id === gameId && !e.reverted; });
  }

  // 열린 게임의 입력값 초안 (없으면 현재 반영된 기록으로 채움)
  function draftFor(g) {
    if (ui.drafts[g.id]) return ui.drafts[g.id];
    var d = {};
    G.adminBoard.teams.forEach(function (t) {
      var e = activeEntries(g.id).filter(function (x) { return x.team_id === t.id; })[0];
      if (!e) { d[t.id] = ""; return; }
      if (MODE[g.kind] === "rank") d[t.id] = e.rank || "";
      else if (MODE[g.kind] === "song") d[t.id] = e.raw && e.raw.song != null ? e.raw.song : "";
      else if (MODE[g.kind] === "count") d[t.id] = e.raw && e.raw.count != null ? e.raw.count : "";
      else d[t.id] = e.points;
    });
    ui.drafts[g.id] = d;
    return d;
  }

  function pointsOf(g, v) {
    if (v === "" || v == null) return null;
    var m = MODE[g.kind];
    if (m === "rank") return g.rank_points[(+v) - 1];
    if (m === "song") return digitSum(v);
    if (m === "count") return (+v) * g.unit_points;
    return +v;
  }

  // ── 그리기 ──
  function render() {
    if (G.view !== "admin") return;
    if (!G.adminToken) {
      host.innerHTML = '<div class="g-card g-stack"><span class="g-h2">진행자 화면</span><p>진행자 PIN으로 로그인해야 볼 수 있어요.</p>' +
        '<button class="g-btn g-btn-wide g-btn-dark" data-act="admin-login">진행자 로그인</button></div>';
      return;
    }
    if (!G.adminBoard) { host.innerHTML = '<p class="g-loading">불러오는 중…</p>'; return; }
    var b = G.adminBoard;
    host.innerHTML =
      '<div class="a-wrap">' +
        '<div class="a-tabs" role="tablist">' +
          tabBtn("run", "게임") + tabBtn("score", "점수표") + tabBtn("mission", "미션") + tabBtn("poster", "포스터") + tabBtn("set", "설정") +
        "</div>" +
        '<button class="a-switch' + (b.hide_rank ? " on" : "") + '" data-act="a-hide" role="switch" aria-checked="' + b.hide_rank + '">' +
          '<span class="a-switch-knob"></span><span>등수 숨기기 · ' + (b.hide_rank ? "가족 화면에서 순위가 안 보여요" : "가족 화면에 순위가 보여요") + "</span>" +
        "</button>" +
        (ui.msg ? '<p class="a-msg" role="status">' + esc(ui.msg) + "</p>" : "") +
        (ui.tab === "run" ? runHtml(b) : ui.tab === "score" ? scoreHtml(b) : ui.tab === "mission" ? missionHtml() :
          ui.tab === "poster" ? '<div id="p-editor"></div>' : setHtml(b)) +
      "</div>";
  }

  function renderAll() {
    render();
    var pe = document.getElementById("p-editor");
    if (pe && G.mountPosterEditor) G.mountPosterEditor(pe);
  }

  function tabBtn(id, label) {
    return '<button class="a-tab' + (ui.tab === id ? " on" : "") + '" role="tab" aria-selected="' + (ui.tab === id) + '" data-act="a-tab" data-tab="' + id + '">' + label + "</button>";
  }

  function runHtml(b) {
    var out = "";
    var n = 0;
    ["field", "lodge", "final"].forEach(function (place) {
      var list = b.games.filter(function (g) { return g.place === place; });
      out += '<p class="g-mono g-group">' + PLACE[place] + "</p>";
      out += list.map(function (g, i) {
        n++;
        var open = ui.open === g.id;
        var sum = activeEntries(g.id).length;
        return '<div class="a-game' + (open ? " open" : "") + (g.skipped ? " skip" : "") + (g.status === "live" ? " live" : "") + '">' +
          '<button class="a-game-row" data-act="a-open" data-game="' + g.id + '" aria-expanded="' + open + '">' +
            '<span class="g-game-n">' + ("0" + n).slice(-2) + "</span>" +
            '<span class="g-game-title">' + esc(g.title) + "</span>" +
            (sum ? '<span class="g-chip g-chip-mint">입력 ' + sum + "팀</span>" : "") +
            '<span class="g-chip">' + (g.skipped ? "진행 안 함" : STATUS[g.status]) + "</span>" +
          "</button>" +
          (open ? panelHtml(g, i === 0, i === list.length - 1) : "") +
        "</div>";
      }).join("");
    });
    return out;
  }

  function panelHtml(g, first, last) {
    var mode = MODE[g.kind];
    var html = '<div class="a-panel">' +
      '<p class="a-desc">' + esc(g.description) + "</p>" +
      '<div class="a-seg">' + ["ready", "live", "done"].map(function (s) {
        return '<button class="a-seg-btn' + (g.status === s ? " on" : "") + '" data-act="a-status" data-s="' + s + '">' + STATUS[s] + "</button>";
      }).join("") + "</div>" +
      '<div class="a-row">' +
        '<button class="a-switch sm' + (g.skipped ? " on" : "") + '" data-act="a-skip" role="switch" aria-checked="' + g.skipped + '">' +
          '<span class="a-switch-knob"></span><span>진행 안 함 (점수 집계에서 빠짐)</span></button>' +
        (g.place === "final" ? "" :
          '<span class="a-move"><button class="g-btn sm" data-act="a-move" data-dir="-1"' + (first ? " disabled" : "") + ' aria-label="위로">▲</button>' +
          '<button class="g-btn sm" data-act="a-move" data-dir="1"' + (last ? " disabled" : "") + ' aria-label="아래로">▼</button></span>') +
      "</div>" +
      (LIVE[g.id] ? '<button class="g-btn g-btn-wide g-btn-dark" data-act="a-live" data-kind="' + LIVE[g.id] + '">진행 화면 열기 ▶</button>' : "");

    if (!mode) {
      html += '<p class="a-note">' + (g.kind === "letters" ? "글자를 차지하면 글자당 " + g.unit_points + "점이 자동으로 들어가요. 반려하면 빠져요. 사진 확인은 위쪽 '미션' 탭에서 해요." :
        g.kind === "dadquiz" ? "문제는 진행 화면에서 번호를 누를 때 처음 열려요. 맞힌 팀 점수도 진행 화면에서 줘요." :
        g.kind === "final" ? "발표 전에 경품을 등록해 두세요. 점수 숫자는 발표 화면에서 처음 공개돼요." : "이 미션은 점수 입력이 없어요.") + "</p>" +
        (g.kind === "dadquiz" ? dadPhotosHtml() : g.kind === "final" ? prizesHtml() : "") +
        (g.kind === "dadquiz" ? historyHtml(g) : "");
    } else {
      html += entryHtml(g, mode) + historyHtml(g);
    }
    return html + "</div>";
  }

  // 아빠 퀴즈 9~13번 옛날 사진 (질문은 안 보이고 번호만)
  function dadPhotosHtml() {
    var has = ui.dadPhotos || [];
    var out = '<p class="a-hint">9~13번(추억 질문)에 옛날 사진을 붙일 수 있어요. 질문 내용은 보이지 않아요.</p><div class="p-slots">';
    for (var n = 9; n <= 13; n++) {
      var on = has.indexOf(n) >= 0;
      out += '<button class="p-slot' + (on ? " on" : "") + '" data-act="a-dqphoto" data-n="' + n + '"><span class="p-slot-l">Q' + n + '</span><span class="g-mono">' + (on ? "사진 있음" : "사진 넣기") + "</span>" +
        (on ? '<span class="p-slot-x" data-act="a-dqphoto-x" data-n="' + n + '" role="button">빼기</span>' : "") + "</button>";
    }
    return out + "</div>";
  }

  function prizesHtml() {
    var rv = ui.reveal;
    if (!rv) return '<p class="g-loading">경품 불러오는 중…</p>';
    return '<p class="g-card-title">경품 (' + rv.prizes.length + "개)</p>" +
      '<div class="a-prizes">' + rv.prizes.map(function (z) {
        var by = z.picked_by && G.teamById(z.picked_by);
        return '<div class="a-prize">' +
          (z.photo ? '<img src="' + esc(G.imgUrl(z.photo)) + '" alt="">' : '<span class="a-prize-ph">사진</span>') +
          '<span class="a-prize-name">' + esc(z.name) + (by ? '<span class="g-mono">→ ' + esc(by.name) + "</span>" : "") + "</span>" +
          (by ? '<button class="g-btn sm" data-act="a-prize-unpick" data-id="' + z.id + '">고른 것 취소</button>'
              : '<button class="g-btn sm" data-act="a-prize-photo" data-id="' + z.id + '">사진</button>' +
                '<button class="g-btn sm" data-act="a-prize-del" data-id="' + z.id + '">삭제</button>') +
        "</div>";
      }).join("") + "</div>" +
      '<div class="g-row"><input id="a-prize-name" class="g-input" maxlength="40" placeholder="경품 이름 (예: 한우 선물세트)">' +
        '<button class="g-btn" data-act="a-prize-add">추가</button></div>' +
      '<button class="g-btn sm" data-act="a-reveal-reset">발표 화면 처음부터</button>';
  }

  function loadSimilar() {
    G.rpc("admin_similar_view", { p_token: G.adminToken }).then(function (v) { ui.similar = v; render(); }, function () {});
  }

  function loadPanelData(g) {
    if (!g) return;
    if (g.kind === "dadquiz") G.rpc("admin_dadq_view", { p_token: G.adminToken }).then(function (d) { ui.dadPhotos = d.photos || null; render(); }, function () {});
    if (g.kind === "final") G.rpc("admin_reveal_view", { p_token: G.adminToken }).then(function (d) { ui.reveal = d; render(); }, function () {});
  }

  function entryHtml(g, mode) {
    var d = draftFor(g);
    var teams = G.adminBoard.teams;
    var html = "";
    if (mode === "rank") {
      html += '<div class="a-points">배점 ' + g.rank_points.map(function (p, i) {
        return '<label><span class="sr">' + (i + 1) + '등 점수</span><input class="g-input a-num" type="number" inputmode="numeric" data-act="a-rp" data-i="' + i + '" value="' + p + '"></label>';
      }).join("") + '<button class="g-btn sm" data-act="a-rp-save">배점 저장</button></div>';
      if (g.id === "g1" || g.id === "g4") html += stopwatchHtml();
      html += '<p class="a-hint">팀마다 순위를 눌러요. 같은 순위(동점)도 줄 수 있어요.</p>';
    } else if (mode === "count") {
      html += '<p class="a-hint">' + COUNT_LABEL[g.kind] + " × " + g.unit_points + "점 " +
        '<label class="a-unit">(1개당 <input class="g-input a-num" type="number" inputmode="numeric" data-act="a-unit" value="' + g.unit_points + '">점</label> ' +
        '<button class="g-btn sm" data-act="a-unit-save">저장</button>)</p>';
    } else if (mode === "song") {
      html += '<p class="a-hint">노래방 점수를 넣으면 자릿수 합이 점수가 돼요. (97 → 16)</p>';
    } else {
      html += '<p class="a-hint">팀별 점수를 넣어요.</p>';
    }

    html += '<div class="a-entry">' + teams.map(function (t) {
      var v = d[t.id];
      var p = pointsOf(g, v);
      var input;
      if (mode === "rank") {
        input = '<div class="a-ranks">' + [1, 2, 3, 4].map(function (r) {
          return '<button class="a-rank' + (+v === r ? " on" : "") + '" data-act="a-rank" data-team="' + t.id + '" data-r="' + r + '">' + r + "등</button>";
        }).join("") + "</div>";
      } else {
        input = '<div class="a-step">' +
          '<button class="g-btn sm" data-act="a-step" data-team="' + t.id + '" data-d="-1" aria-label="빼기">−</button>' +
          '<input class="g-input a-num" type="number" inputmode="numeric" data-act="a-val" data-team="' + t.id + '" value="' + esc(v) + '" aria-label="' + esc(t.name) + '">' +
          '<button class="g-btn sm" data-act="a-step" data-team="' + t.id + '" data-d="1" aria-label="더하기">＋</button>' +
        "</div>";
      }
      return '<div class="a-entry-row">' +
        '<span class="a-team">' + G.avatar(t, 28) + '<span>' + esc(t.name) + "</span></span>" + input +
        '<span class="a-pts" data-pts="' + t.id + '">' + (p == null ? "—" : p + "점") + "</span>" +
      "</div>";
    }).join("") + "</div>" +
    '<button class="g-btn g-btn-wide g-btn-yellow" data-act="a-save">결과 저장 · 점수 반영</button>';
    return html;
  }

  function stopwatchHtml() {
    return '<div class="a-sw"><span class="a-sw-time" id="a-sw-time">' + swText() + "</span>" +
      '<button class="g-btn sm" data-act="a-sw">' + (sw.timer ? "멈춤" : "시작") + "</button>" +
      '<button class="g-btn sm" data-act="a-sw-reset">처음으로</button></div>';
  }
  function swNow() { return sw.acc + (sw.timer ? Date.now() - sw.start : 0); }
  function swText() {
    var ms = swNow();
    return Math.floor(ms / 60000) + ":" + ("0" + Math.floor(ms / 1000) % 60).slice(-2) + "." + Math.floor(ms / 100) % 10;
  }

  function historyHtml(g) {
    var list = G.adminBoard.entries.filter(function (e) { return e.game_id === g.id; });
    if (!list.length) return "";
    return '<details class="a-hist"><summary>입력 기록 ' + list.length + "건 · 되돌리기</summary>" +
      list.map(function (e) {
        var t = G.teamById(e.team_id);
        return '<div class="a-hist-row' + (e.reverted ? " off" : "") + '">' +
          "<span>" + esc(t ? t.name : e.team_id) + "</span>" +
          '<span class="g-mono">' + e.points + "점" + (e.rank ? " · " + e.rank + "등" : "") + "</span>" +
          '<span class="g-mono">' + G.ago(e.at) + "</span>" +
          '<button class="g-btn sm" data-act="a-toggle" data-id="' + e.id + '">' + (e.reverted ? "다시 적용" : "되돌리기") + "</button>" +
        "</div>";
      }).join("") + "</details>";
  }

  function scoreHtml(b) {
    var teams = b.teams.slice().sort(function (a, c) { return c.total - a.total; });
    var games = b.games.filter(function (g) { return MODE[g.kind] || g.kind === "letters"; });
    var cell = function (g, t) {
      var s = activeEntries(g.id).filter(function (e) { return e.team_id === t.id; })
        .reduce(function (a, e) { return a + e.points; }, 0);
      return activeEntries(g.id).some(function (e) { return e.team_id === t.id; }) ? s : "·";
    };
    return '<div class="g-card a-total">' + teams.map(function (t, i) {
        var rank = 1 + teams.filter(function (x) { return x.total > t.total; }).length;
        return '<div class="a-total-row"><span class="a-rankno">' + rank + "</span>" + G.avatar(t, 32) +
          '<span class="a-total-name">' + esc(t.name) + '</span><span class="a-total-pts">' + t.total + "점</span></div>";
      }).join("") + "</div>" +
      '<p class="a-hint">진행 안 함 게임과 되돌린 기록은 합계에서 빠져요. 이 화면은 진행자에게만 보여요.</p>' +
      '<div class="a-table-wrap"><table class="a-table"><thead><tr><th>게임</th>' +
        b.teams.map(function (t) { return "<th>" + esc(t.ch) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        games.map(function (g) {
          return '<tr class="' + (g.skipped ? "skip" : "") + '"><td>' + esc(g.title) + "</td>" +
            b.teams.map(function (t) { return "<td>" + cell(g, t) + "</td>"; }).join("") + "</tr>";
        }).join("") +
      "</tbody></table></div>";
  }

  function missionHtml() {
    var m = G.mission;
    if (!m) return '<p class="g-loading">불러오는 중…</p>';
    var need = m.letters.filter(function (l) { return l.team_id && l.exif !== "ok"; }).length;
    return '<p class="a-hint">글자 찾기 ' + m.letters.filter(function (l) { return l.team_id; }).length + " / 12 차지" +
        (need ? ' · <b class="a-warn">확인 필요 ' + need + "장</b>" : "") + "</p>" +
      '<div class="a-letters">' + m.letters.map(function (l) {
        var t = l.team_id ? G.teamById(l.team_id) : null;
        if (!t) return '<div class="a-letter empty"><span class="a-letter-ch">' + esc(l.ch) + '</span><span class="a-hint">비어 있음</span></div>';
        var check = l.exif !== "ok";
        return '<div class="a-letter' + (check ? " check" : "") + '">' +
          '<a class="a-letter-img" href="' + esc(G.imgUrl(l.photo)) + '" target="_blank" rel="noopener"><img src="' + esc(G.imgUrl(l.photo)) + '" alt="' + esc(l.ch) + ' 사진" loading="lazy"></a>' +
          '<div class="a-letter-info">' +
            '<span class="a-letter-ch">' + esc(l.ch) + "</span>" +
            '<span class="a-team">' + G.avatar(t, 22) + "<span>" + esc(t.name) + "</span></span>" +
            '<span class="g-mono">' + (check ? "⚠️ 확인 필요 · " + (l.taken_at ? "촬영 " + l.taken_at.slice(5, 10).replace("-", ".") : "촬영 정보 없음") : "✓ 11.21 촬영") + "</span>" +
            '<span class="a-letter-btns">' +
              (check ? '<button class="g-btn sm" data-act="a-lok" data-i="' + l.idx + '">확인 완료</button>' : "") +
              '<button class="g-btn sm" data-act="a-reject" data-i="' + l.idx + '">반려</button>' +
            "</span>" +
          "</div></div>";
      }).join("") + "</div>" +
      '<p class="g-card-title">팀 단체사진</p>' +
      '<div class="a-groups">' + G.adminBoard.teams.map(function (t) {
        var ph = m.groups[t.id];
        return '<div class="a-group">' + (ph ? '<img src="' + esc(G.imgUrl(ph)) + '" alt="" loading="lazy">' : '<span class="a-hint">아직</span>') +
          '<span class="a-team">' + G.avatar(t, 20) + "<span>" + esc(t.name) + "</span></span></div>";
      }).join("") + "</div>" +
      '<p class="a-hint">우리 가족 사진·사진 교체는 "포스터" 탭에서 해요.</p>' +
      similarHtml();
  }

  // M2 사진 유사도: 예시 사진 · 배정 방식 · 팀 사진 · 비교 이미지
  function similarHtml() {
    var v = ui.similar;
    if (!v) return '<p class="g-loading">사진 유사도 불러오는 중…</p>';
    var exById = {};
    v.examples.forEach(function (x, i) { exById[x.id] = i + 1; });
    return '<p class="g-card-title">사진 유사도 (M2)</p>' +
      '<div class="a-seg a-seg-2">' +
        '<button class="a-seg-btn' + (v.mode === "same" ? " on" : "") + '" data-act="a-sim-mode" data-m="same">모두 같은 예시</button>' +
        '<button class="a-seg-btn' + (v.mode === "random" ? " on" : "") + '" data-act="a-sim-mode" data-m="random">팀마다 랜덤</button>' +
      "</div>" +
      '<div class="a-examples">' + v.examples.map(function (x, i) {
        return '<div class="a-example"><img src="' + esc(G.imgUrl(x.path)) + '" alt=""><span class="g-mono">예시 ' + (i + 1) + "</span>" +
          '<button class="g-btn sm" data-act="a-sim-del" data-id="' + x.id + '">삭제</button></div>';
      }).join("") +
      '<button class="a-example add" data-act="a-sim-add">＋ 예시 사진 추가</button></div>' +
      '<div class="a-groups">' + G.adminBoard.teams.map(function (t) {
        var x = v.teams[t.id] || {};
        return '<div class="a-group">' + (x.photo ? '<img src="' + esc(G.imgUrl(x.photo)) + '" alt="" loading="lazy">' : '<span class="a-hint">아직</span>') +
          '<span class="a-team">' + G.avatar(t, 20) + "<span>" + esc(t.name) + (x.example && exById[x.example] ? " · 예시 " + exById[x.example] : "") + "</span></span></div>";
      }).join("") + "</div>" +
      '<button class="g-btn g-btn-wide g-btn-yellow" data-act="a-sim-compose">비교 이미지 + 채점 프롬프트 만들기</button>' +
      '<p class="a-hint">만든 이미지를 저장해서 폰의 Claude 앱에 프롬프트와 함께 붙여넣고, 받은 점수를 게임 › 사진 유사도에 넣어요.</p>';
  }

  function setHtml(b) {
    var d = ui.dad;
    return '<div class="g-card g-stack">' +
        '<span class="g-card-title">아빠 설문 진행</span>' +
        (d ? "<p>" + d.answered.length + " / " + d.total + "개 답함" + (d.voice ? " · 목소리 녹음 있음" : "") +
          (d.last_at ? '<br><span class="g-mono">마지막 저장 ' + G.ago(d.last_at) + "</span>" : "") + "</p>" +
          '<p class="a-hint">답한 번호만 보여요. 답 내용은 진행자도 볼 수 없어요.</p>'
          : '<p class="g-loading">확인 중…</p>') +
      "</div>" +
      '<div class="g-card g-stack">' +
        '<span class="g-card-title">PIN 바꾸기</span>' +
        '<p class="a-hint">Supabase SQL Editor에서 실행: <code>select public.setup_pins(\'관리자\', \'부모님\', \'언니네\', \'오빠네\', \'우리\');</code> 바꾸면 모든 폰이 다시 로그인해야 해요.</p>' +
      "</div>" +
      '<button class="g-btn g-btn-wide g-btn-ghost" data-act="logout-admin">진행자 로그아웃</button>';
  }

  // ── 동작 ──
  function say(text) { ui.msg = text; render(); }
  function fail(e) { say("⚠️ " + (e && e.message ? e.message : "실패했어요")); }

  function currentGameOrNull() { return ui.open && G.adminBoard ? currentGame() : null; }

  function currentGame() {
    return G.adminBoard.games.filter(function (g) { return g.id === ui.open; })[0];
  }

  function saveResults() {
    var g = currentGame();
    var d = draftFor(g);
    var mode = MODE[g.kind];
    var results = [];
    var lines = [];
    G.adminBoard.teams.forEach(function (t) {
      var v = d[t.id];
      if (v === "" || v == null) return;
      var r = { team: t.id };
      if (mode === "rank") r.rank = +v;
      else if (mode === "song") { r.points = digitSum(v); r.raw = { song: +v }; }
      else if (mode === "count") { r.points = (+v) * g.unit_points; r.raw = { count: +v }; }
      else r.points = +v;
      results.push(r);
      lines.push(t.name + " " + pointsOf(g, v) + "점");
    });
    if (!results.length) return say("입력한 팀이 없어요");
    if (!window.confirm(g.title + " 결과를 반영할까요?\n\n" + lines.join("\n"))) return;
    G.admin("admin_save_results", { p_game: g.id, p_results: results }).then(function () {
      delete ui.drafts[g.id];
      say("✓ " + g.title + " 결과를 반영했어요");
    }, fail);
  }

  function updatePts(teamId) {
    var g = currentGame();
    var span = host.querySelector('[data-pts="' + teamId + '"]');
    if (span) { var p = pointsOf(g, ui.drafts[g.id][teamId]); span.textContent = p == null ? "—" : p + "점"; }
  }

  host.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.dataset.act;
    var g = ui.open && G.adminBoard ? currentGame() : null;
    if (act === "a-tab") {
      ui.tab = b.dataset.tab; ui.msg = "";
      if (ui.tab === "mission") loadSimilar();
      if (ui.tab === "set") G.rpc("admin_dad_progress", { p_token: G.adminToken }).then(function (d) { ui.dad = d; render(); }, fail);
      renderAll();
    } else if (act === "a-hide") {
      G.admin("admin_set_hide_rank", { p_hide: !G.adminBoard.hide_rank }).then(function () {
        // refresh가 끝난 뒤 스위치 상태 반영 (포스터 탭에서도)
        setTimeout(renderAll, 600);
      }, fail);
    } else if (act === "a-open") {
      ui.open = ui.open === b.dataset.game ? null : b.dataset.game; ui.msg = "";
      render();
      loadPanelData(currentGameOrNull());
    } else if (act === "a-status") {
      G.admin("admin_game_update", { p_game: g.id, p_patch: { status: b.dataset.s } }).catch(fail);
    } else if (act === "a-skip") {
      var to = !g.skipped;
      if (to && activeEntries(g.id).length && !window.confirm("이미 입력한 점수가 있어요. 진행 안 함으로 바꾸면 합계에서 빠져요. (나중에 되돌릴 수 있어요)")) return;
      G.admin("admin_game_update", { p_game: g.id, p_patch: { skipped: to } }).catch(fail);
    } else if (act === "a-move") {
      G.admin("admin_game_move", { p_game: g.id, p_dir: +b.dataset.dir }).catch(fail);
    } else if (act === "a-rank") {
      var d = draftFor(g);
      d[b.dataset.team] = +d[b.dataset.team] === +b.dataset.r ? "" : +b.dataset.r;
      render();
    } else if (act === "a-step") {
      var dd = draftFor(g);
      // 점수형은 5점씩, 개수·노래 점수는 1씩
      var step = MODE[g.kind] === "points" ? 5 : 1;
      dd[b.dataset.team] = Math.max(0, (parseInt(dd[b.dataset.team], 10) || 0) + (+b.dataset.d) * step);
      var inp = host.querySelector('[data-act="a-val"][data-team="' + b.dataset.team + '"]');
      if (inp) inp.value = dd[b.dataset.team];
      updatePts(b.dataset.team);
    } else if (act === "a-lok") {
      G.admin("admin_letter_ok", { p_idx: +b.dataset.i }).catch(fail);
    } else if (act === "a-reject") {
      var l = G.mission.letters[+b.dataset.i];
      if (!window.confirm('"' + l.ch + '" 사진을 반려할까요? 점수가 빠지고 글자가 다시 열려요.')) return;
      G.admin("admin_reject_letter", { p_idx: +b.dataset.i }).then(function () { say('"' + l.ch + '" 반려 · 다시 열렸어요'); }, fail);
    } else if (act === "a-sim-mode") {
      G.admin("admin_similar", { p_patch: { mode: b.dataset.m } }).then(loadSimilar, fail);
    } else if (act === "a-sim-del") {
      if (!window.confirm("이 예시 사진을 지울까요? 팀 배정이 다시 정해져요.")) return;
      G.admin("admin_similar", { p_patch: { "delete": +b.dataset.id } }).then(loadSimilar, fail);
    } else if (act === "a-sim-add") {
      G.pickPhoto(false).then(function (f) {
        if (!f) return;
        say("예시 사진 올리는 중…");
        return G.uploadPhoto(f, 1600).then(function (path) { return G.admin("admin_similar", { p_patch: { add: path } }); })
          .then(function () { say("✓ 예시 사진을 추가했어요"); loadSimilar(); });
      }).catch(fail);
    } else if (act === "a-sim-compose") {
      if (G.composeSimilar) G.composeSimilar(ui.similar);
    } else if (act === "a-live") {
      if (G.openLive) G.openLive(b.dataset.kind);
    } else if (act === "a-dqphoto-x") {
      e.stopPropagation();
      G.admin("admin_dadq_photo", { p_n: +b.dataset.n, p_path: null }).then(function () { loadPanelData(g); }, fail);
    } else if (act === "a-dqphoto") {
      var qn = +b.dataset.n;
      G.pickPhoto(false).then(function (f) {
        if (!f) return;
        say("사진 올리는 중…");
        return G.uploadPhoto(f, 1400).then(function (path) { return G.admin("admin_dadq_photo", { p_n: qn, p_path: path }); })
          .then(function () { say("✓ Q" + qn + " 사진을 넣었어요"); loadPanelData(g); });
      }).catch(fail);
    } else if (act === "a-prize-add") {
      var nm = document.getElementById("a-prize-name").value.trim();
      if (!nm) return say("경품 이름을 써 주세요");
      G.admin("admin_prize_save", { p_prize: { name: nm } }).then(function () { say("✓ 경품을 추가했어요"); loadPanelData(g); }, fail);
    } else if (act === "a-prize-del") {
      if (!window.confirm("이 경품을 지울까요?")) return;
      G.admin("admin_prize_save", { p_prize: { id: +b.dataset.id, "delete": true } }).then(function () { loadPanelData(g); }, fail);
    } else if (act === "a-prize-unpick") {
      G.admin("admin_prize_pick", { p_prize: +b.dataset.id, p_team: null }).then(function () { loadPanelData(g); }, fail);
    } else if (act === "a-prize-photo") {
      var pid = +b.dataset.id;
      G.pickPhoto(false).then(function (f) {
        if (!f) return;
        say("사진 올리는 중…");
        return G.uploadPhoto(f, 900).then(function (path) { return G.admin("admin_prize_save", { p_prize: { id: pid, photo: path } }); })
          .then(function () { say("✓ 경품 사진을 넣었어요"); loadPanelData(g); });
      }).catch(fail);
    } else if (act === "a-reveal-reset") {
      if (!window.confirm("발표 화면을 처음(시작 화면)으로 돌릴까요? 고른 경품은 그대로예요.")) return;
      G.admin("admin_reveal_step", { p_step: 0 }).then(function () { say("✓ 발표 화면을 처음으로 돌렸어요"); }, fail);
    } else if (act === "a-save") saveResults();
    else if (act === "a-toggle") G.admin("admin_entry_toggle", { p_entry: +b.dataset.id }).catch(fail);
    else if (act === "a-rp-save") {
      var rp = Array.prototype.map.call(host.querySelectorAll('[data-act="a-rp"]'), function (i) { return parseInt(i.value, 10) || 0; });
      G.admin("admin_game_update", { p_game: g.id, p_patch: { rank_points: rp } }).then(function () { say("✓ 배점을 저장했어요"); }, fail);
    } else if (act === "a-unit-save") {
      var u = parseInt(host.querySelector('[data-act="a-unit"]').value, 10) || 0;
      G.admin("admin_game_update", { p_game: g.id, p_patch: { unit_points: u } }).then(function () { say("✓ 배점을 저장했어요"); }, fail);
    } else if (act === "a-sw") {
      if (sw.timer) { sw.acc += Date.now() - sw.start; clearInterval(sw.timer); sw.timer = 0; }
      else {
        sw.start = Date.now();
        sw.timer = setInterval(function () { var t = document.getElementById("a-sw-time"); if (t) t.textContent = swText(); }, 100);
      }
      b.textContent = sw.timer ? "멈춤" : "시작";
    } else if (act === "a-sw-reset") {
      clearInterval(sw.timer); sw.timer = 0; sw.acc = 0;
      render();
    }
  });

  host.addEventListener("input", function (e) {
    var t = e.target;
    if (t.dataset.act === "a-val") {
      draftFor(currentGame())[t.dataset.team] = t.value === "" ? "" : parseInt(t.value, 10);
      updatePts(t.dataset.team);
    }
  });

  // 입력 중에는 4초 새로고침으로 화면을 다시 그리지 않는다 (키보드가 닫히지 않게)
  G.on("change", function () {
    var a = document.activeElement;
    if (a && host.contains(a) && a.tagName === "INPUT") return;
    // 포스터 편집은 자체적으로 다시 그린다 (4초마다 새로 그리지 않게)
    if (ui.tab === "poster" && document.getElementById("p-editor")) return;
    renderAll();
  });
  G.on("view", function (v) { if (v === "admin") { ui.msg = ""; renderAll(); } });
  renderAll();
})();
