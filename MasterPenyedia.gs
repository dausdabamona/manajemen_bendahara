/**
 * MasterPenyedia.gs
 * Data rekanan/penyedia untuk autocomplete nota & SSP.
 * Kolom: NO, NAMA_PENYEDIA, NPWP, ALAMAT, TERAKHIR_DIGUNAKAN, FREKUENSI
 * (tidak ada kolom soft-delete).
 */

var MasterPenyedia = (function () {

  function MC() { return Util.colMap(CONFIG.SHEETS.MASTER_PENYEDIA); }

  function getAll() {
    var c = MC();
    var data = SheetRepo.getData(CONFIG.SHEETS.MASTER_PENYEDIA);
    var out = [];
    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      if (!r[c.NAMA_PENYEDIA]) continue;
      out.push({ nama: r[c.NAMA_PENYEDIA], npwp: r[c.NPWP], alamat: r[c.ALAMAT] });
    }
    return out;
  }

  /** Simpan / update penyedia (key = nama, case-insensitive). */
  function simpan(p) {
    if (!p || !p.nama) throw new Error('Nama penyedia wajib diisi');
    var c = MC();
    var rows = findRows(CONFIG.SHEETS.MASTER_PENYEDIA, function (r) {
      return String(r[c.NAMA_PENYEDIA]).toLowerCase() === String(p.nama).toLowerCase();
    });

    if (rows.length) {
      var frek = Util.num(rows[0].values[c.FREKUENSI]) + 1;
      SheetRepo.setCells(CONFIG.SHEETS.MASTER_PENYEDIA, rows[0].rowIndex, Util.set(
        c.NPWP, p.npwp || '', c.ALAMAT, p.alamat || '',
        c.TERAKHIR_DIGUNAKAN, new Date(), c.FREKUENSI, frek));
      DeferredFlush.mark();
      return { success: true, updated: true };
    }

    SheetRepo.appendRow(CONFIG.SHEETS.MASTER_PENYEDIA, [
      _nextNo(c), p.nama, p.npwp || '', p.alamat || '', new Date(), 1
    ]);
    DeferredFlush.mark();
    return { success: true, updated: false };
  }

  function _nextNo(c) {
    var data = SheetRepo.getData(CONFIG.SHEETS.MASTER_PENYEDIA);
    var max = 0;
    for (var i = 0; i < data.length; i++) {
      var n = parseInt(data[i][c.NO], 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return max + 1;
  }

  /** Cari penyedia by keyword (nama/npwp). */
  function cari(keyword) {
    var kw = String(keyword || '').toLowerCase();
    if (!kw) return [];
    return getAll().filter(function (p) {
      return String(p.nama).toLowerCase().indexOf(kw) !== -1 ||
             String(p.npwp).toLowerCase().indexOf(kw) !== -1;
    });
  }

  return { getAll: getAll, simpan: simpan, cari: cari };
})();
