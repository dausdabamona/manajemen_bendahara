/**
 * Code.gs
 * Entry point web app (doGet) + semua fungsi server* yang dipanggil
 * frontend via google.script.run. Tiap wrapper tipis: validasi -> delegasi
 * ke modul business logic -> commitAndInvalidate -> return.
 */

/* ============================================================
 * Entry point
 * ============================================================ */
function doGet() {
  var email = _safeEmail();

  // Blokir akses bila belum terdaftar
  if (!Users.isRegistered(email)) {
    var deniedHtml = '<!DOCTYPE html><html><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>Akses Ditolak</title>'
      + '<style>*{box-sizing:border-box;font-family:Arial,sans-serif;margin:0}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9}'
      + '.card{background:#fff;border-radius:16px;padding:40px 32px;max-width:440px;width:90%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.1)}'
      + '.icon{font-size:56px;margin-bottom:16px}.title{font-size:22px;font-weight:bold;color:#1e293b;margin-bottom:8px}'
      + '.sub{font-size:14px;color:#64748b;margin-bottom:20px;line-height:1.6}'
      + '.email{background:#f1f5f9;border-radius:8px;padding:8px 14px;font-size:13px;color:#374151;display:inline-block;margin-bottom:20px}'
      + '.note{font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:4px}'
      + '</style></head><body>'
      + '<div class="card">'
      + '<div class="icon">&#128274;</div>'
      + '<div class="title">Akses Ditolak</div>'
      + '<div class="sub">Akun Anda belum terdaftar sebagai pengguna aplikasi ini.</div>'
      + (email ? '<div class="email">&#128100; ' + email + '</div>' : '')
      + '<div class="note">Hubungi Super Admin untuk mendapatkan akses.<br>Politeknik KP Sorong &mdash; Sistem Manajemen Bendahara</div>'
      + '</div></body></html>';
    return HtmlService.createHtmlOutput(deniedHtml)
      .setTitle('Akses Ditolak')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  var tpl = HtmlService.createTemplateFromFile('index');
  var role = _currentRole();
  var full = (role === 'admin' || role === 'full');
  var isSA = email.toLowerCase() === String(CONFIG.SUPER_ADMIN || '').toLowerCase();
  tpl.appData = {
    user:         email,
    namaUser:     Users.getNama(email),
    roleUser:     role,
    isAdmin:      (role === 'admin'),
    isSuperAdmin: isSA,
    saldoAwal:    full ? CONFIG.SALDO_AWAL : 0
  };
  return tpl.evaluate()
    .setTitle('Kas Tunai - Poltek KP Sorong')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Include partial HTML/CSS/JS (dipakai bila file dipecah). */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function _safeEmail() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

/** Role pengguna saat ini: 'admin' | 'full' | 'viewer'. */
function _currentRole() { return Users.getRole(_safeEmail()); }
/** true bila boleh melihat saldo (admin atau full). */
function _isFullAccess() { var r = _currentRole(); return r === 'admin' || r === 'full'; }
function _isAdmin() { return _currentRole() === 'admin'; }
function _requireAdmin() { if (!_isAdmin()) throw new Error('Akses ditolak: khusus admin'); }

/** Bungkus pemanggilan modul + flush sekali di akhir. */
function _run(fn) {
  try {
    var result = fn();
    DeferredFlush.commitAndInvalidate();
    return result;
  } catch (e) {
    Logger.log('[Code] Error: ' + e.message + '\n' + (e.stack || ''));
    DeferredFlush.commitAndInvalidate();
    throw e;
  }
}

/* ============================================================
 * Transaksi
 * ============================================================ */
function serverGetTransaksi() {
  return _run(function () {
    var isSA = _safeEmail().toLowerCase() === String(CONFIG.SUPER_ADMIN||'').toLowerCase();
    return KasTunai.getTransaksi(isSA);
  });
}
function serverToggleHidden(no, hide) {
  if (_safeEmail().toLowerCase() !== String(CONFIG.SUPER_ADMIN||'').toLowerCase())
    throw new Error('Hanya Super Admin yang dapat menyembunyikan transaksi');
  return _run(function () { return KasTunai.toggleHidden(no, hide); });
}

/** Muat data dashboard awal dalam satu round-trip: transaksi + jumlah foto + surat tugas. */
function serverGetDashboard() {
  return _run(function () {
    // Perbaiki label header kolom yang kosong (sekali per TTL cache; idempotent).
    if (!AppCache.get('hdr_fixed_v2')) {
      try { SheetRepo.ensureHeaders(); } catch (e) { Logger.log('[ensureHeaders] ' + e.message); }
      AppCache.put('hdr_fixed_v2', 1);
    }
    var role = _currentRole();
    var full = (role === 'admin' || role === 'full');
    var tx = KasTunai.getTransaksi();
    if (!full) { for (var i = 0; i < tx.length; i++) { delete tx[i].saldo; } } // sembunyikan saldo berjalan
    return {
      transaksi: tx,
      fotoMap: FotoNota.getJmlFotoPerTransaksi(),
      suratMap: SuratTugas.getMap(),
      saldo: full ? KasTunai.ringkasanSaldo() : null,
      role: role,
      isAdmin: (role === 'admin')
    };
  });
}

/* ============================================================
 * Manajemen User (khusus admin)
 * ============================================================ */
function serverListUsers() {
  return _run(function () { _requireAdmin(); return Users.list(); });
}
function serverAddUser(email, nama, role) {
  return _run(function () { _requireAdmin(); return Users.add(email, nama, role); });
}
function serverUpdateUser(email, nama, role) {
  return _run(function () { _requireAdmin(); return Users.update(email, nama, role); });
}
function serverDeleteUser(email) {
  return _run(function () { _requireAdmin(); return Users.remove(email); });
}

/** Perbaiki header kolom kosong secara manual (dari frontend bila perlu). */
function serverPerbaikiHeader() {
  return _run(function () { return SheetRepo.ensureHeaders(); });
}

/** Jalankan langsung dari editor Apps Script untuk mengisi header kosong sekarang juga. */
function perbaikiHeader() {
  return SheetRepo.ensureHeaders();
}

/** Pindah dana antar kas (Bank <-> Tunai). arah: 'BANK_TUNAI' | 'TUNAI_BANK'. */
function serverPindahDana(arah, nominal, tanggal, keterangan) {
  return _run(function () { return KasTunai.pindahDana(arah, nominal, tanggal, keterangan); });
}
/** SPBY gabungan: beri 1 nomor SPBY ke beberapa transaksi. */
function serverSpbyGabungan(noSpby, tglSpby, nos) {
  return _run(function () { return KasTunai.spbyGabungan(noSpby, tglSpby, nos); });
}
/** Pecah 1 transaksi pengeluaran menjadi beberapa transaksi. */
function serverPecahTransaksi(no, parts) {
  return _run(function () { return KasTunai.pecahTransaksi(no, parts); });
}

/* ============================================================
 * Impor lampiran dari folder scan (EPSON Scan-to-Drive)
 * ============================================================ */
function serverScanAktif() {
  return _run(function () { return !!Settings.scanFolderId(); });
}

/* ---- Rapikan penyimpanan Drive (pindah file lama ke folder per transaksi) ---- */
function serverMigrateDrive(dryRun) {
  return _run(function () { _requireAdmin(); return DriveHelper.migrateDriveStorage({ dryRun: !!dryRun }); });
}
/** Jalankan langsung dari editor Apps Script: pratinjau rencana migrasi. */
function rapikanDriveDryRun() { return DriveHelper.migrateDriveStorage({ dryRun: true }); }
/** Jalankan langsung dari editor Apps Script: pindahkan file sungguhan. */
function rapikanDrive() { return DriveHelper.migrateDriveStorage({ dryRun: false }); }

/* ============================================================
 * Pengaturan penyimpanan (folder Drive) — khusus admin
 * ============================================================ */
function _folderInfo(id) {
  if (!id) return { id: '', nama: '(root My Drive / belum diatur)', ok: true };
  try { return { id: id, nama: DriveApp.getFolderById(id).getName(), ok: true }; }
  catch (e) { return { id: id, nama: '(tidak dapat diakses!)', ok: false }; }
}
function serverGetSettings() {
  return _run(function () {
    _requireAdmin();
    return {
      driveFolderId: Settings.get('DRIVE_FOLDER_ID', ''),
      scanFolderId:  Settings.get('SCAN_FOLDER_ID', ''),
      driveInfo: _folderInfo(Settings.driveFolderId()),
      scanInfo:  _folderInfo(Settings.scanFolderId())
    };
  });
}
/** Ambil ID folder dari input: ID langsung, URL Drive, atau '' . Tolak bila berupa path. */
function _folderIdFrom(v, label) {
  v = String(v == null ? '' : v).trim();
  if (!v) return '';
  var m = v.match(/[-\w]{25,}/);            // ID Drive (>=25 char) di URL atau langsung
  if (m && (v.indexOf('http') === 0 || v === m[0])) return m[0];
  if (v.indexOf('/') >= 0 || v.indexOf(' ') >= 0) {
    throw new Error(label + ': masukkan ID folder atau URL Drive, bukan path/nama folder. Buka folder di Drive → salin dari drive.google.com/drive/folders/<ID>');
  }
  return v;
}
function serverSetSettings(driveFolderId, scanFolderId) {
  return _run(function () {
    _requireAdmin();
    driveFolderId = _folderIdFrom(driveFolderId, 'Folder penyimpanan');
    scanFolderId  = _folderIdFrom(scanFolderId, 'Folder scan');
    // Validasi folder bila diisi
    if (driveFolderId) { try { DriveApp.getFolderById(driveFolderId); } catch (e) { throw new Error('Folder penyimpanan tidak ditemukan / tak bisa diakses'); } }
    if (scanFolderId)  { try { DriveApp.getFolderById(scanFolderId);  } catch (e) { throw new Error('Folder scan tidak ditemukan / tak bisa diakses'); } }
    Settings.set('DRIVE_FOLDER_ID', driveFolderId);
    Settings.set('SCAN_FOLDER_ID', scanFolderId);
    return { success: true, driveInfo: _folderInfo(Settings.driveFolderId()), scanInfo: _folderInfo(Settings.scanFolderId()) };
  });
}
function serverListScan() {
  return _run(function () { return ScanInbox.list(60); });
}
function serverGetScanFile(fileId) {
  return _run(function () { return ScanInbox.getFile(fileId); });
}
function serverArchiveScan(fileId) {
  return _run(function () { return ScanInbox.archive(fileId); });
}

/* ============================================================
 * Perjalanan Dinas / Surat Tugas
 * ============================================================ */
/** Ringkas data SPD → field transaksi kas (total, penjab, kegiatan, keterangan, porsiBank).
 * porsiBank = Σ item "dibayar bendahara" (transport ditandai + penginapan ditandai) → dibebankan Kas Bank. */
function _pdMeta(data) {
  var list = (data.pegawaiList && data.pegawaiList.length) ? data.pegawaiList
           : [{ nama: data.pegawai || '', biaya: Util.num(data.biaya) }];
  var total = 0, nama = [], porsiBank = 0;
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    total += Util.num(p.biaya);
    if (p.nama) nama.push(p.nama);
    var tr = p.transport || [];
    for (var j = 0; j < tr.length; j++) if (tr[j] && tr[j].bendahara) porsiBank += Util.num(tr[j].jumlah);
    if (p.penginapanBendahara) porsiBank += Util.num(p.penginapan);
  }
  if (porsiBank > total) porsiBank = total;
  var jenisLbl = (data.jenis === 'LUAR_KOTA') ? 'Luar Kota' : 'Dalam Kota';
  var up = function (s) { return (String(s || '').toUpperCase() === 'BANK') ? 'BANK' : 'TUNAI'; };
  return {
    tanggal: data.tglMulai, debet: 0, kredit: total, porsiBank: porsiBank,
    sumberPelaksana: up(data.sumberPelaksana),               // default TUNAI
    sumberBendahara: up(data.sumberBendahara || 'BANK'),     // default BANK
    penjab: nama.join(', '),
    kegiatan: data.maksud || ('Perjalanan Dinas ' + (data.nomor || '')),
    keterangan: 'Surat Tugas ' + (data.nomor || '') + ' (' + jenisLbl + ', ' +
                Util.num(data.jumlahHari) + ' hari, ' + list.length + ' pegawai)'
  };
}
/** Baris induk PD (porsi ke Pelaksana) — sumber sesuai pilihan. */
function _pdPokokRow(meta) {
  return { tanggal: meta.tanggal, debet: 0, kredit: meta.kredit - meta.porsiBank,
    sumber: meta.sumberPelaksana, penjab: meta.penjab,
    kegiatan: meta.kegiatan, keterangan: meta.keterangan };
}
/** Baris porsi tiket/hotel dibayar langsung Bendahara — sumber sesuai pilihan, tertaut ke PD primary. */
function _pdBendaharaRow(meta, no) {
  var srcLbl = (meta.sumberBendahara === 'BANK') ? 'Kas Bank' : 'Kas Tunai';
  return { tanggal: meta.tanggal, debet: 0, kredit: meta.porsiBank, sumber: meta.sumberBendahara,
    penjab: meta.penjab, kegiatan: 'Tiket/Hotel dibayar Bendahara — ' + meta.kegiatan,
    keterangan: 'Dibayar langsung oleh Bendahara (' + srcLbl + '), ref PD No ' + no };
}
function serverSimpanPerjalananDinas(data) {
  return _run(function () {
    var meta = _pdMeta(data);
    var res = KasTunai.tambahTransaksi(_pdPokokRow(meta));
    var no = res.no;
    if (meta.porsiBank > 0) {
      var bd = _pdBendaharaRow(meta, no); bd.refTransfer = 'PD-' + no;
      KasTunai.tambahTransaksi(bd);
    }
    SuratTugas.simpan(no, data);
    return { success: true, no: no };
  });
}
function serverUpdatePerjalananDinas(no, data) {
  return _run(function () {
    var meta = _pdMeta(data);
    KasTunai.updateTransaksi(no, _pdPokokRow(meta));
    var refNo = KasTunai.findByRef('PD-' + no);            // baris porsi bendahara (sumber apa pun)
    if (meta.porsiBank > 0) {
      var bd = _pdBendaharaRow(meta, no); bd.refTransfer = 'PD-' + no;
      if (refNo) KasTunai.updateTransaksi(refNo, bd);
      else KasTunai.tambahTransaksi(bd);
    } else if (refNo) {
      KasTunai.hapusTransaksi(refNo);
    }
    SuratTugas.update(no, data);
    return { success: true, no: no };
  });
}
function serverGetSuratTugas(noTransaksi) {
  return _run(function () { return SuratTugas.get(noTransaksi); });
}
/** Batalkan status Perjalanan Dinas: hapus record Surat Tugas (transaksi kas tetap
 *  ada sebagai pengeluaran biasa). Baris porsi bendahara (bila ada) dibiarkan. */
function serverBatalkanPd(noTransaksi) {
  return _run(function () { return SuratTugas.remove(noTransaksi); });
}
function serverTambahTransaksi(data) {
  return _run(function () { return KasTunai.tambahTransaksi(data); });
}
function serverUpdateTransaksi(no, data) {
  return _run(function () { return KasTunai.updateTransaksi(no, data); });
}
function serverSimpanPajak(no, d) {
  return _run(function () { return KasTunai.simpanPajak(no, d); });
}

/* ============================================================
 * Impor Rekening Koran (Bank) — .xlsx via Advanced Drive Service
 * ============================================================ */
/** Konversi .xlsx (base64) ke Google Sheet sementara, baca semua sel, lalu hapus.
 *  Kembalikan array 2D (tanggal di-format string) untuk pratinjau & pemetaan di frontend. */
function serverParseRekKoran(base64, filename) {
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), MimeType.MICROSOFT_EXCEL, filename || 'rk.xlsx');
  var tmp = Drive.Files.insert({ title: 'tmp_rk_' + Date.now(), mimeType: MimeType.GOOGLE_SHEETS }, blob, { convert: true });
  var tz = Session.getScriptTimeZone();
  try {
    var sheet = SpreadsheetApp.openById(tmp.id).getSheets()[0];
    var values = sheet.getDataRange().getValues();
    return values.map(function (row) {
      return row.map(function (c) {
        return (c instanceof Date) ? Utilities.formatDate(c, tz, 'yyyy-MM-dd') : c;
      });
    });
  } finally {
    try { Drive.Files.remove(tmp.id); } catch (e) {}
  }
}

