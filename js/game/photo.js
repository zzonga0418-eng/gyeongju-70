/*
 * 사진 도구 — EXIF 촬영 시각 읽기(JPEG), 올리기 전에 줄이기, Storage 업로드.
 * 줄이면 EXIF가 사라지므로 촬영 시각은 반드시 줄이기 전에 읽는다.
 */
(function () {
  "use strict";

  var G = window.Game;
  if (!G) return;

  // JPEG APP1(Exif)에서 DateTimeOriginal(0x9003) 또는 DateTime(0x0132)을 찾는다. 없으면 null.
  function exifDate(buf) {
    var v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null;
    var off = 2;
    while (off + 4 < v.byteLength) {
      var marker = v.getUint16(off);
      var size = v.getUint16(off + 2);
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return readTiff(v, off + 10);
      if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
      off += 2 + size;
    }
    return null;
  }

  function readTiff(v, start) {
    var little = v.getUint16(start) === 0x4949;
    var u16 = function (o) { return v.getUint16(o, little); };
    var u32 = function (o) { return v.getUint32(o, little); };
    var found = {};
    function scan(dirOff) {
      if (dirOff + 2 > v.byteLength) return;
      var n = u16(dirOff);
      for (var i = 0; i < n; i++) {
        var e = dirOff + 2 + i * 12;
        if (e + 12 > v.byteLength) return;
        var tag = u16(e);
        if (tag === 0x8769) scan(start + u32(e + 8));          // Exif 하위 디렉터리
        else if (tag === 0x9003 || tag === 0x0132) {
          var p = start + u32(e + 8), s = "";
          for (var k = 0; k < 19 && p + k < v.byteLength; k++) s += String.fromCharCode(v.getUint8(p + k));
          found[tag] = s;
        }
      }
    }
    try { scan(start + u32(start + 4)); } catch (err) { return null; }
    var raw = found[0x9003] || found[0x0132];
    var m = raw && raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    // EXIF 시각은 시간대 정보가 없음 → 여행지(한국) 시간으로 본다
    return m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":" + m[6] + "+09:00";
  }

  G.readTakenAt = function (file) {
    if (!file || !/jpe?g/i.test(file.type || file.name)) return Promise.resolve(null);
    // 오래된 인앱 브라우저는 Blob.arrayBuffer가 없어서 FileReader 사용
    return new Promise(function (resolve) {
      var r = new FileReader();
      r.onload = function () { try { resolve(exifDate(r.result)); } catch (e) { resolve(null); } };
      r.onerror = function () { resolve(null); };
      r.readAsArrayBuffer(file.slice(0, 256 * 1024));
    });
  };

  // 긴 변을 max 픽셀로 줄인 JPEG
  G.shrinkPhoto = function (file, max) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error("사진 변환 실패")); }, "image/jpeg", 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("사진을 못 읽었어요")); };
      img.src = url;
    });
  };

  // 줄여서 media/m/무작위.jpg 로 올리고 경로를 돌려준다
  G.uploadPhoto = function (file, max) {
    var path = "m/" + G.randomName() + ".jpg";
    return G.shrinkPhoto(file, max || 1600).then(function (blob) {
      return SB.upload("media", path, blob, "image/jpeg");
    });
  };

  // 숨은 파일 선택창 열기. camera=true면 카메라를 바로 연다 (지원하는 폰에서)
  G.pickPhoto = function (camera) {
    return new Promise(function (resolve) {
      var inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      if (camera) inp.setAttribute("capture", "environment");
      inp.style.display = "none";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0];
        document.body.removeChild(inp);
        resolve(f || null);
      });
      document.body.appendChild(inp);
      inp.click();
    });
  };

  G.isTripDay = function (iso) { return !!iso && iso.slice(0, 10) === "2026-11-21"; };
})();
