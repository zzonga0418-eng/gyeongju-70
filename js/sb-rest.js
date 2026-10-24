/* Supabase REST 최소 래퍼 (라이브러리 없이 fetch만). DB 함수 호출과 Storage 업로드. */
(function () {
  "use strict";

  var C = window.SITE_CONFIG || {};

  function ready() {
    return /^https:\/\//.test(C.supabaseUrl || "") && !!C.supabaseKey;
  }

  function headers(extra) {
    var h = { apikey: C.supabaseKey };
    // 예전 anon 키(JWT)는 Authorization에도 넣는다. 새 publishable 키(sb_…)는 apikey만.
    if (!/^sb_/.test(C.supabaseKey)) h.Authorization = "Bearer " + C.supabaseKey;
    for (var k in extra) h[k] = extra[k];
    return h;
  }

  function fail(r, body) {
    var msg = (body && (body.message || body.error)) || "HTTP " + r.status;
    var e = new Error(msg);
    e.status = r.status;
    throw e;
  }

  function rpc(name, args) {
    return fetch(C.supabaseUrl + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null;
        try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
        if (!r.ok) fail(r, d);
        return d;
      });
    });
  }

  function upload(bucket, path, blob, type) {
    return fetch(C.supabaseUrl + "/storage/v1/object/" + bucket + "/" + path, {
      method: "POST",
      headers: headers({ "Content-Type": type || blob.type || "application/octet-stream", "x-upsert": "false" }),
      body: blob
    }).then(function (r) {
      if (r.ok) return path;
      return r.text().then(function (t) {
        var d = null;
        try { d = JSON.parse(t); } catch (e) { d = { message: t }; }
        fail(r, d);
      });
    });
  }

  window.SB = { ready: ready, rpc: rpc, upload: upload };
})();