/** Simpan mutasi rekening koran sbg transaksi BANK (dedup via REF 'RK-...').
 *  list: [{tanggal, uraian, debet, kredit}] — perspektif REKENING:
 *  debet rekening = uang KELUAR (kredit app), kredit rekening = uang MASUK (debet app). */
function serverImporBank(list) {
  return _run(function () {
    var hasil = { ditambah: 0, dilewati: 0 };
    list = list || [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var masuk = Util.num(it.kredit);   // kredit rekening → masuk
      var keluar = Util.num(it.debet);   // debet rekening → keluar
      if (masuk <= 0 && keluar <= 0) continue;
      // Dedup: No Journal BNI dipakai bersama oleh transaksi induk + baris biayanya,
      // jadi gabungkan ID + nominal agar baris biaya (ATM/Prima) tidak ikut terbuang.
      var ref = 'RK-' + (it.id ? (String(it.id) + '-' + (masuk - keluar))
                                : _rkRef(it.tanggal, masuk - keluar, it.uraian));
      if (KasTunai.findByRef(ref)) { hasil.dilewati++; continue; }
      KasTunai.tambahTransaksi({
        tanggal: it.tanggal, debet: masuk, kredit: keluar, sumber: 'BANK', refTransfer: ref,
        kegiatan: (it.uraian || 'Mutasi bank'), penjab: 'Bank',
        keterangan: 'Impor rekening koran' });
      hasil.ditambah++;
    }
    return hasil;
  });
}
/* ============================================================
 * Bukti Perjalanan Dinas (tiket/boarding) + SPJ bundel
 * ============================================================ */
