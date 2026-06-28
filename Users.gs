/**
 * Users.gs
 * Manajemen pengguna + peran (role) untuk akses web app.
 * Role: 'admin' (kelola user + lihat saldo), 'full' (lihat saldo), 'viewer' (tanpa saldo).
 * Super Admin (CONFIG.SUPER_ADMIN) selalu 'admin' dan tak dapat diubah/dihapus.
 */
var Users = (function () {

  function UC() { return Util.colMap(CONFIG.SHEETS.USERS); }
  function _norm(e) { return String(e || '').trim().toLowerCase(); }
  function _isSuper(email) { return _norm(email) === _norm(CONFIG.SUPER_ADMIN); }

  /** Role untuk satu email. Tak dikenal / kosong → 'viewer'. */
  function getRole(email) {
    email = _norm(email);
    if (email && _isSuper(email)) return 'admin';
    if (!email) return 'viewer';
    var c = UC(), data = SheetRepo.getData(CONFIG.SHEETS.USERS);
    for (var i = 0; i < data.length; i++) {
      if (_norm(data[i][c.EMAIL]) === email) {
        return String(data[i][c.ROLE] || 'viewer').toLowerCase();
      }
    }
    return 'viewer';
  }

  /** Daftar user (Super Admin selalu di atas, terkunci). */
  function list() {
    var c = UC(), data = SheetRepo.getData(CONFIG.SHEETS.USERS), out = [];
    out.push({ email: CONFIG.SUPER_ADMIN, nama: '(Super Admin)', role: 'admin', locked: true });
    for (var i = 0; i < data.length; i++) {
      var e = _norm(data[i][c.EMAIL]);
      if (!e || _isSuper(e)) continue;
      out.push({
        email: data[i][c.EMAIL], nama: data[i][c.NAMA] || '',
        role: String(data[i][c.ROLE] || 'viewer').toLowerCase(), locked: false
      });
    }
    return out;
  }

  function _findRow(email) {
    var c = UC(), data = SheetRepo.getData(CONFIG.SHEETS.USERS);
    email = _norm(email);
    for (var i = 0; i < data.length; i++) if (_norm(data[i][c.EMAIL]) === email) return i + 2;
    return 0;
  }

  function _validRole(r) {
    r = String(r || 'viewer').toLowerCase();
    return (r === 'admin' || r === 'full' || r === 'viewer') ? r : 'viewer';
  }

  function add(email, nama, role) {
    email = _norm(email);
    if (!email) throw new Error('Email wajib diisi');
    if (email.indexOf('@') < 0) throw new Error('Format email tidak valid');
    if (_isSuper(email)) throw new Error('Email tersebut adalah Super Admin (otomatis admin)');
    if (_findRow(email)) throw new Error('Email sudah terdaftar');
    SheetRepo.appendRow(CONFIG.SHEETS.USERS,
      [email, nama || '', _validRole(role), new Date(), getOperator()]);
    DeferredFlush.mark();
    return { success: true };
  }

  function update(email, nama, role) {
    email = _norm(email);
    if (_isSuper(email)) throw new Error('Super Admin tidak dapat diubah');
    var row = _findRow(email);
    if (!row) throw new Error('User tidak ditemukan');
    var c = UC();
    SheetRepo.setCells(CONFIG.SHEETS.USERS, row,
      Util.set(c.NAMA, nama || '', c.ROLE, _validRole(role)));
    DeferredFlush.mark();
    return { success: true };
  }

  function remove(email) {
    email = _norm(email);
    if (_isSuper(email)) throw new Error('Super Admin tidak dapat dihapus');
    var row = _findRow(email);
    if (!row) throw new Error('User tidak ditemukan');
    SheetRepo.sheet(CONFIG.SHEETS.USERS).deleteRow(row);
    DeferredFlush.mark();
    return { success: true };
  }

  /** true bila email terdaftar (termasuk Super Admin). */
  function isRegistered(email) {
    email = _norm(email);
    if (!email) return false;
    if (_isSuper(email)) return true;
    return _findRow(email) !== 0;
  }

  /** Nama tampilan user; '' bila tidak ditemukan. */
  function getNama(email) {
    email = _norm(email);
    if (_isSuper(email)) return 'Super Admin';
    var c = UC(), data = SheetRepo.getData(CONFIG.SHEETS.USERS);
    for (var i = 0; i < data.length; i++) {
      if (_norm(data[i][c.EMAIL]) === email) return String(data[i][c.NAMA] || '');
    }
    return '';
  }

  return { getRole: getRole, list: list, add: add, update: update, remove: remove,
           isRegistered: isRegistered, getNama: getNama };
})();
