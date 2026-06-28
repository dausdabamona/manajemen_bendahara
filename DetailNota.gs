/**
 * DetailNota.gs
 * Rincian barang per nota (sheet "Detail Nota") untuk belanja persediaan,
 * dengan foto tagging per item (1 foto per jenis barang) + geotag.
 * Relasi ke nota lewat NO_TRANSAKSI + NOTA_URUTAN; URUTAN = nomor item dalam nota.
 */
var DetailNota = (function () {

  function DC() { return Util.colMap(CONFIG.SHEETS.DETAIL_NOTA); }

  function _mapsUrl(lat, lng) {
    if (lat === '' || lng === '' || lat == null || lng == null) return '';
    return 'https://maps.google.com/?q=' + lat + ',' + lng;
  }

  function _toObj(c, r) {
    return {
      urutan: r[c.URUTAN], namaBarang: r[c.NAMA_BARANG], qty: Util.num(r[c.QTY]),
      satuan: r[c.SATUAN], hargaSatuan: Util.num(r[c.HARGA_SATUAN]),
      subtotal: Util.num(r[c.SUBTOTAL]), keterangan: r[c.KETERANGAN],
      notaUrutan: r[c.NOTA_URUTAN], fileId: r[c.FILE_ID], namaFile: r[c.NAMA_FILE],
      urlFile: r[c.URL_FILE], lat: r[c.LAT], lng: r[c.LNG], mapsUrl: r[c.MAPS_URL],
      waktu: Util.fmtDate(r[c.WAKTU])
    };
  }

  /** Item aktif untuk satu nota tertentu (urut menaik). */
  function get(noTransaksi, notaUrutan) {
    var c = DC();
    var rows = findRows(CONFIG.SHEETS.DETAIL_NOTA, function (r) {
      return String(r[c.NO_TRANSAKSI]) === String(noTransaksi) &&
             String(r[c.NOTA_URUTAN]) === String(notaUrutan) && !isDeleted(r[c.IS_DELETED]);
    });
    return rows.map(function (x) { return _toObj(c, x.values); })
      .sort(function (a, b) { return (+a.urutan || 0) - (+b.urutan || 0); });
  }

  /** Semua item aktif untuk satu transaksi (untuk SPJ). */
  function getByTransaksi(noTransaksi) {
    var c = DC();
    var rows = findRows(CONFIG.SHEETS.DETAIL_NOTA, function (r) {
      return String(r[c.NO_TRANSAKSI]) === String(noTransaksi) && !isDeleted(r[c.IS_DELETED]);
    });
    return rows.map(function (x) { return _toObj(c, x.values); });
  }

  function _softDeleteAll(noTransaksi, notaUrutan) {
    var c = DC();
    var rows = findRows(CONFIG.SHEETS.DETAIL_NOTA, function (r) {
      return String(r[c.NO_TRANSAKSI]) === String(noTransaksi) &&
             String(r[c.NOTA_URUTAN]) === String(notaUrutan) && !isDeleted(r[c.IS_DELETED]);
    });
    for (var i = 0; i < rows.length; i++) {
      softDelete(CONFIG.SHEETS.DETAIL_NOTA, rows[i].rowIndex, noTransaksi + '#nota' + notaUrutan);
    }
  }

  /** Total subtotal dari array item (dipakai utk nominal nota). */
  function totalItems(items) {
    var t = 0;
    items = items || [];
    for (var i = 0; i < items.length; i++) t += Util.num(items[i].qty) * Util.num(items[i].hargaSatuan);
    return t;
  }

  /**
   * Simpan ulang item untuk satu nota (hapus lama → tulis baru).
   * @param items array of {namaBarang, qty, satuan, hargaSatuan, keterangan,
   *               foto?{base64,mimeType,namaFile,lat,lng}, fileId?,urlFile?,namaFile?,lat?,lng?}
   */
  function save(noTransaksi, notaUrutan, items) {
    items = items || [];
    _softDeleteAll(noTransaksi, notaUrutan);
    var total = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var qty = Util.num(it.qty), harga = Util.num(it.hargaSatuan), sub = qty * harga;
      total += sub;
      var fileId = '', namaFile = '', url = '', lat = '', lng = '';
      if (it.foto && it.foto.base64) {
        var up = DriveHelper.upload({
          base64: it.foto.base64, mimeType: it.foto.mimeType || 'image/jpeg',
          namaFile: it.foto.namaFile || ('item_t' + noTransaksi + '_n' + notaUrutan + '_' + (i + 1) + '.jpg')
        }, { noTransaksi: noTransaksi });
        fileId = up.fileId; namaFile = up.namaFile; url = up.url;
        lat = (it.foto.lat == null ? '' : it.foto.lat);
        lng = (it.foto.lng == null ? '' : it.foto.lng);
      } else if (it.fileId) {
        fileId = it.fileId; namaFile = it.namaFile || ''; url = it.urlFile || '';
        lat = (it.lat == null ? '' : it.lat); lng = (it.lng == null ? '' : it.lng);
      }
      SheetRepo.appendRow(CONFIG.SHEETS.DETAIL_NOTA, [
        noTransaksi, 0, i + 1, it.namaBarang || '', qty, it.satuan || '', harga, sub, it.keterangan || '',
        notaUrutan, fileId, namaFile, url, lat, lng, _mapsUrl(lat, lng), new Date(),
        FLAG_ACTIVE, '', ''
      ]);
    }
    DeferredFlush.mark();
    return { jml: items.length, total: total };
  }

  return { get: get, getByTransaksi: getByTransaksi, save: save, totalItems: totalItems };
})();
