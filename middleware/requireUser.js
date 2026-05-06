const db = require('../db/database');

// Resolves the sync code into req.user, or returns 401.
// Accept sync code from header (API calls) or query param (image src URLs).
async function requireUser(req, res, next) {
  try {
    const syncCode = req.headers['x-sync-code'] || req.query.code;
    if (!syncCode) return res.status(401).json({ error: 'Sync code required.' });
    const user = await db.getUserBySyncCode(syncCode);
    if (!user) return res.status(401).json({ error: 'Invalid sync code.' });
    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = requireUser;
