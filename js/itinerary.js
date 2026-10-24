/* 일정 탭 — data/itinerary.js(window.ITINERARY)를 읽어 그린다. 서버·로그인 없이 동작. */
(function () {
  "use strict";

  var DATA = window.ITINERARY;
  var NEED = "확인 필요";
  var NUM_COLORS = ["var(--butter)", "var(--sky)", "var(--pink)", "var(--mint)", "var(--lilac)"];
  var RANK = ["1순위 추천", "2순위", "3순위"];
  var STORE_DAY = "trip.itin.day";
  var STORE_CHECKS = "trip.itin.checks";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 못 해도 화면은 그대로 */ }
  }
  function naverMap(name, address) {
    return "https://map.naver.com/p/search/" + encodeURIComponent(name + " " + (address || "").split(" (")[0].replace(/^경북 /, "경주 "));
  }
  function telHref(v) { return "tel:" + v.replace(/[^0-9]/g, ""); }
  function isNeed(v) { return String(v).indexOf(NEED) !== -1; }

  // 정류장 좌표: 식사는 1순위 후보, 관광지는 자체 좌표, 숙소 일정은 숙소
  function stopPoint(stop) {
    if (stop.cands) { var r = stop.cands[0]; return { lat: r.lat, lng: r.lng, name: r.name }; }
    if (stop.lat) return { lat: stop.lat, lng: stop.lng, name: (stop.info && stop.info.name) || stop.name };
    return null;
  }

  /* ── 조각 렌더 ── */
  function fieldsHtml(fields, sources) {
    return '<dl class="fields">' + fields.map(function (f) {
      var k = f[0], v = f[1], refs = f[2] || [];
      var val = k === "전화" && !isNeed(v)
        ? '<a class="tel" href="' + telHref(v) + '">' + esc(v) + "</a>"
        : esc(v);
      var srcs = refs.map(function (n) {
        var url = sources[n - 1];
        return url ? '<a class="src" href="' + esc(url) + '" target="_blank" rel="noopener">[' + n + "]</a>" : "";
      }).join("");
      return "<dt>" + esc(k) + '</dt><dd class="' + (isNeed(v) ? "need" : "") + '">' + val + srcs + "</dd>";
    }).join("") + "</dl>";
  }

  function srcListHtml(id, sources) {
    return '<ol class="srclist" id="' + id + '" hidden>' + sources.map(function (u) {
      return '<li><a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u.replace(/^https?:\/\//, "")) + "</a></li>";
    }).join("") + "</ol>";
  }

  function candHtml(c, i, key) {
    var sid = "src-" + key + "-" + i;
    return '<article class="cand' + (i === 0 ? " rec" : "") + '">' +
      '<div class="cand-head"><span class="badge">' + RANK[i] + '</span><span class="cand-name">' + esc(c.name) + "</span></div>" +
      '<p class="cand-addr">📍 ' + esc(c.address) + "</p>" +
      fieldsHtml(c.fields, c.sources) +
      '<div class="cand-actions">' +
        '<a class="btn-line" href="' + naverMap(c.name, c.address) + '" target="_blank" rel="noopener">네이버 지도</a>' +
        '<button class="btn-line" type="button" data-toggle="' + sid + '">출처 보기</button>' +
      "</div>" + srcListHtml(sid, c.sources) +
    "</article>";
  }

  function extrasHtml(extras) {
    return (extras || []).map(function (x) {
      var srcs = x.sources.map(function (u, n) {
        return '<a class="src" href="' + esc(u) + '" target="_blank" rel="noopener">[' + (n + 1) + "]</a>";
      }).join("");
      return '<div class="extra"><p class="extra-title">' + esc(x.title) + "</p><ul>" +
        x.lines.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") +
        "</ul>" + (srcs ? "<div>출처 " + srcs + "</div>" : "") + "</div>";
    }).join("");
  }

  function stopHtml(stop, i, day, total) {
    var key = day.id + "-" + i;
    var body = "";
    if (stop.cands) {
      var label = stop.takeout ? "포장 후보 " : stop.cafe ? "카페 후보 " : "후보 ";
      body += '<button class="toggle" type="button" data-toggle="c-' + key + '" data-open="' + label + stop.cands.length + '곳 접기 ▴" data-closed="' + label + stop.cands.length + '곳 비교 ▾">' + label + stop.cands.length + "곳 비교 ▾</button>" +
        '<div class="cands" id="c-' + key + '" hidden>' +
          stop.cands.map(function (c, ci) { return candHtml(c, ci, key); }).join("") +
          extrasHtml(stop.extras) +
        "</div>";
    } else if (stop.info) {
      var inf = stop.info, sid = "src-" + key + "-i";
      body += '<button class="toggle info" type="button" data-toggle="c-' + key + '" data-open="접기 ▴" data-closed="운영시간 · 입장료 ▾">운영시간 · 입장료 ▾</button>' +
        '<div class="cands" id="c-' + key + '" hidden><article class="cand">' +
          '<p class="cand-addr">📍 ' + esc(inf.address) + "</p>" +
          fieldsHtml(inf.fields, inf.sources) +
          '<div class="cand-actions"><a class="btn-line" href="' + naverMap(inf.name, inf.address) + '" target="_blank" rel="noopener">네이버 지도</a>' +
          '<button class="btn-line" type="button" data-toggle="' + sid + '">출처 보기</button></div>' +
          srcListHtml(sid, inf.sources) +
        "</article>" +
        (stop.alt ? '<div class="alt-note"><b>＋ ' + esc(stop.alt.name) + "</b><br>" + esc(stop.alt.note) +
          stop.alt.sources.map(function (u, n) { return '<a class="src" href="' + esc(u) + '" target="_blank" rel="noopener">[' + (n + 1) + "]</a>"; }).join("") + "</div>" : "") +
        "</div>";
    }
    return '<div class="stop">' +
      '<div class="stop-rail"><span class="stop-num" style="background:' + NUM_COLORS[i % NUM_COLORS.length] + '">' + (i + 1) + '</span><span class="stop-line"></span></div>' +
      '<div class="stop-body">' +
        '<span class="stop-time">' + esc(stop.time) + "</span>" +
        '<h3 class="stop-name">' + esc(stop.name) + (stop.photo ? " 📸" : "") + "</h3>" +
        (stop.desc ? '<p class="stop-desc">' + esc(stop.desc) + "</p>" : "") +
        '<div class="chips">' + (stop.chips || []).map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join("") + "</div>" +
        body +
      "</div></div>";
  }

  /* ── 지도 ── */
  var map = null, layer = null;

  function initMap(el) {
    if (!window.L) { el.innerHTML = '<p style="padding:16px">지도를 불러오지 못했어요. 아래 구간별 이동시간을 참고하세요.</p>'; return; }
    map = L.map(el, { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false, zoomControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }

  function pinIcon(label, cls, size) {
    return L.divIcon({
      className: "",
      html: '<div class="pin ' + (cls || "") + '" style="width:' + size + "px;height:" + size + 'px">' + esc(label) + "</div>",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function drawMap(day) {
    if (!map) return;
    layer.clearLayers();
    var H = DATA.stay, route = [[H.lat, H.lng]], bounds = [[H.lat, H.lng]];

    // 2·3순위 후보·선택 장소는 흐린 핀
    day.stops.forEach(function (s) {
      (s.cands || []).slice(1).forEach(function (c) {
        L.marker([c.lat, c.lng], { icon: pinIcon("", "faded", 16), zIndexOffset: -100 })
          .bindPopup("<b>" + esc(c.name) + "</b><br>" + esc(s.time) + " 후보").addTo(layer);
      });
      if (s.alt) {
        L.marker([s.alt.lat, s.alt.lng], { icon: pinIcon("", "faded", 16), zIndexOffset: -100 })
          .bindPopup("<b>" + esc(s.alt.name) + "</b>").addTo(layer);
      }
    });

    day.stops.forEach(function (s, i) {
      var p = stopPoint(s);
      if (!p) return;
      route.push([p.lat, p.lng]);
      bounds.push([p.lat, p.lng]);
      L.marker([p.lat, p.lng], { icon: pinIcon(String(i + 1), "", 28), zIndexOffset: 100 + i })
        .bindPopup("<b>" + (i + 1) + ". " + esc(p.name) + "</b><br>" + esc(s.time)).addTo(layer);
    });
    var last = day.stops[day.stops.length - 1];
    if (last.stay) route.push([H.lat, H.lng]);

    L.marker([H.lat, H.lng], { icon: pinIcon("숙", "home", 30), zIndexOffset: 300 })
      .bindPopup("<b>" + esc(H.name) + "</b><br>" + esc(H.address)).addTo(layer);
    L.polyline(route, { color: "#2B2B2B", weight: 3, dashArray: "6 6", opacity: .85 }).addTo(layer);

    map.invalidateSize();
    map.fitBounds(bounds, { padding: [28, 28] });
  }

  /* ── 체크리스트 ── */
  function needItems() {
    var out = [];
    DATA.days.forEach(function (d) {
      d.stops.forEach(function (s) {
        var src = s.cands ? s.cands[0] : s.info;
        if (!src) return;
        src.fields.forEach(function (f) {
          if (isNeed(f[1])) out.push({ where: d.label + " · " + (src.name), what: f[0] + " — " + f[1] });
        });
      });
    });
    return out;
  }

  function checksHtml(done) {
    return '<section class="checks">' +
      '<h2 class="checks-title">출발 전 확인할 것</h2>' +
      DATA.checks.map(function (c, i) {
        var on = !!done[i];
        return '<div class="check' + (on ? " done" : "") + '">' +
          '<button class="check-box" type="button" data-check="' + i + '" aria-label="완료 표시">' + (on ? "✓" : "") + "</button>" +
          '<span class="check-text">' + esc(c.text) + "</span>" +
          (c.tel ? '<a class="check-call" href="' + telHref(c.tel) + '">📞 전화</a>' : "") +
        "</div>";
      }).join("") +
      '<p class="checks-sub">"확인 필요"로 남은 것 (1순위 기준)</p>' +
      needItems().map(function (n) {
        return '<div class="need-item"><b>' + esc(n.where) + "</b><br>" + esc(n.what) + "</div>";
      }).join("") +
    "</section>";
  }

  /* ── 마운트 ── */
  function mount(root) {
    if (!DATA) { root.innerHTML = '<div class="soon">일정 데이터를 불러오지 못했어요.</div>'; return; }
    var state = { day: load(STORE_DAY, 1), checks: load(STORE_CHECKS, {}) };
    if (!DATA.days.some(function (d) { return d.id === state.day; })) state.day = 1;

    var H = DATA.stay;
    root.innerHTML =
      '<div class="itin">' +
        '<section class="hero">' +
          '<span class="hero-kicker">THE 70TH BIRTHDAY TRIP · GYEONGJU</span>' +
          '<h1 class="hero-title">' + esc(DATA.title) + " · " + esc(DATA.dates) + "</h1>" +
          '<div class="hero-stay">🏡 <b>' + esc(H.name) + "</b><br>" + esc(H.address) +
            (H.phone ? ' · <a href="' + telHref(H.phone) + '">' + esc(H.phone) + "</a>" : "") + "<br>" +
            H.notes.map(esc).join("<br>") + "<br>" + esc(DATA.people) + "</div>" +
        "</section>" +
        '<div class="days" role="tablist">' + DATA.days.map(function (d) {
          return '<button class="day" type="button" role="tab" data-day="' + d.id + '"><span class="day-label">' + esc(d.label) + '</span><span class="day-sub">' + esc(d.sub) + "</span></button>";
        }).join("") + "</div>" +
        '<p class="day-summary" id="day-summary"></p>' +
        '<div class="timeline" id="timeline"></div>' +
        '<section class="mapcard">' +
          '<div class="mapcard-head"><span class="mapcard-title" id="map-title"></span><span class="mapcard-kicker">LEAFLET · OSM</span></div>' +
          '<div class="map" id="map"></div>' +
          '<div class="map-legend"><span>숙 = 숙소(대략 위치)</span><span>숫자 = 타임라인 번호</span><span>흐린 핀 = 2·3순위 후보</span></div>' +
          '<div class="legs" id="legs"></div>' +
        "</section>" +
        '<div id="checks"></div>' +
        '<p class="foot">정보 기준일 ' + esc(DATA.updated) + " · 네이버 검색 결과 기준이라 방문 전 전화 확인을 권해요.<br>차량 이동시간은 실제 경로가 아닌 거리 기반 추정치예요.</p>" +
      "</div>";

    initMap(root.querySelector("#map"));

    function renderDay() {
      var day = DATA.days.filter(function (d) { return d.id === state.day; })[0];
      root.querySelectorAll(".day").forEach(function (b) {
        var on = +b.dataset.day === day.id;
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", on);
      });
      root.querySelector("#day-summary").textContent = day.summary;
      root.querySelector("#timeline").innerHTML = day.stops.map(function (s, i) { return stopHtml(s, i, day, day.stops.length); }).join("");
      root.querySelector("#map-title").textContent = day.label + " · " + day.sub + " 동선";
      root.querySelector("#legs").innerHTML = day.legs.map(function (l) {
        return '<div class="leg"><span>' + esc(l[0]) + '</span><span class="leg-t">' + esc(l[1]) + "</span></div>";
      }).join("") + '<p class="legs-note">이동시간은 거리 기반 추정이에요.</p>';
      drawMap(day);
    }
    function renderChecks() { root.querySelector("#checks").innerHTML = checksHtml(state.checks); }

    root.addEventListener("click", function (e) {
      var t = e.target.closest("[data-day],[data-toggle],[data-check]");
      if (!t) return;
      if (t.dataset.day) {
        state.day = +t.dataset.day; save(STORE_DAY, state.day); renderDay();
      } else if (t.dataset.toggle) {
        var box = root.querySelector("#" + t.dataset.toggle);
        if (!box) return;
        box.hidden = !box.hidden;
        if (t.dataset.open) t.textContent = box.hidden ? t.dataset.closed : t.dataset.open;
      } else if (t.dataset.check) {
        state.checks[t.dataset.check] = !state.checks[t.dataset.check];
        save(STORE_CHECKS, state.checks); renderChecks();
      }
    });

    renderDay();
    renderChecks();
    return { refresh: function () { if (map) { map.invalidateSize(); } } };
  }

  window.Itinerary = { mount: mount };
})();