function serverGetBuktiPD(no, withB64) {
  return _run(function () { return BuktiPD.getBukti(no, withB64); });
}
function serverUploadBuktiPD(no, fileArr) {
  return _run(function () { return BuktiPD.uploadBukti(no, fileArr); });
}
function serverHapusBuktiPD(no, urutan) {
  return _run(function () { return BuktiPD.hapusBukti(no, urutan); });
}
function serverZipBuktiPD(no, namaZip) {
  return _run(function () { return BuktiPD.zipBukti(no, namaZip); });
}

/** Penanda unik baris rekening koran untuk anti-duplikat. */
function _rkRef(tanggal, nominal, uraian) {
  var key = String(tanggal || '') + '|' + nominal + '|' + String(uraian || '').replace(/\s+/g, ' ').trim();
  var h = 0;
  for (var i = 0; i < key.length; i++) { h = (h * 31 + key.charCodeAt(i)) & 0x7fffffff; }
  return h.toString(36);
}

/* ============================================================
 * Multi Nota
 * ============================================================ */
function serverGetMultiNota(transactionId) {
  return _run(function () { return KasTunai.getMultiNota(transactionId); });
}
function serverTambahNota(transactionId, notaData) {
  return _run(function () { return KasTunai.tambahNota(transactionId, notaData); });
}
function serverUpdateNota(transactionId, urutan, notaData) {
  return _run(function () { return KasTunai.updateNota(transactionId, urutan, notaData); });
}
function serverHapusNotaItem(transactionId, urutan, fileId) {
  return _run(function () { return KasTunai.hapusNotaItem(transactionId, urutan, fileId); });
}
function serverRestoreNota(transactionId, urutan) {
  return _run(function () { return KasTunai.restoreNota(transactionId, urutan); });
}

