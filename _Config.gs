/**
 * _Config.gs
 * Konfigurasi global aplikasi Kas Tunai - Poltek KP Sorong.
 * Semua konstanta, nama sheet, index kolom, dan header didefinisikan di sini
 * agar mudah dirawat dari satu tempat.
 */

var CONFIG = {

  // ID spreadsheet backend (Google Sheets)
  SPREADSHEET_ID: '15TUNtEK740ZP4MvZUJh3253H_iCCLEeoHoKryTdlNj4',

  // Saldo awal kas tunai (saldo sebelum transaksi No.1)
  SALDO_AWAL: 3218000,

  // Saldo awal kas di bank (rekening) — sesuaikan dengan saldo rekening awal
  SALDO_AWAL_BANK: 0,

  // Email (Google) yang boleh MELIHAT SALDO (Tunai/Bank/Total). Email lain yang
  // diberi akses web app = "peninjau" (saldo disembunyikan). Kosongkan array ini
  // ([]) bila ingin SEMUA pengguna melihat saldo (mode lama). Huruf besar/kecil bebas.
  FULL_ACCESS_EMAILS: ['dausdaba@polikpsorong.ac.id'],

  // Super Admin tetap (selalu role 'admin', tak bisa dihapus/diubah dari menu user).
  SUPER_ADMIN: 'dausdaba@polikpsorong.ac.id',


  // Folder Drive root untuk upload (kosong = root My Drive)
  DRIVE_FOLDER_ID: '',

  // Folder Drive "kotak masuk hasil scan" (mis. tujuan Scan-to-Cloud EPSON DS-570W II).
  // Isi dengan ID folder Drive; kosong = fitur Impor Scan nonaktif.
  SCAN_FOLDER_ID: '',

  // Nama-nama sheet
  SHEETS: {
    KAS_TUNAI:      'Kas Tunai',
    MULTI_NOTA:     'Multi Nota',
    FOTO_NOTA:      'Foto Nota',
    PENGEMBALIAN:   'Pengembalian',
    FOTO_BARANG:    'Foto Barang',
    MASTER_PENYEDIA:'Master Penyedia',
    SURAT_TUGAS:    'Surat Tugas',
    BUKTI_PD:       'Bukti Perjalanan',
    AUDIT_LOG:      'Audit Log',
    USERS:          'Users',
    DETAIL_NOTA:    'Detail Nota'
  },

  // Index kolom sheet Kas Tunai (0-based, A-X = 24 kolom inti + kolom kuitansi TTD)
  COLS: {
    NO: 0, TANGGAL: 1, KEGIATAN: 2, PENJAB: 3, DEBET: 4, KREDIT: 5, SALDO: 6,
    KETERANGAN: 7, FILE_ID: 8, NAMA_FILE: 9, URL_FILE: 10, STATUS_SPJ: 11,
    TGL_NOTA: 12, FOTO_BARANG_JML: 13, NOTA_JML: 14, NOTA_TOTAL: 15,
    UANG_DISERAHKAN: 16, KEMBALIAN_JML: 17, KEMBALIAN_TOTAL: 18,
    IS_DELETED: 19, DELETED_AT: 20, DELETED_BY: 21, NO_SPBY: 22, TGL_SPBY: 23,
    KUITANSI_FILE_ID: 24, KUITANSI_NAMA_FILE: 25, KUITANSI_URL: 26,
    SUMBER: 27, REF_TRANSFER: 28, NILAI_SPBY: 29, AKUN: 30, PERSEDIAAN: 31,
    PAJAK_KATEGORI_IDX: 32, PAJAK_PPH: 33, PAJAK_PPN: 34, PAJAK_DPP: 35,
    PAJAK_NAMA_PENYEDIA: 36, PAJAK_NPWP_PENYEDIA: 37
  },

  // Header tiap sheet (urut sesuai kolom FISIK sheet asli)
  HEADERS: {
    KAS_TUNAI: [
      'NO', 'TANGGAL', 'KEGIATAN', 'PENJAB', 'DEBET', 'KREDIT', 'SALDO',
      'KETERANGAN', 'FILE_ID', 'NAMA_FILE', 'URL_FILE', 'STATUS_SPJ',
      'TGL_NOTA', 'FOTO_BARANG_JML', 'NOTA_JML', 'NOTA_TOTAL',
      'UANG_DISERAHKAN', 'KEMBALIAN_JML', 'KEMBALIAN_TOTAL',
      'IS_DELETED', 'DELETED_AT', 'DELETED_BY', 'NO_SPBY', 'TGL_SPBY',
      'KUITANSI_FILE_ID', 'KUITANSI_NAMA_FILE', 'KUITANSI_URL',
      'SUMBER', 'REF_TRANSFER', 'NILAI_SPBY', 'AKUN', 'PERSEDIAAN',
      'PAJAK_KATEGORI_IDX', 'PAJAK_PPH', 'PAJAK_PPN', 'PAJAK_DPP',
      'PAJAK_NAMA_PENYEDIA', 'PAJAK_NPWP_PENYEDIA'
    ],
    MULTI_NOTA: [
      'NO_TRANSAKSI', 'ROW_INDEX', 'URUTAN', 'NAMA_NOTA', 'NOMINAL',
      'FILE_ID', 'NAMA_FILE', 'URL_FILE', 'TGL_UPLOAD',
      'NPWP_PENYEDIA', 'ALAMAT_PENYEDIA', 'IS_DELETED', 'DELETED_AT', 'DELETED_BY',
      'TGL_NOTA'
    ],
    FOTO_NOTA: [
      'NO_TRANSAKSI', 'NOTA_ID', 'URUTAN', 'FILE_ID', 'NAMA_FILE', 'URL_FILE',
      'LAT', 'LNG', 'LOKASI', 'MAPS_URL', 'WAKTU', 'KETERANGAN',
      'IS_DELETED', 'DELETED_AT', 'DELETED_BY'
    ],
    PENGEMBALIAN: [
      'NO_TRANSAKSI', 'URUTAN', 'TANGGAL', 'JUMLAH', 'KETERANGAN',
      'DICATAT_OLEH', 'TGL_CATAT', 'IS_DELETED', 'DELETED_AT', 'DELETED_BY',
      'REF_MASUK_NO'
    ],
    FOTO_BARANG: [
      'NO_TRANSAKSI', 'ROW_INDEX', 'URUTAN', 'FILE_ID', 'NAMA_FILE', 'URL_FILE',
      'LATITUDE', 'LONGITUDE', 'MAPS_URL', 'WAKTU_FOTO',
      'IS_DELETED', 'DELETED_AT', 'DELETED_BY'
    ],
    MASTER_PENYEDIA: [
      'NO', 'NAMA_PENYEDIA', 'NPWP', 'ALAMAT', 'TERAKHIR_DIGUNAKAN', 'FREKUENSI'
    ],
    SURAT_TUGAS: [
      'NO', 'NO_TRANSAKSI', 'NOMOR_SURAT', 'PEGAWAI', 'NIP', 'PANGKAT', 'JABATAN',
      'MAKSUD', 'ANGKUTAN', 'BERANGKAT', 'TUJUAN', 'TGL_MULAI', 'TGL_SELESAI',
      'JUMLAH_HARI', 'BIAYA', 'AKUN', 'PPK', 'NIP_PPK',
      'LOK_NAMA', 'LOK_JAB', 'KERJA_NAMA', 'KERJA_JAB', 'CREATED_AT', 'CREATED_BY',
      'PEGAWAI_JSON', 'JENIS', 'DASAR_SURAT', 'UANG_MUKA', 'TGL_SURAT',
      'MENIMBANG', 'TTD_NAMA', 'TTD_JAB', 'TTD_NIP',
      'SUMBER_PELAKSANA', 'SUMBER_BENDAHARA'
    ],
    BUKTI_PD: [
      'NO_TRANSAKSI', 'URUTAN', 'FILE_ID', 'NAMA_FILE', 'URL_FILE', 'MIME',
      'JENIS_DOK', 'WAKTU', 'KETERANGAN', 'IS_DELETED', 'DELETED_AT', 'DELETED_BY'
    ],
    AUDIT_LOG: [
      'TIMESTAMP', 'ACTION', 'SHEET', 'ROW_REF', 'DETAIL', 'OPERATOR'
    ],
    USERS: [
      'EMAIL', 'NAMA', 'ROLE', 'CREATED_AT', 'CREATED_BY'
    ],
    DETAIL_NOTA: [
      'NO_TRANSAKSI', 'ROW_INDEX', 'URUTAN', 'NAMA_BARANG', 'QTY', 'SATUAN',
      'HARGA_SATUAN', 'SUBTOTAL', 'KETERANGAN', 'NOTA_URUTAN', 'FILE_ID',
      'NAMA_FILE', 'URL_FILE', 'LAT', 'LNG', 'MAPS_URL', 'WAKTU',
      'IS_DELETED', 'DELETED_AT', 'DELETED_BY'
    ]
  },

  // Identitas instansi (untuk laporan SPJ & SSP pajak)
  INSTANSI: {
    namaWP:   'Politeknik Kelautan dan Perikanan Sorong',
    npwpWP:   '00.000.000.0-000.000',
    alamatWP: 'Jl. Kapitan Pattimura, Tanjung Kasuari, Sorong, Papua Barat Daya',
    bendahara:'',
    kota:     'Sorong',
    namaBank: '',
    noRekening: ''
  }
};

// Nilai flag soft-delete
var FLAG_DELETED = 'Y';
var FLAG_ACTIVE  = '';
