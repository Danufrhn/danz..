const API = '/api';
let TOKEN = localStorage.getItem('token') || null;
let CURRENT_USER = null;
let PRODUCTS_CACHE = [];

// ---------- helpers ----------
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan.');
  return data;
}

function fmtNum(n) {
  return new Intl.NumberFormat('id-ID').format(n ?? 0);
}
function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function typeLabel(t) {
  return { in: 'Masuk', out: 'Keluar', adjustment: 'Penyesuaian', shopee_sync: 'Sinkron Shopee' }[t] || t;
}

// ---------- auth ----------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    TOKEN = data.token;
    CURRENT_USER = data.user;
    localStorage.setItem('token', TOKEN);
    enterApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  TOKEN = null;
  localStorage.removeItem('token');
  location.reload();
});

async function tryAutoLogin() {
  if (!TOKEN) return showLogin();
  try {
    const data = await api('/auth/me');
    CURRENT_USER = data.user;
    enterApp();
  } catch {
    TOKEN = null;
    localStorage.removeItem('token');
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function enterApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userBadge').innerHTML =
    `${CURRENT_USER.name} <span class="role-tag">${CURRENT_USER.role}</span>`;
  if (CURRENT_USER.role !== 'admin') {
    document.querySelector('.nav-item[data-view="team"]').style.display = 'none';
  }
  loadOverview();
}

// ---------- navigation ----------
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
document.querySelectorAll('[data-view-link]').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.viewLink));
});

function switchView(view) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  document.getElementById('view-' + view).classList.remove('hidden');
  if (view === 'overview') loadOverview();
  if (view === 'products') loadProducts();
  if (view === 'history') loadHistory();
  if (view === 'shopee') loadShopee();
  if (view === 'team') loadTeam();
}

// ---------- overview ----------
async function loadOverview() {
  const s = await api('/stock/summary');
  document.getElementById('statProducts').textContent = fmtNum(s.totalProducts);
  document.getElementById('statStock').textContent = fmtNum(s.totalStock);
  document.getElementById('statLow').textContent = fmtNum(s.lowStock);
  document.getElementById('statToday').textContent = fmtNum(s.todayMovements);

  const { history } = await api('/stock/history?limit=6');
  document.getElementById('recentHistory').innerHTML = renderHistoryTable(history, true);
}

// ---------- products ----------
async function loadProducts() {
  const search = document.getElementById('productSearch').value;
  const { products } = await api('/products' + (search ? `?search=${encodeURIComponent(search)}` : ''));
  PRODUCTS_CACHE = products;
  document.getElementById('productsTable').innerHTML = renderProductsTable(products);
  bindProductRowActions();
}
document.getElementById('productSearch').addEventListener('input', debounce(loadProducts, 300));

