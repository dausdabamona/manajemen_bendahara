# Kas Tunai — Poltek KP Sorong

Aplikasi Google Apps Script (GAS) untuk manajemen kas tunai Politeknik Kelautan
dan Perikanan Sorong. Backend: Google Sheets. Frontend: `index.html` (vanilla JS).

## Struktur File

| File | Peran |
|------|-------|
| `appsscript.json` | Manifest (timezone, scope OAuth, webapp) |
| `_Config.gs` | `CONFIG`: SPREADSHEET_ID, nama sheet, index kolom, header |
| `Util.gs` | Helper bersama: `num`, `fmtDate`, `emptyRow`, `set`, `colMap` |
| `SheetRepository.gs` | Cache 3-lapis (`_ExecCache`, `AppCache`, `SheetRepo`) + `DeferredFlush` |
| `SoftDelete.gs` | `softDelete`, `restoreRecord`, `AuditLog`, `getOperator` |
| `TxnHelper.gs` | Lookup berbasis NO transaksi (`findRowByTransactionId`, dll) |
| `DriveHelper.gs` | Upload / trash file ke Google Drive |
| `KasTunai.gs` | Transaksi, multi-nota, foto barang, SPBY, rekap |
| `FotoNota.gs` | Foto per nota (relasi `NO_TRANSAKSI` + `NOTA_ID`) |
| `Pengembalian.gs` | Pengembalian uang per transaksi |
| `MasterPenyedia.gs` | Data rekanan untuk SSP pajak |
| `Code.gs` | `doGet()` + semua fungsi `server*` |
| `index.html` | Frontend lengkap (CSS + JS dalam satu file) |

> **Urutan muat** diatur lewat `filePushOrder` di `.clasp.json` karena `_Config.gs`
> harus dievaluasi sebelum modul lain yang memakai `CONFIG`.

## Deploy dengan clasp

Prasyarat sekali saja:

1. Pasang Node.js, lalu clasp:
   ```bash
   npm install -g @google/clasp
   ```
2. Aktifkan **Google Apps Script API**: buka
   <https://script.google.com/home/usersettings> → nyalakan *"Google Apps Script API"*.
3. Login:
   ```bash
   clasp login
   ```

Unggah kode ke proyek GAS (Script ID sudah diisi di `.clasp.json`):

```bash
clasp push          # tambahkan --force bila diminta menimpa file di proyek
```

Membuka proyek di editor / deploy web app:

```bash
clasp open                       # buka editor Apps Script di browser
clasp deploy -d "Kas Tunai"      # buat versi deployment web app
```

Menarik perubahan dari proyek GAS ke lokal:

```bash
clasp pull
```

## Catatan

- Backend memakai ES5 (var, function) demi kompatibilitas.
- Foto dikompresi di browser (maks 1280px, kualitas 0.7) sebelum diunggah.
- Tidak ada hard delete — semua pakai `IS_DELETED = 'Y'` (lihat `SoftDelete.gs`).
- `SpreadsheetApp.flush()` dipanggil sekali di akhir request via
  `DeferredFlush.commitAndInvalidate()`.

### Belum lengkap (perlu spek asli)

- Engine pajak 19 kategori / 269 kata kunci (`PAJAK_REF` di `index.html` masih kosong).
- Layout PDF SPJ PUM & SSP PPh/PPN (format F.2.0.32.01) — baru placeholder.
