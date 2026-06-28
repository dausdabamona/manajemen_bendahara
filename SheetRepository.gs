/**
 * SheetRepository.gs
 * Layer caching 3-tingkat + akses sheet terpusat.
 *
 *  1. _ExecCache  - cache per-eksekusi (in-memory, hidup selama 1 request).
 *  2. AppCache    - CacheService (lintas eksekusi, max 6 jam, 100KB/key).
 *  3. SheetRepo   - pembaca/penulis sheet yang memakai _ExecCache.
 *
 * DeferredFlush menahan SpreadsheetApp.flush() agar hanya dipanggil sekali
 * di akhir request demi performa (GAS timeout 6 menit).
 */

/* ============================================================
 * 1. _ExecCache - cache in-memory selama satu eksekusi
 * ============================================================ */
var _ExecCache = (function () {
  var store = {};
  return {
    get: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    set: function (key, value) { store[key] = value; return value; },
    has: function (key) { return Object.prototype.hasOwnProperty.call(store, key); },
    del: function (key) { delete store[key]; },
    clear: function () { store = {}; }
  };
})();

/* ============================================================
 * 2. AppCache - wrapper CacheService (lintas eksekusi)
 * ============================================================ */
var AppCache = (function () {
  var TTL = 21600; // 6 jam (maksimum GAS)
  function svc() { return CacheService.getScriptCache(); }

  return {
    get: function (key) {
      try {
        var raw = svc().get(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        Logger.log('[AppCache] get error: ' + e.message);
        return null;
      }
    },
    put: function (key, value, ttl) {
      try {
        svc().put(key, JSON.stringify(value), ttl || TTL);
      } catch (e) {
        // Nilai > 100KB tidak bisa dicache; abaikan diam-diam.
        Logger.log('[AppCache] put skipped (' + key + '): ' + e.message);
      }
    },
    remove: function (key) {
      try { svc().remove(key); } catch (e) {}
    },
    removeAll: function (keys) {
      try { svc().removeAll(keys); } catch (e) {}
    }
  };
})();

/* ============================================================
 * 3. SheetRepo - akses sheet terpusat dengan _ExecCache
 * ============================================================ */
var SheetRepo = (function () {

  function ss() {
    if (_ExecCache.has('__ss__')) return _ExecCache.get('__ss__');
    return _ExecCache.set('__ss__', SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID));
  }

  /** Ambil sheet by nama; buat + isi header bila belum ada. */
  function sheet(name) {
    var key = '__sheet__' + name;
    if (_ExecCache.has(key)) return _ExecCache.get(key);

    var sh = ss().getSheetByName(name);
    if (!sh) {
      sh = ss().insertSheet(name);
      var headerKey = _headerKeyByName(name);
      if (headerKey && CONFIG.HEADERS[headerKey]) {
        var hdr = CONFIG.HEADERS[headerKey];
        sh.getRange(1, 1, 1, hdr.length).setValues([hdr]);
        sh.setFrozenRows(1);
      }
    }
    return _ExecCache.set(key, sh);
  }

  function _headerKeyByName(name) {
    var s = CONFIG.SHEETS;
    for (var k in s) {
      if (s[k] === name) return k;
    }
    return null;
  }

  /** Baca seluruh data (tanpa header) sebagai array 2D, dengan _ExecCache. */
  function getData(name) {
    var key = '__data__' + name;
    if (_ExecCache.has(key)) return _ExecCache.get(key);

    var sh = sheet(name);
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return _ExecCache.set(key, []);

    var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    return _ExecCache.set(key, values);
  }

  /** Tambah satu baris di akhir sheet. Mengembalikan nomor baris (1-based). */
  function appendRow(name, rowArr) {
    var sh = sheet(name);
    sh.appendRow(rowArr);
    invalidate(name);
    return sh.getLastRow();
  }

  /** Tulis ulang satu baris penuh (1-based rowIndex). */
  function setRow(name, rowIndex, rowArr) {
    var sh = sheet(name);
    sh.getRange(rowIndex, 1, 1, rowArr.length).setValues([rowArr]);
    invalidate(name);
  }

  /**
   * Update beberapa sel pada satu baris: updates = {colIndex0based: value}.
   * Ditulis dalam satu setValues() pada rentang min..max kolom (1 baca + 1 tulis)
   * alih-alih setValue per sel, demi hemat kuota Sheets.
   */
  function setCells(name, rowIndex, updates) {
    var cols = [];
    for (var c in updates) cols.push(parseInt(c, 10));
    if (!cols.length) return;

    var min = Math.min.apply(null, cols);
    var max = Math.max.apply(null, cols);
    var range = sheet(name).getRange(rowIndex, min + 1, 1, max - min + 1);
    var rowVals = range.getValues()[0];
    for (var i = 0; i < cols.length; i++) rowVals[cols[i] - min] = updates[cols[i]];
    range.setValues([rowVals]);
    invalidate(name);
  }

  /** Hapus cache _ExecCache untuk sheet tertentu (dipanggil setelah write). */
  function invalidate(name) {
    _ExecCache.del('__data__' + name);
  }

  // Akronim yang tetap huruf besar saat membuat label header ramah-baca.
  var _HDR_ACRONYM = { ID:1, URL:1, NPWP:1, NIP:1, SPBY:1, SPJ:1, PPK:1, KPA:1,
                       JSON:1, LAT:1, LNG:1, PD:1, DIPA:1 };

  /** Ubah token CONFIG.HEADERS (mis. 'KUITANSI_FILE_ID') jadi label rapi ('Kuitansi File ID'). */
  function _friendlyHeader(token) {
    var parts = String(token || '').split('_');
    for (var i = 0; i < parts.length; i++) {
      var w = parts[i];
      if (!w) continue;
      parts[i] = _HDR_ACRONYM[w] ? w
               : (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    }
    return parts.join(' ');
  }

  /**
   * Isi label header yang KOSONG pada baris 1 tiap sheet (sesuai CONFIG.HEADERS),
   * tanpa menimpa label yang sudah ada. Idempotent. Kembalikan jumlah sheet diperbaiki.
   */
  /** Perluas sheet ke minimal `minCols` kolom (idempotent). */
  function ensureMinCols(name, minCols) {
    var sh = ss().getSheetByName(name);
    if (sh && sh.getMaxColumns() < minCols) {
      sh.insertColumnsAfter(sh.getMaxColumns(), minCols - sh.getMaxColumns());
    }
  }

  function ensureHeaders() {
    var changed = 0;
    for (var key in CONFIG.SHEETS) {
      var name = CONFIG.SHEETS[key];
      var hdr = CONFIG.HEADERS[key];
      if (!hdr || !hdr.length) continue;
      var sh = ss().getSheetByName(name);
      if (!sh) continue; // jangan buat sheet baru di sini
      // Perluas kolom bila perlu sebelum membaca header (hindari out-of-bounds)
      if (sh.getMaxColumns() < hdr.length) {
        sh.insertColumnsAfter(sh.getMaxColumns(), hdr.length - sh.getMaxColumns());
      }
      var range = sh.getRange(1, 1, 1, hdr.length);
      var row = range.getValues()[0];
      var dirty = false;
      for (var i = 0; i < hdr.length; i++) {
        if (row[i] === '' || row[i] === null) { row[i] = _friendlyHeader(hdr[i]); dirty = true; }
      }
      if (dirty) { range.setValues([row]); sh.setFrozenRows(1); changed++; }
    }
    if (changed) SpreadsheetApp.flush();
    return changed;
  }

  return {
    ss: ss,
    sheet: sheet,
    getData: getData,
    appendRow: appendRow,
    setRow: setRow,
    setCells: setCells,
    invalidate: invalidate,
    ensureHeaders: ensureHeaders,
    ensureMinCols: ensureMinCols
  };
})();

/* ============================================================
 * 4. DeferredFlush - flush sekali di akhir + invalidasi cache
 * ============================================================ */
var DeferredFlush = (function () {
  var pending = false;

  return {
    /** Tandai bahwa ada perubahan yang menunggu flush. */
    mark: function () { pending = true; },

    /** Flush + invalidasi AppCache untuk daftar key (atau semua sheet). */
    commitAndInvalidate: function (cacheKeys) {
      if (pending) {
        SpreadsheetApp.flush();
        pending = false;
      }
      if (cacheKeys && cacheKeys.length) {
        AppCache.removeAll(cacheKeys);
      }
      // Bersihkan cache per-eksekusi agar pembacaan berikutnya fresh.
      _ExecCache.clear();
    }
  };
})();
