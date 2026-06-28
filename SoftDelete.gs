/**
 * SoftDelete.gs
 * Mekanisme soft-delete & restore lintas sheet + Audit Log.
 * Tidak ada hard delete - baris hanya ditandai IS_DELETED = 'Y'.
 *
 * Setiap sheet diasumsikan punya 3 kolom standar di akhir kelompok metadata:
 *   IS_DELETED, DELETED_AT, DELETED_BY
 * Posisi kolomnya diberikan oleh pemanggil agar generik.
 */

/** Email operator aktif (fallback bila tidak tersedia). */
function getOperator() {
  if (_ExecCache.has('__operator__')) return _ExecCache.get('__operator__');
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) {}
  if (!email) {
    try { email = Session.getEffectiveUser().getEmail() || ''; } catch (e) {}
  }
  return _ExecCache.set('__operator__', email || 'unknown');
}

/** Index kolom metadata soft-delete sebuah sheet (dari header). */
function _metaCols(sheetName) {
  var c = Util.colMap(sheetName);
  return { IS_DELETED: c.IS_DELETED, DELETED_AT: c.DELETED_AT, DELETED_BY: c.DELETED_BY };
}

/**
 * Tandai satu baris sebagai terhapus. Kolom IS_DELETED/DELETED_AT/DELETED_BY
 * diturunkan dari header sheet, jadi caller tak perlu tahu index-nya.
 * @param {string} sheetName  nama sheet
 * @param {number} rowIndex   baris 1-based
 * @param {string} recordId   id untuk audit log
 */
function softDelete(sheetName, rowIndex, recordId) {
  var cols = _metaCols(sheetName);
  SheetRepo.setCells(sheetName, rowIndex,
    Util.set(cols.IS_DELETED, FLAG_DELETED, cols.DELETED_AT, new Date(), cols.DELETED_BY, getOperator()));
  DeferredFlush.mark();
  AuditLog.write('DELETE', sheetName, recordId, 'row ' + rowIndex);
  return { success: true };
}

/** Pulihkan baris yang sebelumnya di-soft-delete. */
function restoreRecord(sheetName, rowIndex, recordId) {
  var cols = _metaCols(sheetName);
  SheetRepo.setCells(sheetName, rowIndex,
    Util.set(cols.IS_DELETED, FLAG_ACTIVE, cols.DELETED_AT, '', cols.DELETED_BY, ''));
  DeferredFlush.mark();
  AuditLog.write('RESTORE', sheetName, recordId, 'row ' + rowIndex);
  return { success: true };
}

/** Cek apakah nilai sel IS_DELETED menandakan terhapus. */
function isDeleted(val) {
  return String(val).toUpperCase() === FLAG_DELETED;
}

/* ============================================================
 * Audit Log
 * ============================================================ */
var AuditLog = (function () {
  function write(action, sheetName, recordId, detail) {
    try {
      // Kolom: TIMESTAMP, ACTION, SHEET, ROW_REF, DETAIL, OPERATOR
      SheetRepo.appendRow(CONFIG.SHEETS.AUDIT_LOG, [
        new Date(), action, sheetName,
        recordId == null ? '' : recordId, detail || '', getOperator()
      ]);
      DeferredFlush.mark();
    } catch (e) {
      Logger.log('[AuditLog] gagal menulis: ' + e.message);
    }
  }
  return { write: write };
})();
