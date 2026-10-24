/*
 * 게임 공통 — 로그인 토큰, 서버 호출, 주기적 새로고침(4초), 작은 도구들.
 * 화면은 views.js(팀원) · admin.js(진행자)가 그린다. 여기서 실패해도 일정 탭은 영향 없음.
 */
(function () {
  "use strict";

  var POLL_MS = 4000;
  var KEYS = { team: "g-team-token", admin: "g-admin-token" };
  var C = window.SITE_CONFIG || {};
  var listeners = {};

  function storage() { try { return window.localStorage; } catch (e) { return null; } }
  function getItem(k) { try { var s = storage(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function setItem(k, v) {
    try { var s = storage(); if (!s) return; if (v) s.setItem(k, v); else s.removeItem(k); } catch (e) { /* 기억 못 해도 진행 */ }
  }

  var G = {
    teamToken: getItem(KEYS.team),
    adminToken: getItem(KEYS.admin),
    board: null,        // public_board 결과
    adminBoard: null,   // admin_board 결과
    view: "",
    online: true
  };

  G.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  G.imgUrl = function (path) {
    return path ? C.supabaseUrl + "/storage/v1/object/public/media/" + path : "";
  };
  G.ago = function (iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "방금";
    if (s < 3600) return Math.floor(s / 60) + "분 전";
    var d = new Date(iso);
    var h = d.getHours();
    return (h < 12 ? "오전 " : "오후 ") + ((h + 11) % 12 + 1) + ":" + ("0" + d.getMinutes()).slice(-2);
  };
  G.randomName = function () {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  };
  G.teamById = function (id) {
    var list = (G.board && G.board.teams) || (G.adminBoard && G.adminBoard.teams) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };
  // 팀 동그라미 (이미지가 있으면 이미지, 없으면 글자)
  G.avatar = function (t, size) {
    var st = "width:" + size + "px;height:" + size + "px;background:" + G.esc(t.color) + ";font-size:" + Math.round(size * .48) + "px";
    return '<span class="g-avatar" style="' + st + '">' +
      (t.image ? '<img src="' + G.esc(G.imgUrl(t.image)) + '" alt="">' : G.esc(t.ch)) + "</span>";
  };

  // ── 이벤트 ──
  G.on = function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); };
  G.emit = function (name, data) {
    (listeners[name] || []).forEach(function (fn) {
      try { fn(data); } catch (e) { if (window.console) console.error(e); }
    });
  };

  // ── 서버 ──
  function isAuthError(e) { return /다시 로그인/.test(e.message); }

  G.rpc = function (name, args) {
    if (!window.SB || !SB.ready()) return Promise.reject(new Error("서버 설정이 없어요"));
    return SB.rpc(name, args).then(function (d) {
      if (!G.online) { G.online = true; G.emit("online", true); }
      return d;
    }, function (e) {
      if (!e.status && G.online) { G.online = false; G.emit("online", false); }
      throw e;
    });
  };

  G.token = function () { return G.teamToken || G.adminToken; };

  G.setTeamToken = function (t) { G.teamToken = t; setItem(KEYS.team, t); };
  G.setAdminToken = function (t) { G.adminToken = t; setItem(KEYS.admin, t); };

  G.loginTeam = function (team, pin) {
    return G.rpc("login_team", { p_team: team, p_pin: pin }).then(function (t) {
      if (!t) return false;
      G.setTeamToken(t);
      G.refresh();
      return true;
    });
  };
  G.loginAdmin = function (pin) {
    return G.rpc("login_admin", { p_pin: pin }).then(function (t) {
      if (!t) return false;
      G.setAdminToken(t);
      G.refresh();
      return true;
    });
  };
  G.logoutTeam = function () {
    var t = G.teamToken;
    G.setTeamToken(null);
    if (t) G.rpc("logout", { p_token: t }).catch(function () {});
    if (!G.token()) G.board = null;
    G.refresh();
  };
  G.logoutAdmin = function () {
    var t = G.adminToken;
    G.setAdminToken(null);
    G.adminBoard = null;
    if (t) G.rpc("logout", { p_token: t }).catch(function () {});
    if (!G.token()) G.board = null;
    if (location.hash === "#admin") location.hash = "#race";
    G.refresh();
  };

  // 관리자 동작: 실행 후 바로 새로고침
  G.admin = function (name, args) {
    var a = { p_token: G.adminToken };
    for (var k in args) a[k] = args[k];
    return G.rpc(name, a).then(function (d) { G.refresh(); return d; }, function (e) {
      if (isAuthError(e) || /관리자만/.test(e.message)) G.logoutAdmin();
      throw e;
    });
  };

  var loading = false;
  G.refresh = function () {
    if (loading) return Promise.resolve();
    loading = true;
    var jobs = [];
    if (G.token()) {
      jobs.push(G.rpc("public_board", { p_token: G.token() }).then(function (b) { G.board = b; }, function (e) {
        if (isAuthError(e)) {
          if (G.teamToken) G.setTeamToken(null); else G.setAdminToken(null);
          G.board = null;
        }
      }));
    }
    if (G.adminToken && G.view === "admin") {
      jobs.push(G.rpc("admin_board", { p_token: G.adminToken }).then(function (b) { G.adminBoard = b; }, function (e) {
        if (isAuthError(e) || /관리자만/.test(e.message)) { G.setAdminToken(null); G.adminBoard = null; }
      }));
    }
    return Promise.all(jobs).then(function () {
      loading = false;
      G.emit("change");
    }, function () { loading = false; G.emit("change"); });
  };

  // ── 새로고침 주기: 화면이 보이고 게임 탭에 있을 때만 ──
  function tick() {
    if (document.visibilityState === "visible" && G.view && G.view !== "itin" && G.token()) G.refresh();
  }
  setInterval(tick, POLL_MS);
  document.addEventListener("visibilitychange", tick);

  window.addEventListener("viewchange", function (e) {
    G.view = e.detail;
    G.emit("view", G.view);
    if (G.view !== "itin") G.refresh();
  });

  G.view = (location.hash.replace("#", "") || "itin");
  window.Game = G;
})();
