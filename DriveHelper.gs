/**
 * DriveHelper.gs
 * Upload file (base64 dari frontend) ke Google Drive, ditata rapi per transaksi:
 *   {ROOT}/Bukti Transaksi/{YYYY}/{MM-Bulan}/Txn-{NO4}/   (lampiran transaksi)
 *   {ROOT}/Exports/{YYYY}/                                 (ZIP/PDF)
 * ROOT = Settings.driveFolderId(); bila kosong → buat "Kas Tunai - Data" sekali.
 * Nama file TIDAK diubah (sudah memuat No transaksi pada pola fn_txn.../bukti_txn... dst).
 */
var DriveHelper = (function () {

  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  var _fcache = {};   // cache folder per path (per eksekusi)

  function _san(s) {
    return String(s == null ? '' : s).replace(/[\/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** Folder root aplikasi; dibuat sekali bila DRIVE_FOLDER_ID kosong. */
  function appRootFolder() {
    var id = Settings.driveFolderId();
    if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
    var f = DriveApp.createFolder('Kas Tunai - Data');
    try { Settings.set('DRIVE_FOLDER_ID', f.getId()); } catch (e) {}
    return f;
  }

  function _childFolder(parent, name) {
    name = _san(name) || '_';
    var it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : parent.createFolder(name);
  }

  /** Find-or-create tiap segmen path mulai dari root aplikasi; cache per path. */
  function resolveFolder(pathParts) {
    pathParts = pathParts || [];
    var full = pathParts.join('/');
    if (_fcache[full]) return _fcache[full];
    var cur = appRootFolder(), acc = '';
    for (var i = 0; i < pathParts.length; i++) {
      acc += (i ? '/' : '') + pathParts[i];
      cur = _fcache[acc] ? _fcache[acc] : (_fcache[acc] = _childFolder(cur, pathParts[i]));
    }
    _fcache[full] = cur;
    return cur;
  }

  function _dateOf(ctx) {
    ctx = ctx || {};
    var d = ctx.tanggal ? new Date(ctx.tanggal) : null;
    if ((!d || isNaN(d.getTime())) && ctx.noTransaksi != null && ctx.noTransaksi !== '') {
      try {
        var t = getRowByTransactionId(ctx.noTransaksi);
        if (t) { var td = t.values[CONFIG.COLS.TANGGAL]; d = (td instanceof Date) ? td : new Date(td); }
      } catch (e) {}
    }
    return (d && !isNaN(d.getTime())) ? d : new Date();
  }

  /** Folder tujuan dari ctx={noTransaksi,tanggal,kategori}. */
  function ctxFolder(ctx) {
    ctx = ctx || {};
    var kategori = ctx.kategori || 'Bukti Transaksi';
    var no = ctx.noTransaksi;
    if (no == null || no === '') return resolveFolder([kategori, '_TANPA_TXN']);
    var d = _dateOf(ctx);
    var yr = '' + d.getFullYear();
    var mo = ('0' + (d.getMonth() + 1)).slice(-2) + '-' + BULAN[d.getMonth()];
    var txn = 'Txn-' + ('000' + no).slice(-4);
    return resolveFolder([kategori, yr, mo, txn]);
  }

  /** Folder hasil ekspor (ZIP/PDF) per tahun. */
  function exportFolder(year) {
    return resolveFolder(['Exports', '' + (year || (new Date()).getFullYear())]);
  }

  /**
   * Upload satu file. @param file {base64, mimeType, namaFile}
   * @param ctx {noTransaksi, tanggal, kategori} (opsional). @return {fileId, namaFile, url}
   */
  function upload(file, ctx) {
    if (!file || !file.base64) throw new Error('Data file kosong');
    var raw = file.base64, comma = raw.indexOf(',');
    if (raw.indexOf('base64') !== -1 && comma !== -1) raw = raw.substring(comma + 1);
    var bytes = Utilities.base64Decode(raw);
    var mime = file.mimeType || 'application/octet-stream';
    var nama = file.namaFile || ('upload_' + (new Date()).getTime());
    var blob = Utilities.newBlob(bytes, mime, nama);
    var folder = (ctx && ctx.__folder) ? ctx.__folder : ctxFolder(ctx);
    var created = folder.createFile(blob);
    try { created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (e) { Logger.log('[DriveHelper] setSharing gagal: ' + e.message); }
    var id = created.getId();
    return { fileId: id, namaFile: nama, url: 'https://drive.google.com/uc?export=view&id=' + id };
  }

  /** Upload banyak file dgn ctx sama (folder di-resolve sekali). */
  function uploadMany(files, ctx) {
    var folder = ctxFolder(ctx), out = [];
    for (var i = 0; i < files.length; i++) out.push(upload(files[i], { __folder: folder }));
    return out;
  }

  /** Hapus (trash) file Drive. Tidak melempar error. */
  function trash(fileId) {
    if (!fileId) return;
    try { DriveApp.getFileById(fileId).setTrashed(true); }
    catch (e) { Logger.log('[DriveHelper] trash gagal (' + fileId + '): ' + e.message); }
  }

  /* ---------- Migrasi file lama → struktur baru ---------- */
  /** Ambil No transaksi dari nama file ber-pola aplikasi (fn_txn/bukti_txn/item_t). */
  function _noFromName(name) {
    var m = String(name || '').match(/^(?:fn_txn|bukti_txn|item_t)(\d+)/);
    return m ? m[1] : null;
  }
  function _migrateCandidates() {
    var out = [], i;
    function add(fileId, no) { if (fileId && no != null && no !== '') out.push({ fileId: fileId, no: no }); }
    var nc = Util.colMap(CONFIG.SHEETS.MULTI_NOTA), nr = SheetRepo.getData(CONFIG.SHEETS.MULTI_NOTA);
    for (i = 0; i < nr.length; i++) if (!isDeleted(nr[i][nc.IS_DELETED])) add(nr[i][nc.FILE_ID], nr[i][nc.NO_TRANSAKSI]);
    var fc = Util.colMap(CONFIG.SHEETS.FOTO_NOTA), fr = SheetRepo.getData(CONFIG.SHEETS.FOTO_NOTA);
    for (i = 0; i < fr.length; i++) if (!isDeleted(fr[i][fc.IS_DELETED])) add(fr[i][fc.FILE_ID], fr[i][fc.NO_TRANSAKSI]);
    try {
      var dc = Util.colMap(CONFIG.SHEETS.DETAIL_NOTA), dr = SheetRepo.getData(CONFIG.SHEETS.DETAIL_NOTA);
      for (i = 0; i < dr.length; i++) if (!isDeleted(dr[i][dc.IS_DELETED])) add(dr[i][dc.FILE_ID], dr[i][dc.NO_TRANSAKSI]);
    } catch (e) {}
    try {
      var bc = Util.colMap(CONFIG.SHEETS.BUKTI_PD), br = SheetRepo.getData(CONFIG.SHEETS.BUKTI_PD);
      for (i = 0; i < br.length; i++) if (!isDeleted(br[i][bc.IS_DELETED])) add(br[i][bc.FILE_ID], br[i][bc.NO_TRANSAKSI]);
    } catch (e) {}
    var C = CONFIG.COLS, kr = SheetRepo.getData(CONFIG.SHEETS.KAS_TUNAI);
    for (i = 0; i < kr.length; i++) if (!isDeleted(kr[i][C.IS_DELETED])) add(kr[i][C.KUITANSI_FILE_ID], kr[i][C.NO]);
    return out;
  }

  /**
   * Pindahkan semua lampiran lama ke folder per transaksi (FILE_ID tak berubah).
   * @param opts {dryRun, limit}. @return {moved, skipped, failed, log[], total}
   */
  function migrateDriveStorage(opts) {
    opts = opts || {};
    var dry = !!opts.dryRun, limit = opts.limit || 100000;
    var startMs = (new Date()).getTime(), TIME = 270000;
    var cands = _migrateCandidates();
    var moved = 0, skipped = 0, failed = 0, log = [];
    for (var i = 0; i < cands.length; i++) {
      if (moved >= limit || ((new Date()).getTime() - startMs) > TIME) break;
      var c = cands[i];
      try {
        var folder = ctxFolder({ noTransaksi: c.no });
        var file = DriveApp.getFileById(c.fileId);
        var inIt = false, ps = file.getParents();
        while (ps.hasNext()) { if (ps.next().getId() === folder.getId()) { inIt = true; break; } }
        if (inIt) { skipped++; continue; }
        if (dry) { if (log.length < 80) log.push('RENCANA: ' + file.getName() + ' → Txn-' + ('000' + c.no).slice(-4)); moved++; continue; }
        file.moveTo(folder);
        moved++;
        if (log.length < 80) log.push(file.getName() + ' → ' + folder.getName());
      } catch (e) { failed++; if (log.length < 80) log.push('GAGAL ' + c.fileId + ': ' + e.message); }
    }
    // Sapu file "liar" di root My Drive yang ber-pola nama aplikasi (tak tercatat di sheet).
    if (opts.sweepRoot !== false && ((new Date()).getTime() - startMs) <= TIME) {
      var it = DriveApp.getRootFolder().getFiles();
      while (it.hasNext()) {
        if (moved >= limit || ((new Date()).getTime() - startMs) > TIME) break;
        var fl = it.next();
        var no = _noFromName(fl.getName());
        if (!no) continue;
        try {
          var fol = ctxFolder({ noTransaksi: no });
          if (dry) { if (log.length < 80) log.push('RENCANA(sapu): ' + fl.getName() + ' → Txn-' + ('000' + no).slice(-4)); moved++; continue; }
          fl.moveTo(fol); moved++;
          if (log.length < 80) log.push('(sapu) ' + fl.getName() + ' → ' + fol.getName());
        } catch (e) { failed++; }
      }
    }
    if (!dry) {
      try { AuditLog.write('MIGRATE_DRIVE', 'Drive', '', 'dipindah=' + moved + ' dilewati=' + skipped + ' gagal=' + failed); } catch (e) {}
    }
    return { moved: moved, skipped: skipped, failed: failed, log: log, total: cands.length };
  }

  return {
    appRootFolder: appRootFolder, resolveFolder: resolveFolder, ctxFolder: ctxFolder,
    exportFolder: exportFolder, upload: upload, uploadMany: uploadMany, trash: trash,
    migrateDriveStorage: migrateDriveStorage
  };
})();
