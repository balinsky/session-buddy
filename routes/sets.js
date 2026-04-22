const express = require('express');
const router = express.Router();
const db = require('../db/database');

async function requireUser(req, res, next) {
  try {
    const syncCode = req.headers['x-sync-code'];
    if (!syncCode) return res.status(401).json({ error: 'Sync code required.' });
    const user = await db.getUserBySyncCode(syncCode);
    if (!user) return res.status(401).json({ error: 'Invalid sync code.' });
    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.use(requireUser);

router.get('/', async (req, res) => {
  try {
    res.json(await db.getSetsByUser(req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const set = await db.getSetById(req.params.id, req.user.id);
    if (!set) return res.status(404).json({ error: 'Set not found.' });
    res.json(set);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { tuneIds } = req.body;
    if (!Array.isArray(tuneIds) || tuneIds.length < 1) {
      return res.status(400).json({ error: 'At least one tune is required.' });
    }
    const set = await db.createSet(req.user.id, tuneIds);
    res.status(201).json(set);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { tuneIds } = req.body;
    if (!Array.isArray(tuneIds) || tuneIds.length < 1) {
      return res.status(400).json({ error: 'At least one tune is required.' });
    }
    const set = await db.updateSet(req.params.id, req.user.id, tuneIds);
    if (!set) return res.status(404).json({ error: 'Set not found.' });
    res.json(set);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const set = await db.patchSet(req.params.id, req.user.id, req.body);
    if (!set) return res.status(404).json({ error: 'Set not found.' });
    res.json(set);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/practice', async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'Date is required.' });
    const set = await db.practiceSet(req.params.id, req.user.id, date);
    if (!set) return res.status(404).json({ error: 'Set not found.' });
    res.json(set);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.deleteSet(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