/* ============================================================
 * Foto Nota
 * ============================================================ */
function serverGetJmlFotoPerTransaksi() {
  return _run(function () { return FotoNota.getJmlFotoPerTransaksi(); });
}
function serverGetFotoNota(noTransaksi, notaId) {
  return _run(function () { return FotoNota.getFotoNota(noTransaksi, notaId); });
}
function serverUploadFotoNota(noTransaksi, notaId, fotoArr) {
  return _run(function () { return FotoNota.uploadFotoNota(noTransaksi, notaId, fotoArr); });
}
function serverHapusFotoNota(noTransaksi, notaId, urutan) {
  return _run(function () { return FotoNota.hapusFotoNota(noTransaksi, notaId, urutan); });
}
function serverGetNotaDanFoto(noTransaksi) {
  return _run(function () { return FotoNota.getNotaDanFoto(noTransaksi); });
}
function serverGetSpjData(noTransaksi) {
  return _run(function () { return FotoNota.getSpjData(noTransaksi); });
}

/* ============================================================
 * Foto Barang
 * ============================================================ */
function serverUploadFotoBarang(transactionId, fotoArr) {
  return _run(function () { return KasTunai.tambahFotoBarang(transactionId, fotoArr); });
}

/* ============================================================
 * Pengembalian
 * ============================================================ */
