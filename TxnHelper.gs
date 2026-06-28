/**
 * TxnHelper.gs
 * Helper lookup transaksi berbasis NO transaksi (stabil), bukan rowIndex.
 * Index baris bisa bergeser, tapi NO transaksi tetap; semua modul lookup
 * lewat helper ini agar konsisten.
 */

/** Ambil objek baris transaksi (array nilai) by NO; null bila tidak ada. */
function getRowByTransactionId(transactionId) {
  var data = SheetRepo.getData(CONFIG.SHEETS.KAS_TUNAI);
  var c = CONFIG.COLS;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][c.NO]) === String(transactionId)) {
      return { rowIndex: i + 2, values: data[i] }; // +2: header baris 1, data mulai baris 2
    }
  }
  return null;
}

/**
 * Cari baris (1-based) di sheet Kas Tunai berdasarkan NO transaksi.
 * @return {number} rowIndex 1-based, atau -1 bila tidak ketemu.
 */
function findRowByTransactionId(transactionId) {
  var hit = getRowByTransactionId(transactionId);
  return hit ? hit.rowIndex : -1;
}

/**
 * Update sel-sel transaksi by NO transaksi.
 * @param {string|number} transactionId
 * @param {object} updates  {colIndex0based: value}
 * @return {boolean} sukses
 */
function updateByTransactionId(transactionId, updates) {
  var rowIndex = findRowByTransactionId(transactionId);
  if (rowIndex < 0) return false;
  SheetRepo.setCells(CONFIG.SHEETS.KAS_TUNAI, rowIndex, updates);
  DeferredFlush.mark();
  return true;
}

/**
 * Cari semua baris (1-based) di sheet anak yang cocok dengan kondisi.
 * @param {string} sheetName
 * @param {function} predicate  fn(rowValues, index0) -> boolean
 * @return {Array<{rowIndex:number, values:Array}>}
 */
function findRows(sheetName, predicate) {
  var data = SheetRepo.getData(sheetName);
  var out = [];
  for (var i = 0; i < data.length; i++) {
    if (predicate(data[i], i)) {
      out.push({ rowIndex: i + 2, values: data[i] });
    }
  }
  return out;
}

/** NO transaksi berikutnya (max + 1, abaikan yang terhapus diabaikan). */
function nextTransactionNo() {
  var data = SheetRepo.getData(CONFIG.SHEETS.KAS_TUNAI);
  var c = CONFIG.COLS;
  var max = 0;
  for (var i = 0; i < data.length; i++) {
    var n = parseInt(data[i][c.NO], 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}
