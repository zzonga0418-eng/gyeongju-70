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
  var MODE = { rank: "rank", points: "points", song: "song", letters: "count", proverb: "count", chosung: "count", ox: "points" };
  var COUNT_LABEL = { letters: "차지한 글자 수", proverb: "맞힌 속담 수", chosung: "성공 횟수" };

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
          tabBtn("run", "게임 진행") + tabBtn("score", "점수표") + tabBtn("set", "설정") +
        "</div>" +
        '<button class="a-switch' + (b.hide_rank ? " on" : "") + '" data-act="a-hide" role="switch" aria-checked="' + b.hide_rank + '">' +
          '<span class="a-switch-knob"></span><span>등수 숨기기 · ' + (b.hide_rank ? "가족 화면에서 순위가 안 보여요" : "가족 화면에 순위가 보여요") + "</span>" +
        "</button>" +
        (ui.msg ? '<p class="a-msg" role="status">' + esc(ui.msg) + "</p>" : "") +
        (ui.tab === "run" ? runHtml(b) : ui.tab === "score" ? scoreHtml(b) : setHtml(b)) +
      "</div>";
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
      "</div>";

    if (!mode) {
      html += '<p class="a-note">' + (g.kind === "dadquiz" ? "아빠 퀴즈 진행 화면은 다음 단계에서 열려요." :
        g.kind === "final" ? "결과 발표 화면은 다음 단계에서 열려요." : "이 미션은 점수 입력이 없어요.") + "</p>";
    } else {
      html += entryHtml(g, mode) + historyHtml(g);
    }
    return html + "</div>";
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
    var games = b.games.filter(function (g) { return MODE[g.kind]; });
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
      if (ui.tab === "set") G.rpc("admin_dad_progress", { p_token: G.adminToken }).then(function (d) { ui.dad = d; render(); }, fail);
      render();
    } else if (act === "a-hide") {
      G.admin("admin_set_hide_rank", { p_hide: !G.adminBoard.hide_rank }).catch(fail);
    } else if (act === "a-open") {
      ui.open = ui.open === b.dataset.game ? null : b.dataset.game; ui.msg = "";
      render();
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
    render();
  });
  G.on("view", function (v) { if (v === "admin") { ui.msg = ""; render(); } });
  render();
})();