function serverGetPengembalian(transactionId) {
  return _run(function () { return Pengembalian.getPengembalian(transactionId); });
}
function serverTambahPengembalian(transactionId, data) {
  return _run(function () { return Pengembalian.tambahPengembalian(transactionId, data); });
}
function serverHapusPengembalian(transactionId, urutan) {
  return _run(function () { return Pengembalian.hapusPengembalian(transactionId, urutan); });
}
function serverRestorePengembalian(transactionId, urutan) {
  return _run(function () { return Pengembalian.restorePengembalian(transactionId, urutan); });
}

/* ============================================================
 * Master Penyedia
 * ============================================================ */
function serverGetAllPenyedia() {
  return _run(function () { return MasterPenyedia.getAll(); });
}
function serverSimpanPenyedia(data) {
  return _run(function () { return MasterPenyedia.simpan(data); });
}
function serverCariPenyedia(keyword) {
  return _run(function () { return MasterPenyedia.cari(keyword); });
}

/* ============================================================
 * SPBY
 * ============================================================ */
function serverSimpanSpby(rowIndex, noSpby, tglSpby, nilaiSpby) {
  return _run(function () { return KasTunai.simpanSpby(rowIndex, noSpby, tglSpby, nilaiSpby); });
}
function serverHapusSpby(rowIndex) {
  return _run(function () { return KasTunai.hapusSpby(rowIndex); });
}

/* ============================================================
 * Kuitansi ber-TTD (upload scan/foto)
 * ============================================================ */
function serverUploadKuitansi(transactionId, file) {
  return _run(function () { return KasTunai.uploadKuitansi(transactionId, file); });
}
function serverHapusKuitansi(transactionId) {
  return _run(function () { return KasTunai.hapusKuitansi(transactionId); });
}

/* ============================================================
 * Rekap
 * ============================================================ */
function serverGetRekap() {
  return _run(function () { return KasTunai.getRekap(); });
}
