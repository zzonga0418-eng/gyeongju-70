/*
 * 아빠 설문 — 한 화면에 질문 하나, 큰 글씨, 중간 저장.
 * 서버는 질문과 "답했는지 여부"만 돌려준다. 쓰던 글은 아빠 폰(localStorage)에만 남는다.
 * dad.html#k=링크키 → 실제 저장 / dad.html#demo → 내 PC 시험 (서버에 아무것도 보내지 않음)
 */
(function () {
  "use strict";

  var root = document.getElementById("dad");
  var params = parseHash();
  var DEMO = "demo" in params;
  var KEY = params.k || "";
  var DRAFT_KEY = DEMO ? "dad-draft-demo" : "dad-draft-v1";
  var MAX_REC_SEC = 180;
  var IN_KAKAO = /KAKAOTALK/i.test(navigator.userAgent);

  var state = { qs: [], at: -1, voice: false, drafts: loadDrafts(), busy: false, msg: "", msgKind: "" };
  var rec = { st: "idle", blob: null, url: "", type: "", sec: 0, timer: 0, mr: null, stream: null, err: "" };

  // ── 작은 도구 ──
  function parseHash() {
    var out = {};
    location.hash.replace(/^#/, "").split("&").forEach(function (p) {
      if (!p) return;
      var i = p.indexOf("=");
      if (i < 0) out[decodeURIComponent(p)] = "";
      else out[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1));
    });
    return out;
  }
  function storage() { try { return window.localStorage; } catch (e) { return null; } }
  function loadDrafts() {
    try { var s = storage(); return JSON.parse((s && s.getItem(DRAFT_KEY)) || "{}") || {}; } catch (e) { return {}; }
  }
  function saveDrafts() {
    try { var s = storage(); if (s) s.setItem(DRAFT_KEY, JSON.stringify(state.drafts)); } catch (e) { /* 저장 못 해도 진행 */ }
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function doneCount() { return state.qs.filter(function (q) { return q.answered; }).length; }
  function firstOpen() {
    for (var i = 0; i < state.qs.length; i++) if (!state.qs[i].answered) return i;
    return state.qs.length;  // 모두 답함 → 목록
  }
  function randomName() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  // ── 불러오기 ──
  function load() {
    if (DEMO) return loadDemo();
    if (!KEY) return fatal("링크가 잘못됐어요.", "카톡으로 받은 링크를 다시 눌러주세요.");
    if (!window.SB || !SB.ready()) return fatal("아직 준비 중이에요.", "조금 뒤에 다시 열어주세요.");
    SB.rpc("dad_load", { p_key: KEY }).then(function (d) {
      state.qs = (d && d.questions) || [];
      state.voice = !!(d && d.voice);
      render();
    }).catch(function (e) {
      if (/링크/.test(e.message)) fatal("링크를 다시 확인해 주세요.", "카톡으로 받은 링크를 다시 눌러주세요.");
      else fatal("인터넷 연결이 약해요.", "와이파이나 데이터를 확인하고 다시 열어주세요.");
    });
  }

  function loadDemo() {
    var s = document.createElement("script");
    s.src = "dev/dad-questions.local.js";
    s.onload = s.onerror = function () {
      state.qs = (window.DAD_DEMO_QUESTIONS || []).slice();
      if (!state.qs.length) {
        for (var i = 1; i <= 15; i++) state.qs.push({ n: i, category: "예시", question: "예시 질문 " + i, guide: "", answered: false });
      }
      render();
    };
    document.head.appendChild(s);
  }

  function fatal(title, sub) {
    root.innerHTML =
      '<section class="card hero"><h1 class="hero-title">' + esc(title) + "</h1><p>" + esc(sub) + "</p></section>";
  }

  // ── 화면 ──
  function render() {
    stopTimer();
    if (state.at < 0) root.innerHTML = introHtml();
    else if (state.at >= state.qs.length) root.innerHTML = listHtml();
    else root.innerHTML = questionHtml(state.qs[state.at]);
    if (state.at >= 0 && state.at < state.qs.length && rec.st === "recording") startTimer();
    window.scrollTo(0, 0);
  }

  function demoBanner() {
    return DEMO ? '<p class="demo">시험 화면이에요 · 답은 이 기기에만 남고 서버로 가지 않아요</p>' : "";
  }

  function introHtml() {
    var n = doneCount();
    return demoBanner() +
      '<section class="card warn-card" role="note">' +
        '<p class="warn-title">※ 엄마도 참가자예요!</p>' +
        "<p>질문에 대한 답을 엄마에게 <b>절대 알려주면 안 됩니다!</b><br>알려주는 경우 <b>부정 실격 처리</b>됩니다!</p>" +
      "</section>" +
      '<section class="card hero">' +
        '<span class="kicker">아빠 칠순 · 2026.11.21</span>' +
        '<h1 class="hero-title">아빠, 질문 ' + state.qs.length + "개에<br>답해주세요</h1>" +
        "<p>칠순잔치 날 가족 퀴즈로 나와요.<br>맞고 틀린 답은 없어요. 생각나는 대로 편하게!</p>" +
      "</section>" +
      '<section class="card mic-card">' +
        '<span class="mic-icon" aria-hidden="true">🎤</span>' +
        "<p>글자 치기 힘드시면 <b>키보드의 마이크 버튼</b>을 누르고 말씀하세요. 말이 글자로 바뀌어요.</p>" +
      "</section>" +
      '<p class="soft">중간에 그만둬도 괜찮아요.<br>이 링크를 다시 누르면 이어서 할 수 있어요.</p>' +
      '<button class="btn big primary" data-act="begin">' +
        (n ? "이어서 하기 · " + n + "/" + state.qs.length + " 완료" : "시작하기") +
      "</button>" +
      (n ? '<button class="btn" data-act="list">전체 질문 보기</button>' : "");
  }

  function questionHtml(q) {
    var total = state.qs.length;
    var draft = state.drafts[q.n] || "";
    var pct = Math.round((state.at + 1) / total * 100);
    var last = q.n === 15;
    return demoBanner() +
      '<header class="qtop">' +
        '<span class="qcount">' + (state.at + 1) + " / " + total + "</span>" +
        '<span class="qbar"><i style="width:' + pct + '%"></i></span>' +
      "</header>" +
      '<section class="card q' + (last ? " q-letter" : "") + '">' +
        '<span class="chip">' + esc(q.category) + "</span>" +
        '<h1 class="q-title">' + (last ? "" : "Q" + q.n + ". ") + esc(q.question) + "</h1>" +
        (q.guide ? '<p class="q-guide">' + esc(q.guide) + "</p>" : "") +
      "</section>" +
      (q.answered && !draft ? '<p class="note ok">✓ 이미 답하셨어요. 고치고 싶으면 새로 써 주세요.</p>' : "") +
      '<label class="sr" for="ans">답 쓰는 곳</label>' +
      '<textarea id="ans" class="ans" rows="' + (last ? 8 : 5) + '" placeholder="여기를 누르고 답을 써 주세요">' + esc(draft) + "</textarea>" +
      '<p class="mic-line"><span aria-hidden="true">🎤</span> 키보드의 <b>마이크 버튼</b>을 누르면 말로 입력돼요</p>' +
      (last ? voiceHtml() : "") +
      '<p class="status ' + state.msgKind + '" id="status">' + esc(state.msg) + "</p>" +
      '<div class="qnav">' +
        '<button class="btn" data-act="prev">◀ 이전</button>' +
        '<button class="btn primary" data-act="next" id="next">' + nextLabel(draft, last) + "</button>" +
      "</div>" +
      '<button class="btn link" data-act="list">전체 질문 보기</button>';
  }

  function nextLabel(text, last) {
    if (!text.trim()) return last ? "다음에 쓸게요" : "다음에 답할게요 ▶";
    return last ? "저장하기 ✓" : "저장하고 다음 ▶";
  }

  function voiceHtml() {
    var body;
    var canRec = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    if (!canRec || rec.st === "blocked") {
      body =
        "<p>" + (IN_KAKAO ? "카톡 안에서는 녹음이 안 돼요." : "이 화면에서는 녹음이 안 돼요.") + "<br>" +
        "다른 브라우저(크롬·사파리)로 열면 녹음할 수 있어요.</p>" +
        (IN_KAKAO ? '<button class="btn primary" data-act="external">다른 브라우저로 열기</button>' : "") +
        '<p class="soft small">안 되면 화면 오른쪽 위·아래의 ⋮ 또는 공유 버튼 → "다른 브라우저로 열기"를 눌러주세요.</p>';
    } else if (rec.st === "recording") {
      body =
        '<p class="rec-live"><span class="rec-dot" aria-hidden="true"></span> 녹음 중 <b id="rec-sec">' + clock(rec.sec) + "</b></p>" +
        '<button class="btn big stop" data-act="rec-stop">■ 멈추기</button>';
    } else if (rec.st === "done") {
      body =
        '<audio controls src="' + rec.url + '"></audio>' +
        '<div class="qnav">' +
          '<button class="btn" data-act="rec-start">다시 녹음</button>' +
          '<button class="btn primary" data-act="rec-send">이 목소리 보내기</button>' +
        "</div>";
    } else {
      body = '<button class="btn big rec" data-act="rec-start">● 녹음 시작</button>';
    }
    return '<section class="card voice">' +
      '<h2 class="voice-title">목소리로도 남겨주세요 <span class="soft">(안 해도 돼요)</span></h2>' +
      "<p>잔치 날 가족들 앞에서 틀어드려요. 3분까지 돼요.</p>" +
      (state.voice ? '<p class="note ok">✓ 목소리를 보냈어요. 다시 녹음해서 보내면 바뀌어요.</p>' : "") +
      (rec.err ? '<p class="note warn">' + esc(rec.err) + "</p>" : "") +
      body +
    "</section>";
  }

  function listHtml() {
    var n = doneCount(), total = state.qs.length;
    var all = n === total;
    return demoBanner() +
      '<section class="card hero' + (all ? " hero-done" : "") + '">' +
        '<h1 class="hero-title">' + (all ? "모두 답하셨어요!<br>고맙습니다 ❤️" : total + "개 중 " + n + "개 답했어요") + "</h1>" +
        "<p>" + (all ? "언제든 이 링크로 들어와서 고칠 수 있어요." : "남은 질문을 눌러서 답해주세요.") + "</p>" +
      "</section>" +
      '<ol class="qlist">' +
      state.qs.map(function (q, i) {
        return '<li><button class="qitem' + (q.answered ? " on" : "") + '" data-act="go" data-i="' + i + '">' +
          '<span class="qmark" aria-hidden="true">' + (q.answered ? "✓" : q.n) + "</span>" +
          '<span class="qtext">' + esc(q.question) + "</span>" +
          '<span class="sr">' + (q.answered ? "답함" : "아직") + "</span>" +
        "</button></li>";
      }).join("") +
      "</ol>";
  }

  // ── 동작 ──
  function setMsg(text, kind) {
    state.msg = text;
    state.msgKind = kind || "";
    var el = document.getElementById("status");
    if (el) { el.textContent = text; el.className = "status " + state.msgKind; }
  }

  function go(i) {
    state.at = i;
    state.msg = "";
    render();
  }

  function saveCurrent() {
    var q = state.qs[state.at];
    var text = (state.drafts[q.n] || "").trim();
    if (!text) return Promise.resolve(false);
    if (DEMO) { q.answered = true; return Promise.resolve(true); }
    return SB.rpc("dad_save", { p_key: KEY, p_n: q.n, p_answer: text }).then(function () {
      q.answered = true;
      return true;
    });
  }

  function next() {
    if (state.busy) return;
    var last = state.at === state.qs.length - 1;
    state.busy = true;
    setMsg("저장하는 중…");
    saveCurrent().then(function (saved) {
      state.busy = false;
      state.msg = "";
      if (last) go(state.qs.length);
      else go(state.at + 1);
      if (saved) setMsg("✓ 앞 질문 답을 저장했어요", "ok");
    }).catch(function () {
      state.busy = false;
      setMsg("인터넷이 약해서 저장을 못 했어요. 쓴 글은 남아 있어요. 다시 눌러주세요.", "warn");
    });
  }

  // ── 녹음 ──
  function clock(s) { return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function startTimer() {
    stopTimer();
    rec.timer = setInterval(function () {
      rec.sec++;
      var el = document.getElementById("rec-sec");
      if (el) el.textContent = clock(rec.sec);
      if (rec.sec >= MAX_REC_SEC) recStop();
    }, 1000);
  }
  function stopTimer() { if (rec.timer) { clearInterval(rec.timer); rec.timer = 0; } }

  function pickType() {
    var types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg"];
    for (var i = 0; i < types.length; i++) {
      if (window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return "";
  }

  function recStart() {
    rec.err = "";
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var type = pickType();
      var chunks = [];
      var mr = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      rec.stream = stream;
      rec.mr = mr;
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        rec.type = (mr.mimeType || type || "audio/webm").split(";")[0];
        rec.blob = new Blob(chunks, { type: rec.type });
        if (rec.url) URL.revokeObjectURL(rec.url);
        rec.url = URL.createObjectURL(rec.blob);
        rec.st = "done";
        render();
      };
      rec.sec = 0;
      rec.st = "recording";
      mr.start();
      render();
    }).catch(function () {
      rec.st = "blocked";
      rec.err = "마이크를 쓸 수 없어요. 마이크 허용을 눌러주시거나 다른 브라우저로 열어주세요.";
      render();
    });
  }

  function recStop() {
    stopTimer();
    if (rec.mr && rec.mr.state !== "inactive") rec.mr.stop();
  }

  function recSend() {
    if (!rec.blob || state.busy) return;
    if (DEMO) {
      state.voice = true;
      rec.st = "idle";
      render();
      setMsg("✓ 시험 화면이라 실제로 보내지는 않았어요", "ok");
      return;
    }
    var ext = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/aac": "aac", "audio/ogg": "ogg", "audio/x-m4a": "m4a", "audio/wav": "wav" }[rec.type] || "webm";
    var path = "voice/" + randomName() + "." + ext;
    state.busy = true;
    setMsg("목소리를 보내는 중… 잠깐만 기다려 주세요");
    SB.upload("dad-voice", path, rec.blob, rec.type).then(function () {
      return SB.rpc("dad_voice_saved", { p_key: KEY, p_path: path });
    }).then(function () {
      state.busy = false;
      state.voice = true;
      rec.st = "idle";
      render();
      setMsg("✓ 목소리를 보냈어요. 고맙습니다!", "ok");
    }).catch(function () {
      state.busy = false;
      setMsg("보내지 못했어요. 인터넷을 확인하고 다시 눌러주세요.", "warn");
    });
  }

  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.dataset.act;
    if (act === "begin") go(firstOpen());
    else if (act === "list") go(state.qs.length);
    else if (act === "go") go(+b.dataset.i);
    else if (act === "prev") go(Math.max(-1, state.at - 1));
    else if (act === "next") next();
    else if (act === "rec-start") recStart();
    else if (act === "rec-stop") recStop();
    else if (act === "rec-send") recSend();
    else if (act === "external") location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href);
  });

  root.addEventListener("input", function (e) {
    if (e.target.id !== "ans") return;
    var q = state.qs[state.at];
    state.drafts[q.n] = e.target.value;
    saveDrafts();
    var btn = document.getElementById("next");
    if (btn) btn.textContent = nextLabel(e.target.value, q.n === 15);
  });

  load();
})();
