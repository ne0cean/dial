import fs from 'fs';
import { execSync } from 'child_process';

const CONFIG_PATH = `${process.env.HOME}/.mac-dial/config.json`;

export function dialGet() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { error: 'config.json not found at ' + CONFIG_PATH };
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

// event: rotateClockwise | rotateCounterClockwise | click | longPress
// app: bundle ID or "default"
// action: { type: "key", keyCode: N, modifiers: [...] } | { type: "activate", bundleId: "..." }
export function dialSet(app, event, action) {
  const config = dialGet();
  if (config.error) throw new Error(config.error);

  if (app === 'default') {
    config.default = config.default || {};
    config.default[event] = action;
  } else {
    config.apps = config.apps || {};
    config.apps[app] = config.apps[app] || {};
    config.apps[app][event] = action;
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  daemonRestart();
  return { ok: true, config };
}

export function dialRemoveApp(bundleId) {
  const config = dialGet();
  if (config.error) throw new Error(config.error);
  if (config.apps && config.apps[bundleId]) {
    delete config.apps[bundleId];
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    daemonRestart();
    return { ok: true, removed: bundleId };
  }
  return { ok: false, message: `${bundleId} not found` };
}

function daemonRestart() {
  try {
    const uid = execSync('id -u', { encoding: 'utf8' }).trim();
    execSync(`launchctl kickstart -k gui/${uid}/com.noir.surface-dial`, { encoding: 'utf8' });
  } catch (e) {
    // Daemon not running is OK - config still saved
    console.error('[dial] daemon restart skipped:', e.message);
  }
}
