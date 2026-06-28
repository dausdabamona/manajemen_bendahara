/**
 * ScanInbox.gs
 * Impor lampiran dari folder "kotak masuk hasil scan" di Google Drive
 * (mis. tujuan Scan-to-Cloud / Scan-to-Folder dari EPSON WorkForce DS-570W II).
 * Folder ditentukan di CONFIG.SCAN_FOLDER_ID.
 */
var ScanInbox = (function () {

  function _folder() {
    var id = Settings.scanFolderId();
    if (!id) throw new Error('Folder scan belum diatur (Pengaturan Penyimpanan)');
    return DriveApp.getFolderById(id);
  }

  function _isImg(m) { return /^image\//.test(m || ''); }

  /** Daftar file hasil scan (terbaru dulu). */
  function list(limit) {
    limit = limit || 60;
    var arr = [], it = _folder().getFiles();
    while (it.hasNext()) {
      var f = it.next();
      var id = f.getId(), m = f.getMimeType();
      arr.push({
        fileId: id, nama: f.getName(), mime: m,
        sizeKB: Math.round((f.getSize() || 0) / 1024),
        waktu: f.getLastUpdated(),
        thumb: _isImg(m) ? ('https://drive.google.com/thumbnail?id=' + id + '&sz=w200') : '',
        url: 'https://drive.google.com/file/d/' + id + '/view'
      });
    }
    arr.sort(function (a, b) { return (b.waktu ? b.waktu.getTime() : 0) - (a.waktu ? a.waktu.getTime() : 0); });
    if (arr.length > limit) arr = arr.slice(0, limit);
    // serialisasi tanggal
    for (var i = 0; i < arr.length; i++) arr[i].waktu = Util.fmtDate(arr[i].waktu);
    return arr;
  }

  /** Ambil 1 file sbg {base64, mimeType, namaFile} untuk dipakai alur upload yang ada. */
  function getFile(fileId) {
    var f = DriveApp.getFileById(fileId);
    var blob = f.getBlob();
    return {
      base64: Utilities.base64Encode(blob.getBytes()),
      mimeType: f.getMimeType(),
      namaFile: f.getName()
    };
  }

  /** Pindahkan file ke subfolder "_Terpakai" agar kotak masuk tetap rapi. */
  function archive(fileId) {
    var root = _folder();
    var sub = null, it = root.getFoldersByName('_Terpakai');
    sub = it.hasNext() ? it.next() : root.createFolder('_Terpakai');
    var f = DriveApp.getFileById(fileId);
    sub.addFile(f);
    root.removeFile(f);
    return { success: true };
  }

  return { list: list, getFile: getFile, archive: archive };
})();
