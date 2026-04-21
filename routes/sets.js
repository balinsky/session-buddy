const express = require('express');
const router = express.Router();
const db = require('../db/database');

function requireUser(req, res, next) {
  const syncCode = req.headers['x-sync-code'];
  if (!syncCode) return res.status(401).json({ error: 'Sync code required.' });
  const user = db.getUserBySyncCode(syncCode);
  if (!user) return res.status(401).json({ error: 'Invalid sync code.' });
  req.user = user;
  next();
}

router.use(requireUser);

router.get('/', (req, res) => {
  res.json(db.getSetsByUser(req.user.id));
});

router.get('/:id', (req, res) => {
  const set = db.getSetById(req.params.id, req.user.id);
  if (!set) return res.status(404).json({ error: 'Set not found.' });
  res.json(set);
});

router.post('/', (req, res) => {
  const { tuneIds } = req.body;
  if (!Array.isArray(tuneIds) || tuneIds.length < 1) {
    return res.status(400).json({ error: 'At least one tune is required.' });
  }
  const set = db.createSet(req.user.id, tuneIds);
  res.status(201).json(set);
});

router.put('/:id', (req, res) => {
  const { tuneIds } = req.body;
  if (!Array.isArray(tuneIds) || tuneIds.length < 1) {
    return res.status(400).json({ error: 'At least one tune is required.' });
  }
  const set = db.updateSet(req.params.id, req.user.id, tuneIds);
  if (!set) return res.status(404).json({ error: 'Set not found.' });
  res.json(set);
});

router.delete('/:id', (req, res) => {
  db.deleteSet(req.params.id, req.user.id);
  res.status(204).send();
});

module.exports = router;
