/**
 * KasTunai.gs
 * Business logic transaksi utama, multi-nota, dan foto barang.
 * Dipanggil oleh wrapper server* di Code.gs.
 */

var KasTunai = (function () {

  var C = CONFIG.COLS;                              // Kas Tunai
  function NC() { return Util.colMap(CONFIG.SHEETS.MULTI_NOTA); }
  function FBC() { return Util.colMap(CONFIG.SHEETS.FOTO_BARANG); }

  /* -------------------------------------------------------- *
   * Mapping baris -> objek transaksi
   * -------------------------------------------------------- */
  function rowToObj(row, rowIndex) {
    return {
      rowIndex:        rowIndex,
      no:              row[C.NO],
      tanggal:         Util.fmtDate(row[C.TANGGAL]),
      kegiatan:        row[C.KEGIATAN],
      penjab:          row[C.PENJAB],
      debet:           Util.num(row[C.DEBET]),
      kredit:          Util.num(row[C.KREDIT]),
      saldo:           Util.num(row[C.SALDO]),
      keterangan:      row[C.KETERANGAN],
      fileId:          row[C.FILE_ID],
      namaFile:        row[C.NAMA_FILE],
      urlFile:         row[C.URL_FILE],
      statusSpj:       row[C.STATUS_SPJ],
      tglNota:         Util.fmtDate(row[C.TGL_NOTA]),
      fotoBarangJml:   Util.num(row[C.FOTO_BARANG_JML]),
      notaJml:         Util.num(row[C.NOTA_JML]),
      notaTotal:       Util.num(row[C.NOTA_TOTAL]),
      uangDiserahkan:  Util.num(row[C.UANG_DISERAHKAN]),
      kembalianJml:    Util.num(row[C.KEMBALIAN_JML]),
      kembalianTotal:  Util.num(row[C.KEMBALIAN_TOTAL]),
      noSpby:          row[C.NO_SPBY],
      tglSpby:         Util.fmtDate(row[C.TGL_SPBY]),
      nilaiSpby:       Util.num(row[C.NILAI_SPBY]),
      kuitansiFileId:  row[C.KUITANSI_FILE_ID],
      kuitansiUrl:     row[C.KUITANSI_URL],
      sumber:          (String(row[C.SUMBER]||'').toUpperCase()==='BANK') ? 'BANK' : 'TUNAI',
      refTransfer:     row[C.REF_TRANSFER] || '',
      akun:            row[C.AKUN] || '',
      persediaan:      String(row[C.PERSEDIAAN]||'').toUpperCase()==='Y',
      pajakKatIdx:     (row[C.PAJAK_KATEGORI_IDX] !== '' && row[C.PAJAK_KATEGORI_IDX] != null) ? Util.num(row[C.PAJAK_KATEGORI_IDX]) : null,
      pajakPph:        Util.num(row[C.PAJAK_PPH]),
      pajakPpn:        Util.num(row[C.PAJAK_PPN]),
      pajakDpp:        Util.num(row[C.PAJAK_DPP])
    };
  }
  /** true bila baris adalah pemindahan dana antar kas (Pindah Dana), bukan belanja riil. */
  function _isTransfer(row) {
    return String(row[C.REF_TRANSFER] || '').indexOf('TF-') === 0;
  }

  /* -------------------------------------------------------- *
   * Ambil daftar transaksi aktif, recompute saldo berjalan
   * -------------------------------------------------------- */
  function getTransaksi() {
    var data = SheetRepo.getData(CONFIG.SHEETS.KAS_TUNAI);
    var out = [];
    var saldoTunai = CONFIG.SALDO_AWAL;
    var saldoBank  = Util.num(CONFIG.SALDO_AWAL_BANK);

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (isDeleted(row[C.IS_DELETED])) continue;
      var obj = rowToObj(row, i + 2);
      // Saldo berjalan per SUMBER = +debet (masuk) - kredit (keluar).
      if (obj.sumber === 'BANK') {
        saldoBank += obj.debet - obj.kredit;
        obj.saldo = saldoBank;
      } else {
        saldoTunai += obj.debet - obj.kredit;
        obj.saldo = saldoTunai;
      }
      obj.transfer = _isTransfer(row);
      out.push(obj);
    }
    return out;
  }

  /** Ringkasan saldo untuk header dashboard. */
  function ringkasanSaldo() {
    var data = SheetRepo.getData(CONFIG.SHEETS.KAS_TUNAI);
    var tunai = CONFIG.SALDO_AWAL, bank = Util.num(CONFIG.SALDO_AWAL_BANK);
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (isDeleted(row[C.IS_DELETED])) continue;
      var d = Util.num(row[C.DEBET]) - Util.num(row[C.KREDIT]);
      if (String(row[C.SUMBER]||'').toUpperCase()==='BANK') bank += d; else tunai += d;
    }
    return { saldoTunai: tunai, saldoBank: bank, saldoTotal: tunai + bank };
  }

  /* -------------------------------------------------------- *
   * Tambah transaksi baru
   * -------------------------------------------------------- */
  function tambahTransaksi(data) {
    if (!data) throw new Error('Data transaksi kosong');

    var no = nextTransactionNo();
    var row = Util.emptyRow(CONFIG.HEADERS.KAS_TUNAI.length);
    row[C.NO]         = no;
    row[C.TANGGAL]    = data.tanggal ? new Date(data.tanggal) : new Date();
    row[C.KEGIATAN]   = data.kegiatan || '';
    row[C.PENJAB]     = data.penjab || '';
    row[C.DEBET]      = Util.num(data.debet);
    row[C.KREDIT]     = Util.num(data.kredit);
    row[C.SALDO]      = '';            // dihitung ulang saat getTransaksi
    row[C.KETERANGAN] = data.keterangan || '';
    row[C.STATUS_SPJ] = 'Belum';
    row[C.NOTA_JML]   = 0;
    row[C.NOTA_TOTAL] = 0;
    row[C.FOTO_BARANG_JML] = 0;
    row[C.KEMBALIAN_JML]   = 0;
    row[C.KEMBALIAN_TOTAL] = 0;
    row[C.IS_DELETED] = FLAG_ACTIVE;
    row[C.SUMBER]       = (String(data.sumber||'').toUpperCase()==='BANK') ? 'BANK' : 'TUNAI';
    row[C.REF_TRANSFER] = data.refTransfer || '';
    row[C.AKUN]         = data.akun || '';
    row[C.PERSEDIAAN]   = data.persediaan ? 'Y' : '';

    SheetRepo.appendRow(CONFIG.SHEETS.KAS_TUNAI, row);
    DeferredFlush.mark();
    AuditLog.write('CREATE', CONFIG.SHEETS.KAS_TUNAI, no, 'kegiatan: ' + (data.kegiatan || ''));
    return { success: true, no: no };
  }

  /* -------------------------------------------------------- *
   * Pindah Dana antar kas (Bank <-> Tunai). Membuat sepasang baris
   * tertaut (REF_TRANSFER sama): KREDIT di sumber asal, DEBET di tujuan.
   * arah: 'BANK_TUNAI' (tarik tunai) | 'TUNAI_BANK' (setor).
   * -------------------------------------------------------- */
  function pindahDana(arah, nominal, tanggal, keterangan) {
    var n = Util.num(nominal);
    if (n <= 0) throw new Error('Nominal pindah dana harus > 0');
    var dari = (arah === 'TUNAI_BANK') ? 'TUNAI' : 'BANK';
    var ke   = (arah === 'TUNAI_BANK') ? 'BANK'  : 'TUNAI';
    var ref  = 'TF-' + (new Date()).getTime();
    var ket  = keterangan || ((dari==='BANK'?'Tarik tunai dari bank':'Setor tunai ke bank'));
    // Baris keluar dari sumber asal
    tambahTransaksi({ tanggal: tanggal, debet: 0, kredit: n, sumber: dari,
      refTransfer: ref, kegiatan: 'Pindah Dana ('+dari+'→'+ke+')', keterangan: ket });
    // Baris masuk ke sumber tujuan
    tambahTransaksi({ tanggal: tanggal, debet: n, kredit: 0, sumber: ke,
      refTransfer: ref, kegiatan: 'Pindah Dana ('+dari+'→'+ke+')', keterangan: ket });
    return { success: true, ref: ref };
  }

  /* -------------------------------------------------------- *
   * Update field inti transaksi (tanggal/kegiatan/penjab/debet/kredit/keterangan).
   * Saldo otomatis dihitung ulang saat getTransaksi, jadi tak perlu recalc.
   * -------------------------------------------------------- */
  function updateTransaksi(no, data) {
    var upd = Util.set(
      C.TANGGAL,    data.tanggal ? new Date(data.tanggal) : new Date(),
      C.DEBET,      Util.num(data.debet),
      C.KREDIT,     Util.num(data.kredit),
      C.PENJAB,     data.penjab || '',
      C.KEGIATAN,   data.kegiatan || '',
      C.KETERANGAN, data.keterangan || '');
    if (data.sumber) upd[C.SUMBER] = (String(data.sumber).toUpperCase()==='BANK') ? 'BANK' : 'TUNAI';
    if (data.akun !== undefined) upd[C.AKUN] = data.akun || '';
    if (data.persediaan !== undefined) upd[C.PERSEDIAAN] = data.persediaan ? 'Y' : '';
    var ok = updateByTransactionId(no, upd);
    if (ok) AuditLog.write('UPDATE', CONFIG.SHEETS.KAS_TUNAI, no, 'kegiatan: ' + (data.kegiatan || ''));
    return { success: ok, no: no };
  }

  /** Soft-delete satu transaksi by NO. */
  function hapusTransaksi(no) {
    var ok = updateByTransactionId(no, Util.set(
      C.IS_DELETED, FLAG_DELETED, C.DELETED_AT, new Date(), C.DELETED_BY, getOperator()));
    if (ok) AuditLog.write('DELETE', CONFIG.SHEETS.KAS_TUNAI, no, 'soft delete');
    return { success: ok };
  }

  /** Cari NO transaksi (aktif) berdasarkan REF_TRANSFER + sumber tertentu, atau null. */
  function findByRef(ref, sumber) {
    if (!ref) return null;
    var data = SheetRepo.getData(CONFIG.SHEETS.KAS_TUNAI);
    for (var i = 0; i < data.length; i++) {
      if (isDeleted(data[i][C.IS_DELETED])) continue;
      if (String(data[i][C.REF_TRANSFER]) === String(ref) &&
          (!sumber || String(data[i][C.SUMBER]||'').toUpperCase() === sumber)) return data[i][C.NO];
    }
    return null;
  }

  /* -------------------------------------------------------- *
   * Multi Nota
   * -------------------------------------------------------- */
  function getMultiNota(transactionId) {
    var n = NC();
    var rows = findRows(CONFIG.SHEETS.MULTI_NOTA, function (r) {
      return String(r[n.NO_TRANSAKSI]) === String(transactionId) && !isDeleted(r[n.IS_DELETED]);
    });
    return rows.map(function (x) {
      var r = x.values;
      var detail = DetailNota.get(transactionId, r[n.URUTAN]);
      return {
        rowIndex: x.rowIndex,
        noTransaksi: r[n.NO_TRANSAKSI], urutan: r[n.URUTAN], namaPenyedia: r[n.NAMA_NOTA],
        npwp: r[n.NPWP_PENYEDIA], alamat: r[n.ALAMAT_PENYEDIA],
        noNota: '', tglNota: Util.fmtDate(r[n.TGL_NOTA] || r[n.TGL_UPLOAD]), nilai: Util.num(r[n.NOMINAL]),
        keterangan: '', fileId: r[n.FILE_ID], namaFile: r[n.NAMA_FILE], urlFile: r[n.URL_FILE],
        detail: detail, jmlItem: detail.length
      };
    });
  }

  function tambahNota(transactionId, notaData) {
    var urutan = getMultiNota(transactionId).length + 1;
    var file = (notaData.file && notaData.file.base64) ? DriveHelper.upload(notaData.file, {noTransaksi:transactionId}) : null;
    var hasDetail = notaData.detail && notaData.detail.length;
    var nilai = hasDetail ? DetailNota.totalItems(notaData.detail) : Util.num(notaData.nilai);

    SheetRepo.appendRow(CONFIG.SHEETS.MULTI_NOTA, [
      transactionId, 0, urutan, notaData.namaPenyedia || '', nilai,
      file ? file.fileId : '', file ? file.namaFile : '', file ? file.url : '', new Date(),
      notaData.npwp || '', notaData.alamat || '', FLAG_ACTIVE, '', '',
      notaData.tglNota ? new Date(notaData.tglNota) : ''
    ]);
    DeferredFlush.mark();
    if (hasDetail) DetailNota.save(transactionId, urutan, notaData.detail);
    _recalcNota(transactionId);
    return { success: true, urutan: urutan };
  }

  function updateNota(transactionId, urutan, notaData) {
    var hit = _findNotaRow(transactionId, urutan);
    if (!hit) throw new Error('Nota tidak ditemukan');
    var n = NC();
    var hasDetail = notaData.detail && notaData.detail.length;
    var nilai = hasDetail ? DetailNota.totalItems(notaData.detail) : Util.num(notaData.nilai);
    var upd = Util.set(
      n.NAMA_NOTA, notaData.namaPenyedia || '',
      n.NOMINAL, nilai,
      n.NPWP_PENYEDIA, notaData.npwp || '',
      n.ALAMAT_PENYEDIA, notaData.alamat || '',
      n.TGL_NOTA, notaData.tglNota ? new Date(notaData.tglNota) : ''
    );
    // Ganti foto nota bila ada file baru (buang file lama)
    if (notaData.file && notaData.file.base64) {
      var oldFileId = hit.values[n.FILE_ID];
      var file = DriveHelper.upload(notaData.file, {noTransaksi:transactionId});
      upd[n.FILE_ID] = file.fileId; upd[n.NAMA_FILE] = file.namaFile; upd[n.URL_FILE] = file.url;
      if (oldFileId) DriveHelper.trash(oldFileId);
    }
    SheetRepo.setCells(CONFIG.SHEETS.MULTI_NOTA, hit.rowIndex, upd);
    DeferredFlush.mark();
    if (notaData.detail !== undefined) DetailNota.save(transactionId, urutan, notaData.detail);
    _recalcNota(transactionId);
    return { success: true };
  }

  function hapusNotaItem(transactionId, urutan, fileId) {
    var hit = _findNotaRow(transactionId, urutan);
    if (!hit) throw new Error('Nota tidak ditemukan');
    softDelete(CONFIG.SHEETS.MULTI_NOTA, hit.rowIndex, transactionId + '#' + urutan);
    if (fileId) DriveHelper.trash(fileId);
    _recalcNota(transactionId);
    return { success: true };
  }

  function restoreNota(transactionId, urutan) {
    var n = NC();
    var rows = findRows(CONFIG.SHEETS.MULTI_NOTA, function (r) {
      return String(r[n.NO_TRANSAKSI]) === String(transactionId) && String(r[n.URUTAN]) === String(urutan);
    });
    if (!rows.length) throw new Error('Nota tidak ditemukan');
    restoreRecord(CONFIG.SHEETS.MULTI_NOTA, rows[0].rowIndex, transactionId + '#' + urutan);
    _recalcNota(transactionId);
    return { success: true };
  }

  function _findNotaRow(transactionId, urutan) {
    var n = NC();
    var rows = findRows(CONFIG.SHEETS.MULTI_NOTA, function (r) {
      return String(r[n.NO_TRANSAKSI]) === String(transactionId) &&
             String(r[n.URUTAN]) === String(urutan) && !isDeleted(r[n.IS_DELETED]);
    });
    return rows.length ? rows[0] : null;
  }

  /** Hitung ulang NOTA_JML & NOTA_TOTAL pada transaksi induk. */
  function _recalcNota(transactionId) {
    var notas = getMultiNota(transactionId);
    var total = 0;
    for (var i = 0; i < notas.length; i++) total += notas[i].nilai;

    var t = getRowByTransactionId(transactionId);
    if (!t) return;
    var kredit = Util.num(t.values[C.KREDIT]);
    var kembali = Util.num(t.values[C.KEMBALIAN_TOTAL]);
    var nilaiSpby = Util.num(t.values[C.NILAI_SPBY]);
    // Target pertanggungjawaban = Nilai SPBY bila diisi, selain itu nilai pengeluaran.
    var target = nilaiSpby > 0 ? nilaiSpby : kredit;
    // Lengkap bila nota + pengembalian menutupi target (SPBY/uang muka)
    var lunas = ((total + kembali) >= target && target > 0);

    SheetRepo.setCells(CONFIG.SHEETS.KAS_TUNAI, t.rowIndex, Util.set(
      C.NOTA_JML, notas.length,
      C.NOTA_TOTAL, total,
      C.STATUS_SPJ, lunas ? 'Lunas' : 'Belum'
    ));
    DeferredFlush.mark();
  }

  /* -------------------------------------------------------- *
   * Foto Barang
   * -------------------------------------------------------- */
  function tambahFotoBarang(transactionId, fotoArr) {
    var fb = FBC();
    var urutan = findRows(CONFIG.SHEETS.FOTO_BARANG, function (r) {
      return String(r[fb.NO_TRANSAKSI]) === String(transactionId) && !isDeleted(r[fb.IS_DELETED]);
    }).length;

    for (var i = 0; i < fotoArr.length; i++) {
      var f = DriveHelper.upload(fotoArr[i], {noTransaksi:transactionId});
      var lat = fotoArr[i].lat == null ? '' : fotoArr[i].lat;
      var lng = fotoArr[i].lng == null ? '' : fotoArr[i].lng;
      var maps = (lat !== '' && lng !== '') ? ('https://maps.google.com/?q=' + lat + ',' + lng) : '';
      urutan++;
      SheetRepo.appendRow(CONFIG.SHEETS.FOTO_BARANG, [
        transactionId, 0, urutan, f.fileId, f.namaFile, f.url,
        lat, lng, maps, new Date(), FLAG_ACTIVE, '', ''
      ]);
    }
    DeferredFlush.mark();
    updateByTransactionId(transactionId, Util.set(C.FOTO_BARANG_JML, urutan));
    return { success: true, jml: urutan };
  }

  /* -------------------------------------------------------- *
   * SPBY
   * -------------------------------------------------------- */
  function simpanSpby(rowIndex, noSpby, tglSpby, nilaiSpby) {
    SheetRepo.setCells(CONFIG.SHEETS.KAS_TUNAI, rowIndex, Util.set(
      C.NO_SPBY, noSpby || '',
      C.TGL_SPBY, tglSpby ? new Date(tglSpby) : '',
      C.NILAI_SPBY, Util.num(nilaiSpby)
    ));
    DeferredFlush.mark();
    return { success: true };
  }

  function hapusSpby(rowIndex) {
    return simpanSpby(rowIndex, '', '', 0);
  }

  /** Set SPBY berdasarkan NO transaksi (untuk SPBY gabungan/massal). */
  function setSpbyByNo(no, noSpby, tglSpby, nilaiSpby) {
    var ok = updateByTransactionId(no, Util.set(
      C.NO_SPBY, noSpby || '',
      C.TGL_SPBY, tglSpby ? new Date(tglSpby) : '',
      C.NILAI_SPBY, Util.num(nilaiSpby)));
    return { success: ok };
  }

  /** Beri 1 nomor SPBY ke beberapa transaksi sekaligus. nilai per baris = kreditnya. */
  function spbyGabungan(noSpby, tglSpby, nos) {
    if (!noSpby) throw new Error('Nomor SPBY wajib diisi');
    nos = nos || [];
    var n = 0;
    for (var i = 0; i < nos.length; i++) {
      var t = getRowByTransactionId(nos[i]);
      if (!t) continue;
      var nilai = Util.num(t.values[C.KREDIT]);
      setSpbyByNo(nos[i], noSpby, tglSpby, nilai);
      n++;
    }
    DeferredFlush.mark();
    AuditLog.write('SPBY', CONFIG.SHEETS.KAS_TUNAI, noSpby, 'gabungan ' + n + ' transaksi');
    return { success: true, jml: n };
  }

  /** Pecah 1 transaksi pengeluaran menjadi beberapa transaksi.
   *  parts = [{kegiatan, keterangan, nominal}, ...] (>=2). Σnominal harus = kredit asli.
   *  Baris asli menjadi bagian ke-1; sisanya transaksi baru (tanggal/penjab/sumber sama). */
  function pecahTransaksi(no, parts) {
    var t = getRowByTransactionId(no);
    if (!t) throw new Error('Transaksi tidak ditemukan');
    parts = parts || [];
    if (parts.length < 2) throw new Error('Minimal 2 bagian');
    var kredit = Util.num(t.values[C.KREDIT]);
    if (kredit <= 0) throw new Error('Hanya transaksi pengeluaran yang bisa dipecah');
    var sum = 0;
    for (var i = 0; i < parts.length; i++) sum += Util.num(parts[i].nominal);
    if (sum !== kredit) throw new Error('Total bagian (' + sum + ') harus sama dengan nilai transaksi (' + kredit + ')');

    var tanggal = t.values[C.TANGGAL], penjab = t.values[C.PENJAB];
    var sumber = String(t.values[C.SUMBER] || 'TUNAI');
    // Bagian ke-1 → perbarui baris asli
    updateByTransactionId(no, Util.set(
      C.KREDIT, Util.num(parts[0].nominal),
      C.KEGIATAN, parts[0].kegiatan || t.values[C.KEGIATAN],
      C.KETERANGAN, parts[0].keterangan || ''));
    // Bagian ke-2..n → transaksi baru
    var baru = [];
    for (var j = 1; j < parts.length; j++) {
      var res = tambahTransaksi({
        tanggal: tanggal, debet: 0, kredit: Util.num(parts[j].nominal), sumber: sumber,
        penjab: penjab, kegiatan: parts[j].kegiatan || t.values[C.KEGIATAN],
        keterangan: parts[j].keterangan || '' });
      baru.push(res.no);
    }
    DeferredFlush.mark();
    AuditLog.write('SPLIT', CONFIG.SHEETS.KAS_TUNAI, no, 'pecah jadi ' + parts.length + ' (baru: ' + baru.join(',') + ')');
    return { success: true, no: no, baru: baru };
  }

  /* -------------------------------------------------------- *
   * Kuitansi ber-TTD (scan/foto) - disimpan di kolom FILE_ID/NAMA_FILE/URL_FILE
   * -------------------------------------------------------- */
  function uploadKuitansi(transactionId, file) {
    var up = DriveHelper.upload(file, {noTransaksi:transactionId});
    updateByTransactionId(transactionId, Util.set(
      C.KUITANSI_FILE_ID, up.fileId, C.KUITANSI_NAMA_FILE, up.namaFile, C.KUITANSI_URL, up.url));
    DeferredFlush.mark();
    AuditLog.write('UPLOAD_KUITANSI', CONFIG.SHEETS.KAS_TUNAI, transactionId, up.namaFile);
    return { success: true, fileId: up.fileId, namaFile: up.namaFile, url: up.url };
  }

  function hapusKuitansi(transactionId) {
    var t = getRowByTransactionId(transactionId);
    if (t && t.values[C.KUITANSI_FILE_ID]) DriveHelper.trash(t.values[C.KUITANSI_FILE_ID]);
    updateByTransactionId(transactionId, Util.set(C.KUITANSI_FILE_ID, '', C.KUITANSI_NAMA_FILE, '', C.KUITANSI_URL, ''));
    DeferredFlush.mark();
    return { success: true };
  }

  /* -------------------------------------------------------- *
   * Rekap
   * -------------------------------------------------------- */
  function getRekap() {
    var list = getTransaksi();
    var totalDebet = 0, totalKredit = 0, totalKembali = 0;
    for (var i = 0; i < list.length; i++) {
      totalDebet += list[i].debet;
      totalKredit += list[i].kredit;
      totalKembali += list[i].kembalianTotal;
    }
    return {
      saldoAwal: CONFIG.SALDO_AWAL,
      totalDebet: totalDebet,
      totalKredit: totalKredit,
      totalKembali: totalKembali,
      saldoAkhir: CONFIG.SALDO_AWAL + totalDebet - totalKredit,
      jmlTransaksi: list.length
    };
  }

  /* -------------------------------------------------------- *
   * Simpan data pajak (kategori & jumlah) ke baris transaksi
   * -------------------------------------------------------- */
  function simpanPajak(no, d) {
    SheetRepo.ensureMinCols(CONFIG.SHEETS.KAS_TUNAI, CONFIG.HEADERS.KAS_TUNAI.length);
    updateByTransactionId(no, Util.set(
      C.PAJAK_KATEGORI_IDX, (d.katIdx != null ? d.katIdx : ''),
      C.PAJAK_PPH,          Util.num(d.pph),
      C.PAJAK_PPN,          Util.num(d.ppn),
      C.PAJAK_DPP,          Util.num(d.dpp)));
    DeferredFlush.mark();
    AuditLog.write('SIMPAN_PAJAK', CONFIG.SHEETS.KAS_TUNAI, no,
      'katIdx=' + d.katIdx + ' pph=' + d.pph + ' ppn=' + d.ppn + ' dpp=' + d.dpp);
    return { success: true };
  }

  return {
    getTransaksi: getTransaksi,
    ringkasanSaldo: ringkasanSaldo,
    tambahTransaksi: tambahTransaksi,
    updateTransaksi: updateTransaksi,
    hapusTransaksi: hapusTransaksi,
    pindahDana: pindahDana,
    findByRef: findByRef,
    getMultiNota: getMultiNota,
    tambahNota: tambahNota,
    updateNota: updateNota,
    hapusNotaItem: hapusNotaItem,
    restoreNota: restoreNota,
    tambahFotoBarang: tambahFotoBarang,
    simpanSpby: simpanSpby,
    spbyGabungan: spbyGabungan,
    pecahTransaksi: pecahTransaksi,
    hapusSpby: hapusSpby,
    uploadKuitansi: uploadKuitansi,
    hapusKuitansi: hapusKuitansi,
    simpanPajak: simpanPajak,
    getRekap: getRekap
  };
})();
