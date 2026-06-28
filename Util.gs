/**
 * Util.gs
 * Helper kecil yang dipakai lintas modul (sebelumnya diduplikasi di
 * KasTunai/Pengembalian). Disatukan agar perubahan format/timezone cukup
 * diedit di satu tempat.
 */

var Util = (function () {

  /** Parse angka aman; non-numeric -> 0. */
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  /** Format tanggal -> 'yyyy-MM-dd'; string dibiarkan apa adanya. */
  function fmtDate(v) {
    if (!v) return '';
    if (v instanceof Date) {
      return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return String(v);
  }

  /** Array kosong sepanjang len (untuk membentuk baris baru). */
  function emptyRow(len) {
    var a = [];
    for (var i = 0; i < len; i++) a.push('');
    return a;
  }

  /** Bentuk objek updates {colIndex: val} dari pasangan col/val. */
  function set() {
    var o = {};
    for (var i = 0; i + 1 < arguments.length; i += 2) o[arguments[i]] = arguments[i + 1];
    return o;
  }

  /**
   * Peta nama-header -> index kolom (0-based) untuk sebuah sheet.
   * Diturunkan sekali dari CONFIG.HEADERS, lalu di-cache per-eksekusi.
   * Dengan ini tak ada modul yang perlu mengetik index kolom manual.
   * @param {string} sheetName  nama sheet (CONFIG.SHEETS.*)
   */
  function colMap(sheetName) {
    var key = '__colmap__' + sheetName;
    if (_ExecCache.has(key)) return _ExecCache.get(key);

    var headerKey = null;
    for (var k in CONFIG.SHEETS) {
      if (CONFIG.SHEETS[k] === sheetName) { headerKey = k; break; }
    }
    var headers = headerKey ? CONFIG.HEADERS[headerKey] : null;
    var map = {};
    if (headers) for (var i = 0; i < headers.length; i++) map[headers[i]] = i;
    return _ExecCache.set(key, map);
  }

  return { num: num, fmtDate: fmtDate, emptyRow: emptyRow, set: set, colMap: colMap };
})();
