// Class and Class Series CRUD (design/Classes.md, phase 2). Routes here both
// live under /api/classes/* and /api/class-series/* (same router, separate
// path prefixes via the express mount in server.js? — no, easier: we mount
// this once at /api and it owns both prefixes).

const express = require('express');
const router = express.Router();
const db = require('../db/database');
const requireUser = require('../middleware/requireUser');

router.use(requireUser);

// --- /api/classes -------------------------------------------------------

router.get('/classes', async (req, res) => {
  try {
    res.json(await db.getClassesByUser(req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/classes/:id', async (req, res) => {
  try {
    const klass = await db.getClassById(req.params.id, req.user.id);
    if (!klass) return res.status(404).json({ error: 'Class not found.' });
    res.json(klass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/classes', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Class name is required.' });
    const klass = await db.createClass(req.user.id, req.body);
    res.status(201).json(klass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/classes/:id', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Class name is required.' });
    const klass = await db.updateClass(req.params.id, req.user.id, req.body);
    if (!klass) return res.status(404).json({ error: 'Class not found.' });
    res.json(klass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/classes/:id', async (req, res) => {
  try {
    await db.deleteClass(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- /api/class-series --------------------------------------------------

router.get('/class-series', async (req, res) => {
  try {
    res.json(await db.getClassSeriesByUser(req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/class-series/:id', async (req, res) => {
  try {
    const series = await db.getClassSeriesById(req.params.id, req.user.id);
    if (!series) return res.status(404).json({ error: 'Series not found.' });
    res.json(series);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/class-series', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Series name is required.' });
    const series = await db.createClassSeries(req.user.id, req.body);
    res.status(201).json(series);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/class-series/:id', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Series name is required.' });
    const series = await db.updateClassSeries(req.params.id, req.user.id, req.body);
    if (!series) return res.status(404).json({ error: 'Series not found.' });
    res.json(series);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/class-series/:id', async (req, res) => {
  try {
    await db.deleteClassSeries(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
