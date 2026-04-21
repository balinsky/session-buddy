const express = require('express');
const router = express.Router();
const db = require('../db/database');

const ADJECTIVES = [
  'swift', 'bright', 'bold', 'silver', 'golden', 'misty', 'ancient', 'hidden',
  'sacred', 'wild', 'fair', 'tall', 'old', 'deep', 'high', 'free', 'brave',
  'green', 'dark', 'quiet', 'strong', 'light', 'soft', 'clear', 'cold',
  'warm', 'sharp', 'smooth', 'round', 'proud',
];

const NOUNS = [
  'glen', 'loch', 'hill', 'shore', 'moor', 'vale', 'ford', 'cairn', 'isle',
  'peak', 'rath', 'cove', 'brook', 'burn', 'cliff', 'field', 'grove', 'heath',
  'marsh', 'plain', 'ridge', 'river', 'stone', 'stream', 'tower', 'track',
  'woods', 'sea', 'bay', 'pass',
];

function generateSyncCode() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${adj}-${noun}-${num}`;
}

router.post('/new', async (req, res) => {
  try {
    let syncCode;
    let attempts = 0;
    do {
      syncCode = generateSyncCode();
      attempts++;
    } while ((await db.getUserBySyncCode(syncCode)) && attempts < 100);

    if (attempts >= 100) {
      return res.status(500).json({ error: 'Could not generate a unique sync code, please try again.' });
    }

    const user = await db.createUser(syncCode);
    res.json({ syncCode: user.sync_code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/join', async (req, res) => {
  try {
    const { syncCode } = req.body;
    if (!syncCode) return res.status(400).json({ error: 'Sync code required.' });

    const user = await db.getUserBySyncCode(syncCode.toLowerCase().trim());
    if (!user) return res.status(404).json({ error: 'Sync code not found. Check for typos and try again.' });

    res.json({ syncCode: user.sync_code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
