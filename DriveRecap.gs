/**
 * DriveRecap.gs
 * Membuat rekapan isi folder Google Drive (rekursif) ke sheet "Drive Rekap".
 * Mencatat: No, Tipe (Folder/File), Nama, Ekstensi, Folder Induk,
 *           Path Lengkap, Link, Ukuran (KB), Tanggal Dibuat, Terakhir Diubah.
 *
 * Cara pakai:
 *   1. Buka Apps Script project ini → jalankan fungsi buatDriveRecap()
 *   2. Atau panggil dari menu: Extras → Drive Rekap
 *
 * Konfigurasi:
 *   RECAP_FOLDER_ID  – ID folder yang ingin direkap (kosong = My Drive root)
 *   RECAP_SHEET_NAME – Nama sheet tujuan (akan dibuat/dikosongkan otomatis)
 *   MAX_DEPTH        – Kedalaman subfolder maksimum (0 = tanpa batas)
 */

var RECAP_CONFIG = {
  FOLDER_ID:  '',          // Kosong = My Drive root; isi ID folder tertentu jika perlu
  SHEET_NAME: 'Drive Rekap',
  MAX_DEPTH:  0,           // 0 = rekursif penuh tanpa batas
  INCLUDE_TRASHED: false   // true = ikutkan file di Trash
};

// ─── Header kolom sheet ───────────────────────────────────────────────────────
var RECAP_HEADERS = [
  'NO', 'TIPE', 'NAMA', 'EKSTENSI', 'FOLDER INDUK', 'PATH LENGKAP',
  'LINK', 'UKURAN (KB)', 'TGL DIBUAT', 'TGL DIUBAH'
];

/**
 * Entry point utama — buat atau perbarui rekapan Drive.
 */
function buatDriveRecap() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch(e) { ui = null; }

  var ss     = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet  = _getOrCreateRecapSheet(ss);
  var folder = _getRootFolder();

  // Tulis header
  sheet.getRange(1, 1, 1, RECAP_HEADERS.length)
       .setValues([RECAP_HEADERS])
       .setFontWeight('bold')
       .setBackground('#4A90D9')
       .setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);

  // Kumpulkan data secara rekursif
  var rows   = [];
  var nomor  = { n: 1 };
  _telusurFolder(folder, '', 1, rows, nomor);

  // Tulis ke sheet sekaligus (lebih cepat dari setValues satu per satu)
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, RECAP_HEADERS.length).setValues(rows);

    // Format kolom LINK sebagai hyperlink yang bisa diklik
    for (var i = 0; i < rows.length; i++) {
      var link = rows[i][6]; // kolom G = LINK
      if (link) {
        var cell = sheet.getRange(i + 2, 7);
        cell.setFormula('=HYPERLINK("' + link + '","Buka")');
      }
    }

    // Zebra stripe baris
    _warnaiZebra(sheet, rows.length);
  }

  // Auto-resize semua kolom
  sheet.autoResizeColumns(1, RECAP_HEADERS.length);

  // Ringkasan singkat di A1 tooltip
  SpreadsheetApp.flush();

  var pesan = 'Selesai! ' + rows.length + ' item berhasil direkap ke sheet "' + RECAP_CONFIG.SHEET_NAME + '".';
  if (ui) {
    ui.alert('Drive Rekap', pesan, ui.ButtonSet.OK);
  } else {
    Logger.log(pesan);
  }
}

/**
 * Rekursif menelusuri folder dan mencatat setiap subfolder & file ke array rows.
 * @param {Folder} folder   – objek DriveApp.Folder
 * @param {string} parentPath – path folder induk (untuk kolom PATH LENGKAP)
 * @param {number} depth    – kedalaman saat ini
 * @param {Array}  rows     – array akumulator baris
 * @param {Object} nomor    – counter nomor urut { n: number }
 */
