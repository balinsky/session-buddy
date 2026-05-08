// Musician CRUD (design/Classes.md, phase 2). Currently the entity is used
// only as a class instructor; the musician detail view returns the list of
// classes they've taught (search-by-instructor — design Q-D).

const express = require('express');
const router = express.Router();
const db = require('../db/database');
const requireUser = require('../middleware/requireUser');

router.use(requireUser);

router.get('/', async (req, res) => {
  try {
    res.json(await db.getMusiciansByUser(req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const musician = await db.getMusicianById(req.params.id, req.user.id);
    if (!musician) return res.status(404).json({ error: 'Musician not found.' });
    res.json(musician);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Musician name is required.' });
    const musician = await db.createMusician(req.user.id, req.body);
    res.status(201).json(musician);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Musician name is required.' });
    const musician = await db.updateMusician(req.params.id, req.user.id, req.body);
    if (!musician) return res.status(404).json({ error: 'Musician not found.' });
    res.json(musician);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.deleteMusician(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
