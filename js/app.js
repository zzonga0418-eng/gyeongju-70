/* 앱 껍데기 — 하단 탭(#itin/#race/#mission/#quiz) 전환. 게임 탭은 프롬프트 2에서 view-* 영역을 채운다. */
(function () {
  "use strict";

  var VIEWS = ["itin", "race", "mission", "quiz"];
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
  }

  window.addEventListener("hashchange", show);
  show();
})();
