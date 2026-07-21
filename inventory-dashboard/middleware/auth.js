const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ganti-secret-ini-di-env';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token tidak ditemukan, silakan login.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesi tidak valid atau kedaluwarsa, silakan login ulang.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Hanya admin yang boleh melakukan aksi ini.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, JWT_SECRET };
