/**
 * Pengembalian.gs
 * Business logic pengembalian uang per transaksi (sheet "Pengembalian").
 */

var Pengembalian = (function () {

  function PC() { return Util.colMap(CONFIG.SHEETS.PENGEMBALIAN); }

  function getPengembalian(transactionId) {
    var p = PC();
    var rows = findRows(CONFIG.SHEETS.PENGEMBALIAN, function (r) {
      return String(r[p.NO_TRANSAKSI]) === String(transactionId) && !isDeleted(r[p.IS_DELETED]);
    });
    return rows.map(function (x) {
      var r = x.values;
      return {
        rowIndex: x.rowIndex,
        noTransaksi: r[p.NO_TRANSAKSI], urutan: r[p.URUTAN],
        tanggal: Util.fmtDate(r[p.TANGGAL]), nilai: Util.num(r[p.JUMLAH]),
        keterangan: r[p.KETERANGAN], refMasukNo: r[p.REF_MASUK_NO]
      };
    });
  }

  /**
   * Catat pengembalian + otomatis buat Transaksi Masuk (debet) ke kas
   * sejumlah nilai pengembalian, lalu tautkan No-nya ke baris pengembalian.
   */
  function tambahPengembalian(transactionId, data) {
    var p = PC();
    var nilai = Util.num(data.nilai);
    var urutan = getPengembalian(transactionId).length + 1;
    var tgl = data.tanggal ? new Date(data.tanggal) : new Date();

    var rowIndex = SheetRepo.appendRow(CONFIG.SHEETS.PENGEMBALIAN, [
      transactionId, urutan, tgl, nilai, data.keterangan || '',
      getOperator(), new Date(), FLAG_ACTIVE, '', '', ''
    ]);
    DeferredFlush.mark();

    // Buat transaksi masuk otomatis sejumlah pengembalian
    var asal = getRowByTransactionId(transactionId);
    var penjab = asal ? asal.values[CONFIG.COLS.PENJAB] : '';
    var kegAsal = asal ? asal.values[CONFIG.COLS.KEGIATAN] : '';
    var masuk = KasTunai.tambahTransaksi({
      tanggal: tgl, debet: nilai, kredit: 0, penjab: penjab,
      kegiatan: 'Pengembalian: ' + kegAsal,
      keterangan: 'Otomatis dari pengembalian transaksi No ' + transactionId +
                  (data.keterangan ? (' - ' + data.keterangan) : '')
    });

    SheetRepo.setCells(CONFIG.SHEETS.PENGEMBALIAN, rowIndex, Util.set(p.REF_MASUK_NO, masuk.no));
    DeferredFlush.mark();
    _recalc(transactionId);
    return { success: true, urutan: urutan, refMasukNo: masuk.no };
  }

  function hapusPengembalian(transactionId, urutan) {
    var p = PC();
    var hit = _findRow(transactionId, urutan, false);
    if (!hit) throw new Error('Pengembalian tidak ditemukan');
    softDelete(CONFIG.SHEETS.PENGEMBALIAN, hit.rowIndex, transactionId + '#' + urutan);
    _hapusMasukTerkait(hit.values[p.REF_MASUK_NO]);
    _recalc(transactionId);
    return { success: true };
  }

  function restorePengembalian(transactionId, urutan) {
    var p = PC();
    var hit = _findRow(transactionId, urutan, true);
    if (!hit) throw new Error('Pengembalian tidak ditemukan');
    restoreRecord(CONFIG.SHEETS.PENGEMBALIAN, hit.rowIndex, transactionId + '#' + urutan);
    _restoreMasukTerkait(hit.values[p.REF_MASUK_NO]);
    _recalc(transactionId);
    return { success: true };
  }

  /** Soft-delete transaksi masuk otomatis yang tertaut (bila ada). */
  function _hapusMasukTerkait(refNo) {
    if (!refNo) return;
    var ri = findRowByTransactionId(refNo);
    if (ri > 0) softDelete(CONFIG.SHEETS.KAS_TUNAI, ri, 'pengembalian-ref-' + refNo);
  }
  function _restoreMasukTerkait(refNo) {
    if (!refNo) return;
    var ri = findRowByTransactionId(refNo);
    if (ri > 0) restoreRecord(CONFIG.SHEETS.KAS_TUNAI, ri, 'pengembalian-ref-' + refNo);
  }

  function _findRow(transactionId, urutan, includeDeleted) {
    var p = PC();
    var rows = findRows(CONFIG.SHEETS.PENGEMBALIAN, function (r) {
      return String(r[p.NO_TRANSAKSI]) === String(transactionId) &&
             String(r[p.URUTAN]) === String(urutan) &&
             (includeDeleted || !isDeleted(r[p.IS_DELETED]));
    });
    return rows.length ? rows[0] : null;
  }

  /** Hitung ulang KEMBALIAN_JML & KEMBALIAN_TOTAL pada transaksi induk. */
  function _recalc(transactionId) {
    var list = getPengembalian(transactionId);
    var total = 0;
    for (var i = 0; i < list.length; i++) total += list[i].nilai;
    var u = Util.set(CONFIG.COLS.KEMBALIAN_JML, list.length, CONFIG.COLS.KEMBALIAN_TOTAL, total);
    // STATUS_SPJ lengkap bila nota + pengembalian menutupi uang muka
    var t = getRowByTransactionId(transactionId);
    if (t) {
      var kredit = Util.num(t.values[CONFIG.COLS.KREDIT]);
      var notaTotal = Util.num(t.values[CONFIG.COLS.NOTA_TOTAL]);
      var nilaiSpby = Util.num(t.values[CONFIG.COLS.NILAI_SPBY]);
      var target = nilaiSpby > 0 ? nilaiSpby : kredit;
      u[CONFIG.COLS.STATUS_SPJ] = ((notaTotal + total) >= target && target > 0) ? 'Lunas' : 'Belum';
    }
    updateByTransactionId(transactionId, u);
  }

  return {
    getPengembalian: getPengembalian,
    tambahPengembalian: tambahPengembalian,
    hapusPengembalian: hapusPengembalian,
    restorePengembalian: restorePengembalian
  };
})();
