import express from 'express';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3333;

const DIAL_CONFIG = path.join(process.env.HOME, '.mac-dial/config.json');
const KEYMAP_PATH = path.join(__dirname, '../creator-micro/via-profiles/keymap.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Dial API ---

app.get('/api/dial', (req, res) => {
  try {
    const raw = fs.readFileSync(DIAL_CONFIG, 'utf8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(404).json({ error: 'config.json not found', path: DIAL_CONFIG });
  }
});

app.post('/api/dial', (req, res) => {
  try {
    fs.mkdirSync(path.dirname(DIAL_CONFIG), { recursive: true });
    fs.writeFileSync(DIAL_CONFIG, JSON.stringify(req.body, null, 2), 'utf8');
    daemonRestart();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Keymap API ---

app.get('/api/keymap', (req, res) => {
  try {
    if (!fs.existsSync(KEYMAP_PATH)) return res.json(defaultKeymap());
    res.json(JSON.parse(fs.readFileSync(KEYMAP_PATH, 'utf8')));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/keymap', (req, res) => {
  try {
    fs.mkdirSync(path.dirname(KEYMAP_PATH), { recursive: true });
    fs.writeFileSync(KEYMAP_PATH, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Apps API ---

app.get('/api/apps', (req, res) => {
  try {
    const script = `tell application "System Events" to get bundle identifier of every process whose background only is false`;
    const raw = execSync(`osascript -e '${script}'`, { encoding: 'utf8' }).trim();
    const apps = raw.split(', ').filter(Boolean).sort();
    res.json({ apps });
  } catch (e) {
    res.json({ apps: [] });
  }
});

// --- Helpers ---

function daemonRestart() {
  try {
    const uid = execSync('id -u', { encoding: 'utf8' }).trim();
    execSync(`launchctl kickstart -k gui/${uid}/com.noir.surface-dial`, { encoding: 'utf8' });
  } catch {
    // Daemon not running is OK
  }
}

function defaultKeymap() {
  const layers = [0, 1, 2, 3].map(l => ({
    layer: l,
    keys: Array(12).fill('KC_NO'),
    encoders: [
      { cw: 'KC_NO', ccw: 'KC_NO', click: 'KC_NO' },
      { cw: 'KC_NO', ccw: 'KC_NO', click: 'KC_NO' },
    ],
  }));
  return { layers };
}

app.listen(PORT, () => {
  console.log(`[dial] http://localhost:${PORT}`);
  console.log(`[dial] config: ${DIAL_CONFIG}`);
  console.log(`[dial] keymap: ${KEYMAP_PATH}`);
});
