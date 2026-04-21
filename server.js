require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db/database');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/sync', require('./routes/sync'));
app.use('/api/tunes', require('./routes/tunes'));
app.use('/api/sets', require('./routes/sets'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Session Buddy running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  });
