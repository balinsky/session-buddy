const express = require('express');
const router = express.Router();
const db = require('../db/database');
const requireUser = require('../middleware/requireUser');

router.use(requireUser);

router.get('/', async (req, res) => {
  try {
    res.json(await db.getSetlistsByUser(req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sl = await db.getSetlistById(req.params.id, req.user.id);
    if (!sl) return res.status(404).json({ error: 'Setlist not found.' });
    res.json(sl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Setlist name is required.' });
    const sl = await db.createSetlist(req.user.id, req.body);
    res.status(201).json(sl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Setlist name is required.' });
    const sl = await db.updateSetlist(req.params.id, req.user.id, req.body);
    if (!sl) return res.status(404).json({ error: 'Setlist not found.' });
    res.json(sl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.deleteSetlist(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