function renderProductsTable(products) {
  if (products.length === 0) {
    return `<div class="empty-state">Belum ada produk. Klik "+ Produk baru" untuk menambahkan.</div>`;
  }
  const rows = products
    .map((p) => {
      const low = p.stock <= p.min_stock;
      return `
      <tr>
        <td><span class="sku-tag">${p.sku}</span></td>
        <td>${p.name}${p.category ? `<div class="muted" style="font-size:12px">${p.category}</div>` : ''}</td>
        <td>${fmtNum(p.stock)} ${p.unit}</td>
        <td><span class="badge ${low ? 'low' : 'ok'}">${low ? 'Menipis' : 'Aman'}</span></td>
        <td>${p.shopee_item_id ? '<span class="badge shopee_sync">Terhubung</span>' : '<span class="muted">Belum</span>'}</td>
        <td class="row-actions">
          <button class="icon-btn" data-action="in" data-id="${p.id}">+ Masuk</button>
          <button class="icon-btn" data-action="out" data-id="${p.id}">− Keluar</button>
          <button class="icon-btn" data-action="delete" data-id="${p.id}">Hapus</button>
        </td>
      </tr>`;
    })
    .join('');
  return `
  <table>
    <thead><tr><th>SKU</th><th>Nama</th><th>Stok</th><th>Status</th><th>Shopee</th><th>Aksi</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function bindProductRowActions() {
  document.querySelectorAll('#productsTable [data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const action = btn.dataset.action;
      const product = PRODUCTS_CACHE.find((p) => p.id === id);
      if (action === 'delete') return confirmDeleteProduct(product);
      openStockModal(product, action);
    });
  });
}

document.getElementById('addProductBtn').addEventListener('click', openAddProductModal);

// ---------- history ----------
async function loadHistory() {
  const { history } = await api('/stock/history?limit=200');
  document.getElementById('historyTable').innerHTML = renderHistoryTable(history, false);
}

function renderHistoryTable(history, compact) {
  if (history.length === 0) {
    return `<div class="empty-state">Belum ada riwayat transaksi.</div>`;
  }
  const rows = history
    .map(
      (h) => `
    <tr>
      <td>${fmtDate(h.created_at)}</td>
      <td><span class="sku-tag">${h.sku}</span> ${h.product_name}</td>
      <td><span class="badge ${h.type}">${typeLabel(h.type)}</span></td>
      <td>${fmtNum(h.quantity)}</td>
      <td>${fmtNum(h.stock_after)}</td>
      ${compact ? '' : `<td>${h.note || '-'}</td><td>${h.user_name || 'Sistem'}</td>`}
    </tr>`
    )
    .join('');
  return `
  <table>
    <thead><tr>
      <th>Waktu</th><th>Produk</th><th>Tipe</th><th>Jumlah</th><th>Sisa Stok</th>
      ${compact ? '' : '<th>Catatan</th><th>Oleh</th>'}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ---------- shopee ----------
async function loadShopee() {
  const box = document.getElementById('shopeeStatusBox');
  const text = document.getElementById('shopeeStatusText');
  try {
    const s = await api('/shopee/status');
    box.className = 'shopee-status ' + (s.connected ? 'connected' : 'disconnected');
    text.textContent = s.connected
      ? `Terhubung ke toko Shopee (Shop ID: ${s.shop_id})`
      : 'Belum terhubung ke toko Shopee manapun.';
  } catch (e) {
    text.textContent = 'Gagal memeriksa status.';
  }
}

document.getElementById('connectShopeeBtn').addEventListener('click', async () => {
  const msg = document.getElementById('shopeeMsg');
  msg.textContent = 'Membuat link autentikasi...';
  try {
    const { url } = await api('/shopee/auth-url');
    window.open(url, '_blank');
    msg.textContent = 'Silakan login & setujui akses di tab baru, lalu kembali ke sini.';
  } catch (e) {
    msg.textContent = e.message;
  }
});

document.getElementById('pullStockBtn').addEventListener('click', async () => {
  const msg = document.getElementById('shopeeMsg');
  msg.textContent = 'Menarik data stok dari Shopee...';
  try {
    const r = await api('/shopee/pull-stock', { method: 'POST' });
    msg.textContent = `Selesai. ${r.updated} produk diperbarui berdasarkan pencocokan SKU.`;
    loadOverview();
  } catch (e) {
    msg.textContent = e.message;
  }
});

// ---------- team ----------
async function loadTeam() {
  const { users } = await api('/auth/users');
  const rows = users
    .map(
      (u) => `
    <tr>
      <td>${u.name}</td>
      <td>${u.email}</td>
      <td><span class="badge ${u.role === 'admin' ? 'shopee_sync' : 'ok'}">${u.role}</span></td>
      <td>${u.id === CURRENT_USER.id ? '<span class="muted">Anda</span>' : `<button class="icon-btn" data-del="${u.id}">Hapus</button>`}</td>
    </tr>`
    )
    .join('');
  document.getElementById('teamTable').innerHTML = `
    <table>
      <thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Aksi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  document.querySelectorAll('#teamTable [data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Hapus pengguna ini?')) return;
      await api('/auth/users/' + btn.dataset.del, { method: 'DELETE' });
      loadTeam();
    });
  });
}

document.getElementById('addUserBtn').addEventListener('click', openAddUserModal);

// ---------- modals ----------
const backdrop = document.getElementById('modalBackdrop');
const modalBox = document.getElementById('modalBox');
function openModal(html) {
  modalBox.innerHTML = html;
  backdrop.classList.remove('hidden');
}
function closeModal() {
  backdrop.classList.add('hidden');
  modalBox.innerHTML = '';
}
backdrop.addEventListener('click', (e) => {
  if (e.target === backdrop) closeModal();
});

function openAddProductModal() {
  openModal(`
    <h3>Produk baru</h3>
    <form id="productForm">
      <label>SKU</label>
      <input name="sku" required placeholder="BRG-001" />
      <label>Nama produk</label>
      <input name="name" required placeholder="Kaos Polos Hitam L" />
      <label>Kategori</label>
      <input name="category" placeholder="Pakaian" />
      <label>Satuan</label>
      <input name="unit" placeholder="pcs" value="pcs" />
      <label>Stok awal</label>
      <input name="stock" type="number" min="0" value="0" />
      <label>Stok minimum (peringatan)</label>
      <input name="min_stock" type="number" min="0" value="5" />
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="cancelModal">Batal</button>
        <button type="submit" class="btn-primary">Simpan</button>
      </div>
    </form>
  `);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/products', {
        method: 'POST',
        body: {
          sku: fd.get('sku'),
          name: fd.get('name'),
          category: fd.get('category'),
          unit: fd.get('unit') || 'pcs',
          stock: Number(fd.get('stock')) || 0,
          min_stock: Number(fd.get('min_stock')) || 0,
        },
      });
      closeModal();
      loadProducts();
      loadOverview();
    } catch (err) {
      alert(err.message);
    }
  });
}

function openStockModal(product, action) {
  const isIn = action === 'in';
  openModal(`
    <h3>${isIn ? 'Stok masuk' : 'Stok keluar'} — ${product.name}</h3>
    <p class="modal-note">Stok saat ini: <b>${fmtNum(product.stock)} ${product.unit}</b></p>
    <form id="stockForm">
      <label>Jumlah</label>
      <input name="quantity" type="number" min="1" required />
      <label>Referensi (no. PO / pesanan, opsional)</label>
      <input name="reference" placeholder="PO-2026-001" />
      <label>Catatan</label>
      <textarea name="note" rows="2" placeholder="${isIn ? 'Terima dari supplier X' : 'Kirim ke pelanggan Y'}"></textarea>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="cancelModal">Batal</button>
        <button type="submit" class="btn-primary">${isIn ? 'Catat masuk' : 'Catat keluar'}</button>
      </div>
    </form>
  `);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.getElementById('stockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/stock/move', {
        method: 'POST',
        body: {
          product_id: product.id,
          type: action,
          quantity: Number(fd.get('quantity')),
          reference: fd.get('reference'),
          note: fd.get('note'),
        },
      });
      closeModal();
      loadProducts();
      loadOverview();
    } catch (err) {
      alert(err.message);
    }
  });
}

function confirmDeleteProduct(product) {
  if (!confirm(`Hapus produk "${product.name}"? Riwayat transaksinya juga akan terhapus.`)) return;
  api('/products/' + product.id, { method: 'DELETE' }).then(() => {
    loadProducts();
    loadOverview();
  });
}

function openAddUserModal() {
  openModal(`
    <h3>Tambah pengguna</h3>
    <form id="userForm">
      <label>Nama</label>
      <input name="name" required />
      <label>Email</label>
      <input name="email" type="email" required />
      <label>Password</label>
      <input name="password" type="password" required minlength="6" />
      <label>Role</label>
      <select name="role">
        <option value="staff">Staff</option>
        <option value="admin">Admin</option>
      </select>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="cancelModal">Batal</button>
        <button type="submit" class="btn-primary">Simpan</button>
      </div>
    </form>
  `);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/auth/users', {
        method: 'POST',
        body: {
          name: fd.get('name'),
          email: fd.get('email'),
          password: fd.get('password'),
          role: fd.get('role'),
        },
      });
      closeModal();
      loadTeam();
    } catch (err) {
      alert(err.message);
    }
  });
}

// ---------- utils ----------
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

tryAutoLogin();
