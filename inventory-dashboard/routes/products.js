const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/products?search=&category=
router.get('/', (req, res) => {
  const { search, category } = req.query;
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (name LIKE ? OR sku LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  query += ' ORDER BY name ASC';

  const products = db.prepare(query).all(...params);
  res.json({ products });
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  res.json({ product });
});

// POST /api/products
router.post('/', (req, res) => {
  const { sku, name, category, unit, stock, min_stock, price } = req.body;
  if (!sku || !name) return res.status(400).json({ error: 'SKU dan nama produk wajib diisi.' });

  const exists = db.prepare('SELECT id FROM products WHERE sku = ?').get(sku);
  if (exists) return res.status(409).json({ error: 'SKU sudah dipakai produk lain.' });

  const info = db
    .prepare(
      `INSERT INTO products (sku, name, category, unit, stock, min_stock, price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(sku, name, category || null, unit || 'pcs', stock || 0, min_stock || 0, price || 0);

  if (stock && stock > 0) {
    db.prepare(
      `INSERT INTO stock_movements (product_id, type, quantity, stock_after, note, user_id)
       VALUES (?, 'in', ?, ?, 'Stok awal produk baru', ?)`
    ).run(info.lastInsertRowid, stock, stock, req.user.id);
  }

  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/products/:id
router.put('/:id', (req, res) => {
  const { name, category, unit, min_stock, price } = req.body;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan.' });

  db.prepare(
    `UPDATE products SET name = ?, category = ?, unit = ?, min_stock = ?, price = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? product.name,
    category ?? product.category,
    unit ?? product.unit,
    min_stock ?? product.min_stock,
    price ?? product.price,
    req.params.id
  );

  res.json({ ok: true });
});

// DELETE /api/products/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM stock_movements WHERE product_id = ?').run(req.params.id);
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
