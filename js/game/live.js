/*
 * 진행 화면 (진행자 폰 하나로 숙소 게임 진행) — 전체 화면으로 띄워 가족에게 보여준다.
 *   속담 맞추기 · O/X 퀴즈 · 초성 게임 · 아빠 퀴즈 · 결과 발표 + 경품 고르기
 * 정답이 있는 내용은 그 단계가 될 때 서버에서 받아온다. 원본 디자인: Claude Design "Family Trip App"(퀴즈·발표 화면)
 */
(function () {
  "use strict";

  var G = window.Game;
  if (!G) return;
  var esc = G.esc;
  var lv = null;          // { el, game, st, timers[] }

  // ── 효과음 (Web Audio로 만듦, 음소거 기억) ──
  var Snd = {
    ctx: null,
    muted: (function () { try { return localStorage.getItem("g-mute") === "1"; } catch (e) { return false; } })(),
    ac: function () {
      if (!this.ctx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; this.ctx = new C(); }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    },
    tone: function (f, dur, type, at, vol) {
      if (this.muted) return;
      var a = this.ac(); if (!a) return;
      var t = a.currentTime + (at || 0), o = a.createOscillator(), g = a.createGain();
      o.type = type || "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(vol || .18, t);
      g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + .02);
    },
    pop: function () { this.tone(660, .12, "triangle"); this.tone(990, .1, "triangle", .06); },
    tick: function () { this.tone(880, .06, "square", 0, .08); },
    buzz: function () { this.tone(140, .5, "sawtooth", 0, .15); },
    good: function () { [523, 659, 784].forEach(function (f, i) { Snd.tone(f, .18, "triangle", i * .08); }); },
    drum: function (sec) { for (var i = 0; i < sec * 14; i++) this.tone(90 + (i % 2) * 20, .06, "triangle", i / 14, .12 + i / (sec * 14) * .1); },
    fanfare: function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { Snd.tone(f, i === 5 ? .6 : .16, "triangle", i * .13, .2); }); },
    toggle: function () {
      this.muted = !this.muted;
      try { localStorage.setItem("g-mute", this.muted ? "1" : "0"); } catch (e) { /* 무시 */ }
    }
  };
  G.Snd = Snd;

  // ── 화면 틀 ──
  function open(game, title) {
    close();
    var el = document.createElement("div");
    el.className = "lv";
    el.innerHTML =
      '<div class="lv-top"><span class="lv-title">' + esc(title) + "</span>" +
        '<button class="lv-mini" data-act="lv-mute" aria-label="효과음 켜기/끄기">' + (Snd.muted ? "🔇" : "🔊") + "</button>" +
        '<button class="lv-mini" data-act="lv-close">닫기</button></div>' +
      '<div class="lv-body"></div>';
    document.getElementById("app").appendChild(el);
    lv = { el: el, game: game, st: {}, timers: [] };
    el.addEventListener("click", onClick);
    return lv;
  }
  function close() {
    if (!lv) return;
    lv.timers.forEach(clearInterval);
    lv.el.parentNode.removeChild(lv.el);
    lv = null;
    G.refresh();
  }
  function body() { return lv.el.querySelector(".lv-body"); }
  function paint(html) { body().innerHTML = html; }
  function stopTimers() { lv.timers.forEach(clearInterval); lv.timers = []; }
  function fail(e) { var m = lv && lv.el.querySelector(".lv-err"); if (m) m.textContent = "⚠️ " + (e && e.message || "실패했어요"); }
  function err() { return '<p class="lv-err" role="status"></p>'; }
  function call(name, args) {
    var a = { p_token: G.adminToken }; for (var k in args) a[k] = args[k];
    return G.rpc(name, a);
  }
  function game(id) { return (G.adminBoard ? G.adminBoard.games : []).filter(function (g) { return g.id === id; })[0] || {}; }
  function teams() { return G.adminBoard ? G.adminBoard.teams : []; }

  // 큰 카운트다운: sec초 동안 el 숫자 갱신, 끝나면 done()
  function countdown(sec, elId, done) {
    var end = Date.now() + sec * 1000, last = -1;
    var t = setInterval(function () {
      var left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      var el = document.getElementById(elId);
      if (el) { el.textContent = left; el.classList.toggle("hurry", left <= 3); }
      if (left !== last && left <= 3 && left > 0) Snd.tick();
      last = left;
      if (left <= 0) { clearInterval(t); done(); }
    }, 100);
    lv.timers.push(t);
  }

  function teamButtons(sel, extra) {
    return '<div class="lv-teams">' + teams().map(function (t) {
      return '<button class="lv-team' + (sel === t.id ? " on" : "") + '" data-act="lv-team" data-team="' + t.id + '"' +
        (sel === t.id ? ' style="background:' + esc(t.color) + '"' : "") + ">" +
        G.avatar(t, 30) + '<span class="lv-team-name">' + esc(t.name) + "</span>" +
        (extra ? '<span class="g-mono">' + extra(t) + "</span>" : "") + "</button>";
    }).join("") + "</div>";
  }

  // ═════ 속담 맞추기 ═════
  function proverb() {
    var s = lv.st;
    if (!s.phase) { s.phase = "pick"; s.secs = 120; s.status = null; }
    if (s.phase === "pick") {
      call("admin_proverb_status", {}).then(function (st) { s.status = st; if (lv && s.phase === "pick") proverbPaint(); }, fail);
    }
    proverbPaint();
  }
  function proverbPaint() {
    var s = lv.st, unit = game("g5").unit_points || 4;
    if (s.phase === "pick") {
      var stt = s.status;
      paint(
        '<p class="lv-lead">설명할 팀을 골라요. 팀당 10개, 맞힌 개수 × ' + unit + "점" + (stt ? " · 남은 속담 " + stt.left + "개" : "") + "</p>" +
        teamButtons(s.team, function (t) {
          var x = stt && stt.teams[t.id];
          return x ? (x.done >= 10 ? "완료 · " + x.correct + "개" : x.done ? x.done + "/10 · 맞힘 " + x.correct : "아직") : "";
        }) +
        '<p class="lv-lead">제한시간</p><div class="lv-seg">' + [60, 90, 120, 180].map(function (v) {
          return '<button class="lv-seg-btn' + (s.secs === v ? " on" : "") + '" data-act="pv-secs" data-v="' + v + '">' + (v / 60 >= 1 && v % 60 === 0 ? v / 60 + "분" : v + "초") + "</button>";
        }).join("") + "</div>" +
        '<button class="lv-big" data-act="pv-ready"' + (s.team ? "" : " disabled") + ">시작 준비</button>" +
        (s.team && stt && stt.teams[s.team] && stt.teams[s.team].drawn ? '<button class="lv-link" data-act="pv-reset">이 팀 처음부터 다시 하기</button>' : "") +
        err());
    } else if (s.phase === "ready") {
      paint('<div class="lv-center"><span class="lv-emoji">📱</span><p class="lv-say">폰을 <b>설명하는 사람</b>에게<br>건네주세요</p>' +
        '<p class="lv-lead">맞히는 사람은 화면을 보면 안 돼요!</p>' +
        '<button class="lv-big lv-yellow" data-act="pv-start">시작!</button></div>' + err());
    } else if (s.phase === "play") {
      paint('<div class="pv-head"><span class="lv-clock" id="pv-clock">' + s.left + '</span><span class="g-mono">' + s.cur.no + " / 10 · 맞힘 " + s.correct + "</span></div>" +
        '<div class="pv-card"><span class="pv-text">' + esc(s.cur.text) + "</span></div>" +
        '<div class="lv-two"><button class="lv-big lv-white" data-act="pv-mark" data-r="pass">패스 →</button>' +
        '<button class="lv-big lv-mint" data-act="pv-mark" data-r="correct">정답 ✓</button></div>' + err());
    } else {
      paint('<div class="lv-center"><span class="lv-emoji">' + (s.timeout ? "⏰" : "🎉") + '</span><p class="lv-say">' + (s.timeout ? "시간 끝!" : "10개 끝!") + "</p>" +
        '<p class="lv-score">맞힌 개수 <b>' + s.correct + "</b>개 → " + s.correct * unit + "점</p>" +
        '<button class="lv-big lv-yellow" data-act="pv-save">점수 반영</button>' +
        '<button class="lv-link" data-act="pv-back">팀 고르기로</button></div>' + err());
    }
  }
  function pvNext() {
    var s = lv.st;
    return call("admin_proverb_next", { p_team: s.team }).then(function (p) { s.cur = p; proverbPaint(); });
  }
  function pvEnd(timeout) {
    var s = lv.st;
    stopTimers();
    s.timeout = timeout;
    s.phase = "end";
    if (timeout) Snd.buzz(); else Snd.fanfare();
    proverbPaint();
  }

  // ═════ O/X 구호 게임 ═════
  // 진행자 폰이 "오!" "엑스!"를 소리로 외친다. O·X는 무작위(연속으로 같은 것도 나옴),
  // 첫 구호 뒤에만 5초, 그다음부터는 진행자가 고른 간격. 탈락자가 나오면 진행자가 멈춘다.
  var OX_FIRST = 5;
  var OX_GAPS = [1.5, 2, 2.5, 3, 4];
  var Voice = {
    ok: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
    say: function (text) {
      if (!this.ok) return;
      try {
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = "ko-KR"; u.rate = 1.05; u.volume = 1;
        var v = speechSynthesis.getVoices().filter(function (x) { return /^ko/i.test(x.lang); })[0];
        if (v) u.voice = v;
        speechSynthesis.speak(u);
      } catch (e) { /* 음성이 안 되는 브라우저 → 화면·효과음만 */ }
    }
  };
  function oxGap(n) { return n <= 1 ? OX_FIRST : lv.st.gap; }
  function ox() {
    var s = lv.st;
    if (s.calls == null) { s.calls = 0; s.running = false; s.last = null; s.history = []; s.gap = 2; }
    oxPaint();
  }
  function oxPaint() {
    var s = lv.st;
    var hist = s.history.slice(-10).map(function (v) { return v === "o" ? "O" : "X"; }).join(" ");
    paint(
      '<p class="lv-lead">진행자 폰이 <b>"오!"</b> <b>"엑스!"</b>를 외쳐요. 구호에 맞는 쪽으로 이동! 틀린 쪽에 있으면 탈락. 첫 구호 뒤에만 5초, 그다음은 아래 간격으로 외쳐요.</p>' +
      '<div class="lv-seg">' + OX_GAPS.map(function (v) {
        return '<button class="lv-seg-btn' + (s.gap === v ? " on" : "") + '" data-act="ox-gap" data-v="' + v + '">' + v + "초</button>";
      }).join("") + "</div>" +
      '<div class="ox-call ' + (s.last || "") + '" id="ox-call"><span class="ox-big">' + (s.last === "o" ? "O" : s.last === "x" ? "X" : "?") + "</span></div>" +
      '<div class="pv-head"><span class="g-mono">구호 ' + s.calls + "번 · " + (s.running ? "다음까지 " + oxGap(s.calls) + "초" : "멈춤") + '</span><span class="g-mono">' + hist + "</span></div>" +
      (s.running
        ? '<button class="lv-big lv-dark" data-act="ox-stop">멈춤 · 탈락자 나왔어요!</button>'
        : '<div class="lv-two"><button class="lv-big lv-white" data-act="ox-reset"' + (s.calls ? "" : " disabled") + ">처음부터</button>" +
          '<button class="lv-big lv-yellow" data-act="ox-go">' + (s.calls ? "이어서 계속 ▶" : "시작 ▶") + "</button></div>") +
      (Voice.ok ? "" : '<p class="lv-note">⚠️ 이 브라우저는 음성을 지원하지 않아요. 크롬으로 열면 소리로 외쳐요. 지금은 화면과 효과음으로만 알려줘요.</p>') +
      '<p class="lv-note">팀별 결과(살아남은 인원)는 진행자 화면 › 게임 › O/X에서 점수로 넣어요.</p>' + err());
  }
  function oxCall() {
    var s = lv && lv.st;
    if (!s || !s.running) return;
    var v = Math.random() < .5 ? "o" : "x";
    s.last = v; s.calls++; s.history.push(v);
    Voice.say(v === "o" ? "오!" : "엑스!");
    Snd.tone(v === "o" ? 880 : 330, .25, "square", 0, .12);
    oxPaint();
    lv.timers.push(setTimeout(oxCall, oxGap(s.calls) * 1000));
  }
  function oxStart() {
    var s = lv.st;
    s.running = true;
    Voice.say("준비!");          // 버튼을 누른 순간 음성을 깨워 둔다 (아이폰은 이렇게 해야 소리가 남)
    oxPaint();
    var el = document.querySelector("#ox-call .ox-big");
    if (el) el.textContent = "준비";
    lv.timers.push(setTimeout(oxCall, 2000));
  }

  // ═════ 초성 게임 ═════
  // 진행자가 자음을 뽑으면 먼저 손 든 팀이 도전 → 10초 안에 단어 5개. 실패하면 다른 팀이 같은 자음에 도전할 수 있다.
  function chosung() {
    var s = lv.st;
    if (!s.tally) { s.tally = {}; s.phase = "idle"; }
    chPaint();
  }
  function chPaint() {
    var s = lv.st, unit = game("g8").unit_points || 10;
    var tally = '<div class="ch-tally">' + teams().map(function (t) {
      return '<span class="ch-tally-item">' + G.avatar(t, 22) + "<span>" + esc(t.name) + '</span><b class="g-mono">' + (s.tally[t.id] || 0) + "</b></span>";
    }).join("") + "</div>";
    if (s.phase === "idle") {
      paint('<p class="lv-lead">자음을 뽑으면 <b>먼저 손 든 팀</b>이 도전해요. 그 자음으로 시작하는 단어 5개를 10초 안에! 성공 1번에 ' + unit + "점</p>" +
        (s.lastEx ? '<div class="ch-ex"><span class="g-mono">지난 자음 ' + esc(s.lastEx.initials) + " 예시</span><span>" + s.lastEx.words.map(esc).join(" · ") + "</span></div>" : "") +
        '<button class="lv-big lv-yellow" data-act="ch-draw">자음 뽑기</button>' +
        '<p class="lv-lead">팀별 성공</p>' + tally +
        '<button class="lv-big lv-white" data-act="ch-save">지금까지 점수 반영</button>' + err());
    } else if (s.phase === "shown") {
      paint('<div class="lv-center"><span class="ch-init">' + esc(s.cur.initials) + "</span>" +
        '<p class="lv-say">손 든 팀을 눌러요!</p></div>' +
        '<div class="lv-teams">' + teams().map(function (t) {
          var out = s.failed.indexOf(t.id) >= 0;
          return '<button class="lv-team" data-act="ch-try" data-team="' + t.id + '"' + (out ? " disabled" : "") + ">" + G.avatar(t, 30) +
            '<span class="lv-team-name">' + esc(t.name) + "</span>" + (out ? '<span class="g-mono">실패</span>' : "") + "</button>";
        }).join("") + "</div>" +
        '<button class="lv-link" data-act="ch-skip">아무도 못 함 · 넘어가기</button>' + err());
    } else if (s.phase === "play") {
      var tp = G.teamById(s.team);
      paint('<div class="lv-center"><span class="ch-init">' + esc(s.cur.initials) + "</span>" +
        '<p class="lv-say">' + esc(tp ? tp.name : "") + " 도전!</p>" +
        '<p class="lv-lead">이 자음으로 시작하는 단어 5개!</p><span class="lv-clock" id="ch-clock">10</span></div>' + err());
    } else {
      var tj = G.teamById(s.team);
      paint('<div class="lv-center"><span class="ch-init sm">' + esc(s.cur.initials) + "</span>" +
        '<p class="lv-say">땡! ' + esc(tj ? tj.name : "") + "</p>" +
        '<div class="lv-two"><button class="lv-big lv-white" data-act="ch-judge" data-ok="0">실패 ✗</button>' +
        '<button class="lv-big lv-mint" data-act="ch-judge" data-ok="1">성공 ✓</button></div></div>' + err());
    }
  }
  // 한 자음이 끝나면(성공·넘어가기) 예시 단어를 받아 둔다 — 다음 화면에서 보여줌
  function chFinish() {
    var s = lv.st, c = s.cur;
    s.phase = "idle";
    s.lastEx = null;
    chPaint();
    var wait = Math.max(0, new Date(c.drawn_at).getTime() + 10500 - Date.now());
    setTimeout(function () {
      call("admin_chosung_examples", { p_id: c.id }).then(function (ex) {
        if (lv && s.phase === "idle") { s.lastEx = { initials: c.initials, words: ex }; chPaint(); }
      }, function () {});
    }, wait);
  }

  // ═════ 아빠 퀴즈 ═════
  var STAGES = ["주관식", "힌트 1", "힌트 2", "보기 4개", "정답"];
  function dad() {
    call("admin_dadq_view", {}).then(function (d) { if (!lv) return; lv.st.d = d; dadPaint(); }, fail);
  }
  function dadPaint() {
    var s = lv.st, d = s.d;
    if (!d) return;
    if (d.n == null) {
      var btns = "";
      for (var i = 1; i <= d.total; i++) btns += '<button class="dq-num' + (i === 15 ? " letter" : "") + '" data-act="dq-go" data-n="' + i + '">' + (i === 15 ? "편지" : "Q" + i) + "</button>";
      paint('<p class="lv-lead">문제 번호를 누르면 그때 질문이 열려요. (힌트·보기 준비 ' + d.ready + " / " + (d.total - 1) + ")</p>" +
        '<div class="dq-nums">' + btns + "</div>" + err());
      return;
    }
    if (d.n === 15) return dadLetter(d);
    var pts = d.points || [40, 30, 20, 10];
    var stage = d.stage;
    var bar = '<div class="dq-stages">' + STAGES.map(function (label, i) {
      return '<div class="dq-stage' + (i < stage ? " past" : i === stage ? " now" : "") + '"><span class="dq-bar"></span>' +
        "<span>" + label + '</span><span class="g-mono">' + (i < 4 ? pts[i] + "점" : "—") + "</span></div>";
    }).join("") + "</div>";
    var hints = [d.hint1, d.hint2].map(function (h, i) {
      return h ? '<div class="dq-hint"><span class="g-mono">힌트 ' + (i + 1) + "</span><span>" + esc(h) + "</span></div>" : "";
    }).join("");
    var picksByOpt = {};
    Object.keys(d.picks || {}).forEach(function (tid) { (picksByOpt[d.picks[tid]] = picksByOpt[d.picks[tid]] || []).push(tid); });
    var opts = d.options ? '<div class="dq-opts">' + d.options.map(function (o, i) {
      var right = d.correct === i;
      return '<button class="dq-opt' + (right ? " right" : "") + '" data-act="dq-opt" data-i="' + i + '">' +
        '<span class="g-mono">' + (i + 1) + "</span><span>" + esc(o) + "</span>" +
        '<span class="dq-tags">' + (picksByOpt[i] || []).map(function (tid) { var t = G.teamById(tid); return t ? G.avatar(t, 20) : ""; }).join("") + "</span></button>";
    }).join("") + "</div>" : "";
    var answer = stage >= 4 ? '<div class="dq-answer"><span class="g-mono">정답 공개</span><span class="dq-short">' + esc(d.short || "") + "</span>" +
      (d.answer ? '<span class="dq-dad">아빠의 답 · ' + esc(d.answer) + "</span>" : "") + "</div>" : "";
    var now = stage < 4 ? pts[Math.min(stage, 3)] : pts[3];
    var judge = '<p class="lv-lead">' + (stage === 3 ? "팀을 누른 뒤 고른 보기를 눌러요 (판정은 정답 공개 때)" : "맞힌 팀을 눌러요 · 지금 맞히면 " + now + "점") + "</p>" +
      '<div class="lv-teams">' + teams().map(function (t) {
        var sc = d.scored && d.scored[t.id];
        var sel = s.pickTeam === t.id;
        return '<button class="lv-team' + (sc ? " scored" : "") + (sel ? " on" : "") + '" data-act="dq-team" data-team="' + t.id + '"' +
          (sc || sel ? ' style="background:' + esc(t.color) + '"' : "") + ">" + G.avatar(t, 26) +
          '<span class="lv-team-name">' + esc(t.name) + (t.id === "p" ? " · 엄마만" : "") + "</span>" +
          '<span class="g-mono">' + (sc ? "✓ " + sc.points + "점" : "") + "</span></button>";
      }).join("") + "</div>";
    var next = stage < 4
      ? '<button class="lv-big lv-dark" data-act="dq-stage">' + ["힌트 1 열기", "힌트 2 열기", "보기 4개 공개", "정답 공개"][stage] + "</button>"
      : '<div class="lv-two"><button class="lv-big lv-white" data-act="dq-list">문제 목록</button>' +
        '<button class="lv-big lv-dark" data-act="dq-go" data-n="' + (d.n + 1) + '">' + (d.n + 1 === 15 ? "마지막 편지 ▶" : "다음 문제 ▶") + "</button></div>";
    paint(bar +
      '<div class="dq-card"><span class="g-mono">아빠 퀴즈 · Q' + ("0" + d.n).slice(-2) + " / " + (d.total - 1) + " · " + esc(d.category) + "</span>" +
        '<span class="dq-q">' + esc(d.question) + "</span>" +
        '<span class="g-mono">지금 맞히면 ' + (stage < 4 ? pts[Math.min(stage, 3)] + "점" : "—") + "</span></div>" +
      (d.photo ? '<img class="dq-photo" src="' + esc(G.imgUrl(d.photo)) + '" alt="옛날 사진">' : "") +
      hints + opts + answer + judge + next + err());
  }

  function dadLetter(d) {
    if (d.stage < 4) {
      paint('<div class="lv-center"><span class="g-mono">마지막 · 퀴즈가 아니에요</span>' +
        '<p class="lv-say">아빠가 가족에게<br>하고 싶은 한마디</p>' +
        '<button class="lv-big lv-pink" data-act="dq-letter">편지 열기 💌</button>' +
        '<button class="lv-link" data-act="dq-list">문제 목록</button></div>' + err());
      return;
    }
    paint('<div class="dq-letter-card"><span class="g-mono">아빠의 편지</span><p class="dq-letter-text" id="dq-type"></p></div>' +
      (d.voice ? '<button class="lv-big lv-pink" data-act="dq-voice">🔊 아빠 목소리 듣기</button><audio id="dq-audio" hidden></audio>' : "") +
      '<button class="lv-link" data-act="dq-list">문제 목록</button>' + err());
    // 천천히 떠오르는 타자 효과
    var text = d.answer || "", i = 0, el = document.getElementById("dq-type");
    var t = setInterval(function () {
      if (!lv || !el) { clearInterval(t); return; }
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(t);
    }, 90);
    lv.timers.push(t);
  }

  function playVoice() {
    var d = lv.st.d, C = window.SITE_CONFIG;
    var h = { apikey: C.supabaseKey };
    if (!/^sb_/.test(C.supabaseKey)) h.Authorization = "Bearer " + C.supabaseKey;
    fetch(C.supabaseUrl + "/storage/v1/object/dad-voice/" + d.voice, { headers: h }).then(function (r) {
      if (!r.ok) throw new Error("녹음을 못 불러왔어요");
      return r.blob();
    }).then(function (b) {
      var a = document.getElementById("dq-audio");
      a.src = URL.createObjectURL(b);
      a.hidden = false; a.controls = true;
      a.play();
    }).catch(fail);
  }

  // ═════ 결과 발표 + 경품 ═════
  var CF = ["#FFD93D", "#7CC8FF", "#FF9EC4", "#9EE6C3", "#C9B6FF"];
  function reveal() {
    call("admin_reveal_view", {}).then(function (d) { if (!lv) return; lv.st.d = d; revealPaint(); }, fail);
  }
  function confetti(n) {
    var out = "";
    for (var i = 0; i < n; i++) {
      out += '<span class="cf" style="left:' + (i * 37) % 100 + "%;width:" + (8 + (i % 3) * 3) + "px;height:" + (12 + (i % 4) * 2) + "px;background:" +
        CF[i % 5] + ";border-radius:" + (i % 3 ? 2 : 10) + "px;animation-duration:" + (2.2 + (i % 5) * .35) + "s;animation-delay:" + (i % 9) * .12 + 's"></span>';
    }
    return '<div class="cf-wrap" aria-hidden="true">' + out + "</div>";
  }
  function revealPaint() {
    var d = lv.st.d, step = d.step, rk = d.ranking || [];
    var order = rk.slice().reverse();
    lv.el.dataset.bg = step === 4 ? "gold" : step === 5 ? "paper" : "sky";
    if (step === 0) {
      paint('<div class="lv-center rv">' +
        '<span class="g-mono">FINAL RESULTS</span><span class="rv-title">두근두근<br>결과 발표</span>' +
        "<p>4등부터 한 팀씩 공개해요</p>" +
        '<button class="lv-big lv-dark rv-btn" data-act="rv-next">4등 공개</button></div>' + err());
    } else if (step <= 4) {
      var t = order[step - 1];
      var label = t.rank + "등";
      paint(confetti(step === 4 ? 70 : 28) +
        '<div class="lv-center rv rv-pop">' +
          '<span class="rv-rank">RANK ' + t.rank + " · " + label + "</span>" +
          '<span class="rv-avatar" style="background:' + esc(t.color) + '">' + (t.image ? '<img src="' + esc(G.imgUrl(t.image)) + '" alt="">' : esc(t.ch)) + "</span>" +
          '<span class="rv-name">' + esc(t.name) + '</span><span class="g-mono rv-fam">' + esc(t.fam) + "</span>" +
          '<span class="rv-score">' + t.total + "점</span>" +
          '<button class="lv-big lv-dark rv-btn" data-act="rv-next">' + (step < 4 ? order[step].rank + "등 공개" : "경품 고르러 가기") + "</button></div>" + err());
    } else {
      var prizes = d.prizes || [];
      var picker = rk.filter(function (t) { return !prizes.some(function (p) { return p.picked_by === t.id; }); })[0];
      paint('<div class="rv-prizes"><span class="g-mono">PRIZE PICK · 경품 고르기</span>' +
        '<span class="rv-picker">' + (picker ? picker.rank + "등 · " + esc(picker.name) : "모두 골랐어요 🎉") + "</span>" +
        (prizes.length ? prizes.map(function (p) {
          var by = p.picked_by && G.teamById(p.picked_by);
          return '<button class="rv-prize' + (by ? " taken" : "") + '" data-act="rv-pick" data-id="' + p.id + '"' + (by || !picker ? " disabled" : "") + ">" +
            (p.photo ? '<img src="' + esc(G.imgUrl(p.photo)) + '" alt="">' : '<span class="rv-prize-ph">사진</span>') +
            '<span class="rv-prize-name">' + esc(p.name) + "</span>" +
            '<span class="rv-tag" style="background:' + (by ? esc(by.color) : "#fff") + '">' + (by ? esc(by.name) : "고를 수 있음") + "</span></button>";
        }).join("") : '<p class="lv-lead">등록된 경품이 없어요. 진행자 화면 › 게임 › 결과 발표에서 등록해요.</p>') +
        (picker ? "" : '<button class="lv-big lv-dark" data-act="lv-close">끝 · 현황판으로</button>') +
        "</div>" + err());
    }
  }

  // ── 클릭 ──
  function onClick(e) {
    var b = e.target.closest("[data-act]");
    if (!b || !lv) return;
    var act = b.dataset.act, s = lv.st;
    if (act === "lv-close") return close();
    if (act === "lv-mute") { Snd.toggle(); b.textContent = Snd.muted ? "🔇" : "🔊"; return; }
    if (act === "lv-team") { s.team = b.dataset.team; Snd.pop(); return proverbPaint(); }

    // 속담
    if (act === "pv-secs") { s.secs = +b.dataset.v; proverbPaint(); }
    else if (act === "pv-ready") { s.phase = "ready"; proverbPaint(); }
    else if (act === "pv-reset") {
      if (!window.confirm("이 팀이 받은 속담을 모두 풀고 처음부터 할까요?")) return;
      call("admin_proverb_reset", { p_team: s.team }).then(function () { s.phase = null; proverb(); }, fail);
    } else if (act === "pv-start") {
      s.correct = 0; s.left = s.secs; s.timeout = false;
      pvNext().then(function () {
        s.phase = "play"; proverbPaint(); Snd.pop();
        var end = Date.now() + s.secs * 1000;
        var t = setInterval(function () {
          s.left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
          var el = document.getElementById("pv-clock");
          if (el) { el.textContent = s.left; el.classList.toggle("hurry", s.left <= 10); }
          if (s.left <= 0) pvEnd(true);
        }, 200);
        lv.timers.push(t);
      }, fail);
    } else if (act === "pv-mark") {
      if (s.busy) return;
      s.busy = true;
      var ok = b.dataset.r === "correct";
      call("admin_proverb_mark", { p_id: s.cur.id, p_result: b.dataset.r }).then(function () {
        s.busy = false;
        if (ok) { s.correct++; Snd.good(); } else Snd.tick();
        if (s.cur.no >= 10) return pvEnd(false);
        return pvNext();
      }, function (er) { s.busy = false; fail(er); });
    } else if (act === "pv-save") {
      var unit = game("g5").unit_points || 4;
      G.admin("admin_save_results", { p_game: "g5", p_results: [{ team: s.team, points: s.correct * unit, raw: { count: s.correct } }] })
        .then(function () { s.phase = null; s.team = null; proverb(); }, fail);
    } else if (act === "pv-back") { s.phase = null; s.team = null; proverb(); }

    // O/X 구호
    else if (act === "ox-go") oxStart();
    else if (act === "ox-gap") { s.gap = +b.dataset.v; oxPaint(); }
    else if (act === "ox-stop") {
      stopTimers(); s.running = false;
      if (Voice.ok) try { speechSynthesis.cancel(); } catch (er) { /* 무시 */ }
      Snd.buzz(); oxPaint();
    } else if (act === "ox-reset") { s.calls = 0; s.last = null; s.history = []; oxPaint(); }

    // 초성
    else if (act === "ch-draw") {
      call("admin_chosung_draw", { p_team: null }).then(function (c) {
        s.cur = c; s.failed = []; s.phase = "shown"; Snd.pop(); chPaint();
      }, fail);
    } else if (act === "ch-try") {
      s.team = b.dataset.team; s.phase = "play"; Snd.pop(); chPaint();
      countdown(10, "ch-clock", function () { Snd.buzz(); s.phase = "judge"; chPaint(); });
    } else if (act === "ch-judge") {
      if (b.dataset.ok === "1") { s.tally[s.team] = (s.tally[s.team] || 0) + 1; Snd.good(); chFinish(); }
      else {
        s.failed.push(s.team);
        // 모든 팀이 실패하면 다음 자음으로
        if (s.failed.length >= teams().length) chFinish(); else { s.phase = "shown"; chPaint(); }
      }
    } else if (act === "ch-skip") { chFinish();
    } else if (act === "ch-save") {
      var u = game("g8").unit_points || 10;
      var res = teams().filter(function (t) { return s.tally[t.id] != null; })
        .map(function (t) { return { team: t.id, points: s.tally[t.id] * u, raw: { count: s.tally[t.id] } }; });
      if (!res.length) return fail(new Error("아직 성공한 팀이 없어요"));
      G.admin("admin_save_results", { p_game: "g8", p_results: res }).then(function () {
        var m = lv.el.querySelector(".lv-err"); if (m) m.textContent = "✓ 점수를 반영했어요";
      }, fail);
    }

    // 아빠 퀴즈
    else if (act === "dq-go") {
      s.pickTeam = null;
      call("admin_dadq_set", { p_n: +b.dataset.n, p_stage: 0 }).then(dad, fail);
    } else if (act === "dq-list") { call("admin_dadq_set", { p_n: null, p_stage: 0 }).then(dad, fail); }
    else if (act === "dq-stage") {
      var nx = s.d.stage + 1;
      s.pickTeam = null;
      call("admin_dadq_set", { p_n: s.d.n, p_stage: nx }).then(function () { if (nx === 4) Snd.fanfare(); else Snd.pop(); dad(); }, fail);
    } else if (act === "dq-team") {
      var tid = b.dataset.team;
      if (s.d.stage === 3) { s.pickTeam = s.pickTeam === tid ? null : tid; return dadPaint(); }
      var on = !(s.d.scored && s.d.scored[tid]);
      call("admin_dadq_score", { p_team: tid, p_on: on }).then(function () { if (on) Snd.good(); dad(); }, fail);
    } else if (act === "dq-opt") {
      if (s.d.stage !== 3 || !s.pickTeam) return;
      var pick = +b.dataset.i;
      var cur = s.d.picks && s.d.picks[s.pickTeam];
      call("admin_dadq_pick", { p_team: s.pickTeam, p_pick: cur === pick ? null : pick }).then(function () { s.pickTeam = null; Snd.tick(); dad(); }, fail);
    } else if (act === "dq-letter") { call("admin_dadq_set", { p_n: 15, p_stage: 4 }).then(dad, fail); }
    else if (act === "dq-voice") playVoice();

    // 발표
    else if (act === "rv-next") {
      var step = s.d.step + 1;
      if (step <= 4) {
        Snd.drum(1.2);
        b.disabled = true;
        setTimeout(function () {
          call("admin_reveal_step", { p_step: step }).then(function () { s.d.step = step; Snd.fanfare(); revealPaint(); }, fail);
        }, 1200);
      } else call("admin_reveal_step", { p_step: 5 }).then(function () { s.d.step = 5; revealPaint(); }, fail);
    } else if (act === "rv-pick") {
      var rk = s.d.ranking, prizes = s.d.prizes;
      var picker = rk.filter(function (t) { return !prizes.some(function (p) { return p.picked_by === t.id; }); })[0];
      var pz = prizes.filter(function (p) { return p.id === +b.dataset.id; })[0];
      if (!picker || !pz || !window.confirm(picker.name + " 팀이 \"" + pz.name + "\"을(를) 고를까요?")) return;
      call("admin_prize_pick", { p_prize: pz.id, p_team: picker.id }).then(function () { Snd.fanfare(); reveal(); }, fail);
    }
  }

  // ── 진행자 화면에서 여는 입구 ──
  G.openLive = function (kind) {
    var titles = { proverb: "AI 속담 맞추기", ox: "O/X 구호 게임", chosung: "AI 초성 게임", dadquiz: "아빠 퀴즈", final: "결과 발표" };
    open(kind === "dadquiz" ? "dad" : kind, titles[kind]);
    lv.game = kind === "dadquiz" ? "dad" : kind;
    if (kind === "proverb") proverb();
    else if (kind === "ox") ox();
    else if (kind === "chosung") chosung();
    else if (kind === "dadquiz") dad();
    else if (kind === "final") { lv.el.classList.add("lv-reveal"); reveal(); }
  };
})();
