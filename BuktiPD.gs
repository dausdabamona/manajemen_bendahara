/**
 * BuktiPD.gs
 * Bukti perjalanan dinas (tiket, boarding pass) per transaksi PD — sheet "Bukti Perjalanan".
 * Menerima gambar (sudah terkompresi dari frontend) maupun PDF (apa adanya). Relasi via NO_TRANSAKSI.
 * Kolom: NO_TRANSAKSI, URUTAN, FILE_ID, NAMA_FILE, URL_FILE, MIME, JENIS_DOK, WAKTU,
 *        KETERANGAN, IS_DELETED, DELETED_AT, DELETED_BY
 */
var BuktiPD = (function () {

  function BC() { return Util.colMap(CONFIG.SHEETS.BUKTI_PD); }

  function _isImg(mime) { return /^image\//.test(String(mime || '')); }

  function _toObj(c, r, withB64) {
    var o = {
      urutan: r[c.URUTAN], fileId: r[c.FILE_ID], namaFile: r[c.NAMA_FILE],
      url: r[c.URL_FILE], mime: r[c.MIME], jenisDok: r[c.JENIS_DOK],
      waktu: Util.fmtDate(r[c.WAKTU]), keterangan: r[c.KETERANGAN],
      isImg: _isImg(r[c.MIME])
    };
    if (withB64 && o.isImg && o.fileId) o.b64 = _dataUri(o.fileId);
    return o;
  }

  /** Daftar bukti aktif untuk satu transaksi. withB64=true → sertakan data URI gambar (untuk cetak). */
  function getBukti(noTransaksi, withB64) {
    var c = BC();
    var rows = findRows(CONFIG.SHEETS.BUKTI_PD, function (r) {
      return String(r[c.NO_TRANSAKSI]) === String(noTransaksi) && !isDeleted(r[c.IS_DELETED]);
    });
    return rows.map(function (x) { return _toObj(c, x.values, withB64); });
  }

  /** Map {noTransaksi: jumlahBuktiAktif}. */
  function getJmlPerTransaksi() {
    var c = BC();
    var data = SheetRepo.getData(CONFIG.SHEETS.BUKTI_PD);
    var map = {};
    for (var i = 0; i < data.length; i++) {
      if (isDeleted(data[i][c.IS_DELETED])) continue;
      var k = String(data[i][c.NO_TRANSAKSI]);
      map[k] = (map[k] || 0) + 1;
    }
    return map;
  }

  function _ext(mime) { return _isImg(mime) ? (String(mime).split('/')[1] || 'jpg') : 'pdf'; }

  /** Upload daftar bukti. fileArr: [{base64, mimeType, namaFile, jenisDok, keterangan}] */
  function uploadBukti(noTransaksi, fileArr) {
    var urutan = getBukti(noTransaksi).length;
    fileArr = fileArr || [];
    for (var i = 0; i < fileArr.length; i++) {
      var fdoc = fileArr[i], now = new Date();
      urutan++;
      var stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
      fdoc.namaFile = 'bukti_txn' + noTransaksi + '_' + urutan + '_' + stamp + '.' + _ext(fdoc.mimeType);
      var up = DriveHelper.upload(fdoc, {noTransaksi:noTransaksi});
      SheetRepo.appendRow(CONFIG.SHEETS.BUKTI_PD, [
        noTransaksi, urutan, up.fileId, up.namaFile, up.url, fdoc.mimeType || '',
        fdoc.jenisDok || '', now, fdoc.keterangan || '', FLAG_ACTIVE, '', ''
      ]);
    }
    DeferredFlush.mark();
    return { success: true, jml: urutan };
  }

  /** Soft-delete satu bukti (by urutan) + buang file Drive. */
  function hapusBukti(noTransaksi, urutan) {
    var c = BC();
    var rows = findRows(CONFIG.SHEETS.BUKTI_PD, function (r) {
      return String(r[c.NO_TRANSAKSI]) === String(noTransaksi) &&
             String(r[c.URUTAN]) === String(urutan) && !isDeleted(r[c.IS_DELETED]);
    });
    if (!rows.length) throw new Error('Bukti tidak ditemukan');
    var hit = rows[0], fileId = hit.values[c.FILE_ID];
    softDelete(CONFIG.SHEETS.BUKTI_PD, hit.rowIndex, noTransaksi + '#' + urutan);
    if (fileId) DriveHelper.trash(fileId);
    return { success: true };
  }

  /** Bungkus semua bukti aktif → satu file ZIP di Drive; kembalikan {url, jml}. */
  function zipBukti(noTransaksi, namaZip) {
    var list = getBukti(noTransaksi);
    if (!list.length) throw new Error('Belum ada bukti untuk diunduh');
    var blobs = [];
    for (var i = 0; i < list.length; i++) {
      try { blobs.push(DriveApp.getFileById(list[i].fileId).getBlob().setName(list[i].namaFile)); }
      catch (e) { Logger.log('[BuktiPD] zip skip ' + list[i].fileId + ': ' + e.message); }
    }
    if (!blobs.length) throw new Error('File bukti tidak dapat dibaca');
    var zip = Utilities.zip(blobs, namaZip || ('Bukti-PD-' + noTransaksi + '.zip'));
    var folder = DriveHelper.exportFolder();
    var f = folder.createFile(zip);
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
    return { url: 'https://drive.google.com/uc?export=download&id=' + f.getId(), jml: blobs.length };
  }

  function _dataUri(fileId) {
    try {
      var b = DriveApp.getFileById(fileId).getBlob();
      return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
    } catch (e) { return ''; }
  }

  /** Kembalikan semua bukti aktif dengan dataUri penuh (gambar & PDF) — untuk cetak SPJ. */
  function getBuktiForSpj(noTransaksi) {
    var c = BC();
    var rows = findRows(CONFIG.SHEETS.BUKTI_PD, function (r) {
      return String(r[c.NO_TRANSAKSI]) === String(noTransaksi) && !isDeleted(r[c.IS_DELETED]);
    });
    return rows.map(function (x) {
      var o = _toObj(c, x.values, false);
      if (o.fileId) o.dataUri = _dataUri(o.fileId);
      return o;
    });
  }

  return {
    getBukti: getBukti, getBuktiForSpj: getBuktiForSpj,
    getJmlPerTransaksi: getJmlPerTransaksi,
    uploadBukti: uploadBukti, hapusBukti: hapusBukti, zipBukti: zipBukti
  };
})();
