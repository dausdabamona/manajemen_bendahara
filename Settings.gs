/**
 * Settings.gs
 * Pengaturan runtime yang bisa diubah dari aplikasi (disimpan di Script Properties),
 * dengan fallback ke CONFIG. Dipakai untuk lokasi folder Drive penyimpanan & folder scan.
 */
var Settings = (function () {

  function _p() { return PropertiesService.getScriptProperties(); }

  function get(key, dflt) {
    var v = _p().getProperty(key);
    return (v === null || v === undefined || v === '') ? (dflt || '') : v;
  }
  function set(key, val) {
    if (val === null || val === undefined || String(val).trim() === '') _p().deleteProperty(key);
    else _p().setProperty(key, String(val).trim());
  }

  /** Folder Drive tujuan upload lampiran (kosong = root My Drive). */
  function driveFolderId() { return get('DRIVE_FOLDER_ID', CONFIG.DRIVE_FOLDER_ID); }
  /** Folder Drive "kotak masuk hasil scan". */
  function scanFolderId() { return get('SCAN_FOLDER_ID', CONFIG.SCAN_FOLDER_ID); }

  return { get: get, set: set, driveFolderId: driveFolderId, scanFolderId: scanFolderId };
})();
