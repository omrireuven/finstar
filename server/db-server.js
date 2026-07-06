import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || './finstar-db.json';

app.use(express.json({ limit: '50mb' }));

// Ensure file exists
if (!existsSync(DB_FILE)) {
  writeFileSync(DB_FILE, '{}', 'utf-8');
}

// GET /api/db — return stored state
app.get('/api/db', (_req, res) => {
  try {
    const raw = readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);
    res.json(data);
  } catch {
    res.json({});
  }
});

const SETTINGS_FILE = process.env.SETTINGS_FILE || '../finstar-settings.json';

// Ensure settings file exists
if (!existsSync(SETTINGS_FILE)) {
  writeFileSync(SETTINGS_FILE, '{}', 'utf-8');
}

// GET /api/settings — return stored settings
app.get('/api/settings', (_req, res) => {
  try {
    const raw = readFileSync(SETTINGS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    res.json(data);
  } catch {
    res.json({});
  }
});

// POST /api/settings — save settings
app.post('/api/settings', (req, res) => {
  try {
    const body = req.body;
    writeFileSync(SETTINGS_FILE, JSON.stringify(body), 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to write Settings:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/db — save state
app.post('/api/db', (req, res) => {
  try {
    const body = req.body;
    writeFileSync(DB_FILE, JSON.stringify(body), 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to write DB:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`💾 Finstar DB Server running on port ${PORT}`);
});
