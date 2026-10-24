/* 앱 껍데기 — 하단 탭(#itin/#race/#mission/#quiz) + 진행자 화면(#admin, 탭 없음) 전환. 게임 탭은 js/game/*.js 가 채운다. */
(function () {
  "use strict";

  var VIEWS = ["itin", "race", "mission", "quiz", "admin"];
  var itin = window.Itinerary ? window.Itinerary.mount(document.getElementById("view-itin")) : null;

  function show() {
    var name = location.hash.replace("#", "");
    if (VIEWS.indexOf(name) === -1) name = "itin";
    VIEWS.forEach(function (v) {
      document.getElementById("view-" + v).hidden = v !== name;
    });
    document.querySelectorAll(".tab").forEach(function (t) {
      var on = t.dataset.view === name;
      t.classList.toggle("on", on);
      if (on) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
    });
    document.getElementById("screen-title").textContent = document.getElementById("view-" + name).dataset.title;
    document.querySelector(".screen").scrollTop = 0;
    if (name === "itin" && itin) itin.refresh();
    // 게임 모듈이 실패해도 일정 탭은 그대로 — 알림만 보낸다
    try { window.dispatchEvent(new CustomEvent("viewchange", { detail: name })); } catch (e) { /* 무시 */ }
  }

  window.addEventListener("hashchange", show);
  show();
})();