function _telusurFolder(folder, parentPath, depth, rows, nomor) {
  var namaFolder  = folder.getName();
  var pathSekarang = parentPath ? parentPath + ' / ' + namaFolder : namaFolder;

  // ── Catat folder itu sendiri (kecuali root level-1 agar tidak dobel) ──────
  if (depth > 1) {
    rows.push(_barisFolder(nomor.n++, folder, parentPath, pathSekarang));
  }

  // ── Subfolder ──────────────────────────────────────────────────────────────
  var subfolders = folder.getFolders();
  var batasDepth = RECAP_CONFIG.MAX_DEPTH;
  if (batasDepth === 0 || depth < batasDepth) {
    while (subfolders.hasNext()) {
      _telusurFolder(subfolders.next(), pathSekarang, depth + 1, rows, nomor);
    }
  }

  // ── File ───────────────────────────────────────────────────────────────────
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (!RECAP_CONFIG.INCLUDE_TRASHED && file.isTrashed()) continue;
    rows.push(_barisFile(nomor.n++, file, namaFolder, pathSekarang));
  }
}

/** Buat baris data untuk satu folder. */
function _barisFolder(no, folder, parentPath, pathLengkap) {
  return [
    no,
    'Folder',
    folder.getName(),
    '-',
    parentPath || '(root)',
    pathLengkap,
    folder.getUrl(),
    '-',
    _formatTgl(folder.getDateCreated()),
    _formatTgl(folder.getLastUpdated())
  ];
}

/** Buat baris data untuk satu file. */
function _barisFile(no, file, namaFolderInduk, pathLengkap) {
  var nama  = file.getName();
  var ext   = _ekstensi(nama, file.getMimeType());
  var ukuran = Math.round(file.getSize() / 1024 * 10) / 10; // KB, 1 desimal

  return [
    no,
    'File',
    nama,
    ext,
    namaFolderInduk,
    pathLengkap,
    file.getUrl(),
    ukuran,
    _formatTgl(file.getDateCreated()),
    _formatTgl(file.getLastUpdated())
  ];
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function _getRootFolder() {
  if (RECAP_CONFIG.FOLDER_ID) {
    return DriveApp.getFolderById(RECAP_CONFIG.FOLDER_ID);
  }
  return DriveApp.getRootFolder();
}

function _getOrCreateRecapSheet(ss) {
  var sheetName = RECAP_CONFIG.SHEET_NAME;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clearContents();
    sheet.clearFormats();
  }
  return sheet;
}

function _formatTgl(date) {
  if (!date) return '';
  var d = date.getDate(), m = date.getMonth() + 1, y = date.getFullYear();
  var hh = date.getHours(), mm = date.getMinutes();
  return (d < 10 ? '0' + d : d) + '/' + (m < 10 ? '0' + m : m) + '/' + y +
         ' ' + (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);
}

function _ekstensi(namaFile, mimeType) {
  var dot = namaFile.lastIndexOf('.');
  if (dot > 0) return namaFile.substring(dot + 1).toUpperCase();
  // Fallback dari MIME type untuk file Google Workspace
  var mimeMap = {
    'application/vnd.google-apps.document':     'Google Doc',
    'application/vnd.google-apps.spreadsheet':  'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.form':         'Google Form',
    'application/vnd.google-apps.drawing':      'Google Drawing',
    'application/vnd.google-apps.script':       'Apps Script'
  };
  return mimeMap[mimeType] || 'Lainnya';
}

function _warnaiZebra(sheet, jumlahBaris) {
  for (var i = 0; i < jumlahBaris; i++) {
    var warna = (i % 2 === 0) ? '#FFFFFF' : '#EEF4FB';
    sheet.getRange(i + 2, 1, 1, RECAP_HEADERS.length).setBackground(warna);
  }
}

// ─── Tambah menu kustom ───────────────────────────────────────────────────────

/**
 * Dipanggil otomatis saat spreadsheet dibuka — tambahkan item menu.
 * Gabungkan dengan onOpen() yang sudah ada di file lain menggunakan
 * fungsi ini secara terpisah agar tidak konflik.
 */
function onOpenDriveRecap() {
  SpreadsheetApp.getUi()
    .createMenu('Drive Rekap')
    .addItem('Rekap Folder Drive Sekarang', 'buatDriveRecap')
    .addToUi();
}
