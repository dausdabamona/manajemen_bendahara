/**
 * FotoNota.gs
 * Modul foto per nota (sheet "Foto Nota") dengan geotagging.
 * Relasi ke nota lewat NO_TRANSAKSI + NOTA_ID.
 * Kolom: NO_TRANSAKSI, NOTA_ID, URUTAN, FILE_ID, NAMA_FILE, URL_FILE,
 *        LAT, LNG, LOKASI, MAPS_URL, WAKTU, KETERANGAN, IS_DELETED, DELETED_AT, DELETED_BY
 * Foto dikirim dari frontend sudah terkompresi; lat/lng dari GPS browser.
 */

var FotoNota = (function () {

  function FC() { return Util.colMap(CONFIG.SHEETS.FOTO_NOTA); }

  /** Map {noTransaksi: jumlahFotoAktif} untuk semua transaksi. */
  function getJmlFotoPerTransaksi() {
    var c = FC();
    var data = SheetRepo.getData(CONFIG.SHEETS.FOTO_NOTA);
    var map = {};
    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      if (isDeleted(r[c.IS_DELETED])) continue;
      var key = String(r[c.NO_TRANSAKSI]);
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }

  function _toObj(c, r, rowIndex) {
    return {
      rowIndex: rowIndex,
      noTransaksi: r[c.NO_TRANSAKSI], notaId: r[c.NOTA_ID], urutan: r[c.URUTAN],
      fileId: r[c.FILE_ID], namaFile: r[c.NAMA_FILE], urlFile: r[c.URL_FILE],
      lat: r[c.LAT], lng: r[c.LNG], lokasi: r[c.LOKASI], mapsUrl: r[c.MAPS_URL],
      waktu: Util.fmtDate(r[c.WAKTU]), keterangan: r[c.KETERANGAN]
    };
  }

  /** Daftar foto untuk satu nota tertentu. */
  function getFotoNota(noTransaksi, notaId) {
    var c = FC();
    var rows = findRows(CONFIG.SHEETS.FOTO_NOTA, function (r) {
      return String(r[c.NO_TRANSAKSI]) === String(noTransaksi) &&
             String(r[c.NOTA_ID]) === String(notaId) && !isDeleted(r[c.IS_DELETED]);
    });
    return rows.map(function (x) { return _toObj(c, x.values, x.rowIndex); });
  }

  /** Format URL Maps dari lat/lng. */
  function _mapsUrl(lat, lng) {
    if (lat === '' || lng === '' || lat == null || lng == null) return '';
    return 'https://maps.google.com/?q=' + lat + ',' + lng;
  }

  /** Nama file standar: fn_txn{no}_nota{notaId}_{urutan}_{yyyymmdd}_{hhmmss}.jpg */
  function _namaFile(noTransaksi, notaId, urutan, when) {
    var stamp = Utilities.formatDate(when, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
    return 'fn_txn' + noTransaksi + '_nota' + notaId + '_' + urutan + '_' + stamp + '.jpg';
  }

  /**
   * Upload daftar foto untuk satu nota.
   * @param fotoArr array of {base64, mimeType, lat, lng, keterangan}
   */
  function uploadFotoNota(noTransaksi, notaId, fotoArr) {
    var urutan = getFotoNota(noTransaksi, notaId).length;
    for (var i = 0; i < fotoArr.length; i++) {
      var foto = fotoArr[i];
      var now = new Date();
      urutan++;
      foto.namaFile = _namaFile(noTransaksi, notaId, urutan, now);
      var up = DriveHelper.upload(foto, {noTransaksi:noTransaksi});
      var lat = (foto.lat == null ? '' : foto.lat);
      var lng = (foto.lng == null ? '' : foto.lng);
      var lokasi = (lat !== '' && lng !== '') ? (lat + ',' + lng) : '';
      SheetRepo.appendRow(CONFIG.SHEETS.FOTO_NOTA, [
        noTransaksi, notaId, urutan, up.fileId, up.namaFile, up.url,
        lat, lng, lokasi, _mapsUrl(lat, lng), now, foto.keterangan || '',
        FLAG_ACTIVE, '', ''
      ]);
    }
    DeferredFlush.mark();
    return { success: true, jml: urutan };
  }

  /** Soft delete satu foto nota berdasarkan urutan. */
  function hapusFotoNota(noTransaksi, notaId, urutan) {
    var c = FC();
    var rows = findRows(CONFIG.SHEETS.FOTO_NOTA, function (r) {
      return String(r[c.NO_TRANSAKSI]) === String(noTransaksi) &&
             String(r[c.NOTA_ID]) === String(notaId) &&
             String(r[c.URUTAN]) === String(urutan) && !isDeleted(r[c.IS_DELETED]);
    });
    if (!rows.length) throw new Error('Foto nota tidak ditemukan');
    var hit = rows[0];
    var fileId = hit.values[c.FILE_ID];
    softDelete(CONFIG.SHEETS.FOTO_NOTA, hit.rowIndex, noTransaksi + '#' + notaId + '#' + urutan);
    if (fileId) DriveHelper.trash(fileId);
    return { success: true };
  }

  /**
   * Ambil semua nota + foto-nya untuk satu transaksi sekaligus.
   * @return {{notas:Array, fotoPerNota:Object}}
   */
  function getNotaDanFoto(noTransaksi) {
    var c = FC();
    var notas = KasTunai.getMultiNota(noTransaksi);
    var fotoData = SheetRepo.getData(CONFIG.SHEETS.FOTO_NOTA);
    var fotoPerNota = {};

    for (var i = 0; i < fotoData.length; i++) {
      var r = fotoData[i];
      if (isDeleted(r[c.IS_DELETED])) continue;
      if (String(r[c.NO_TRANSAKSI]) !== String(noTransaksi)) continue;
      var nid = String(r[c.NOTA_ID]);
      if (!fotoPerNota[nid]) fotoPerNota[nid] = [];
      fotoPerNota[nid].push(_toObj(c, r, i + 2));
    }
    return { notas: notas, fotoPerNota: fotoPerNota };
  }

  /** Data SPJ: nota + foto per nota + peta gambar base64 (untuk cetak). */
  function getSpjData(noTransaksi) {
    var nd = getNotaDanFoto(noTransaksi);
    var imgB64 = {};
    var i, j;
    for (i = 0; i < nd.notas.length; i++) {
      var fid = nd.notas[i].fileId;
      if (fid && !imgB64[fid]) imgB64[fid] = _imgDataUri(fid);
      // foto per item rincian barang (persediaan)
      var det = nd.notas[i].detail || [];
      for (var d = 0; d < det.length; d++) {
        var dfid = det[d].fileId;
        if (dfid && !imgB64[dfid]) imgB64[dfid] = _imgDataUri(dfid);
      }
    }
    for (var nid in nd.fotoPerNota) {
      var arr = nd.fotoPerNota[nid];
      for (j = 0; j < arr.length; j++) {
        var ff = arr[j].fileId;
        if (ff && !imgB64[ff]) imgB64[ff] = _imgDataUri(ff);
      }
    }
    var buktiPD = BuktiPD.getBuktiForSpj(noTransaksi);
    return { notas: nd.notas, fotoPerNota: nd.fotoPerNota, imgB64: imgB64, buktiPD: buktiPD };
  }

  /** Baca file Drive -> data URI base64; '' bila gagal (frontend fallback). */
  function _imgDataUri(fileId) {
    try {
      var b = DriveApp.getFileById(fileId).getBlob();
      return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
    } catch (e) {
      Logger.log('[FotoNota] _imgDataUri gagal (' + fileId + '): ' + e.message);
      return '';
    }
  }

  return {
    getJmlFotoPerTransaksi: getJmlFotoPerTransaksi,
    getFotoNota: getFotoNota,
    uploadFotoNota: uploadFotoNota,
    hapusFotoNota: hapusFotoNota,
    getNotaDanFoto: getNotaDanFoto,
    getSpjData: getSpjData
  };
})();
