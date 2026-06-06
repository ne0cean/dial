// State
let dialConfig = null;
let keymapConfig = null;
let currentDialApp = 'default';
let currentLayer = 0;
let selectedEl = null;
let selectedTarget = null; // { type: 'dial'|'key'|'encoder', ... }

// MAC key labels for display
const KEY_LABELS = {
  'KC_NO': '', 'KC_TRNS': '▽',
  'KC_A':'A','KC_B':'B','KC_C':'C','KC_D':'D','KC_E':'E','KC_F':'F',
  'KC_G':'G','KC_H':'H','KC_I':'I','KC_J':'J','KC_K':'K','KC_L':'L',
  'KC_M':'M','KC_N':'N','KC_O':'O','KC_P':'P','KC_Q':'Q','KC_R':'R',
  'KC_S':'S','KC_T':'T','KC_U':'U','KC_V':'V','KC_W':'W','KC_X':'X',
  'KC_Y':'Y','KC_Z':'Z',
  'KC_1':'1','KC_2':'2','KC_3':'3','KC_4':'4','KC_5':'5',
  'KC_6':'6','KC_7':'7','KC_8':'8','KC_9':'9','KC_0':'0',
  'KC_ENT':'Enter','KC_ESC':'Esc','KC_BSPC':'Bksp','KC_TAB':'Tab',
  'KC_SPC':'Space','KC_MUTE':'Mute','KC_VOLU':'Vol+','KC_VOLD':'Vol-',
  'KC_BRIU':'Bri+','KC_BRID':'Bri-','KC_PGUP':'PgUp','KC_PGDN':'PgDn',
  'KC_LEFT':'←','KC_RGHT':'→','KC_UP':'↑','KC_DOWN':'↓',
  'KC_PSCR':'PrtSc','KC_SCLN':';','KC_QUOT':"'",
};

// Modifier display
const MOD_LABELS = { command:'⌘ Cmd', shift:'⇧ Shift', control:'⌃ Ctrl', option:'⌥ Opt' };

// Init
async function init() {
  await Promise.all([loadDialConfig(), loadKeymap()]);
  renderDialPanel();
  renderMicroPanel();
  bindEvents();
}

// --- Data Loading ---

async function loadDialConfig() {
  const r = await fetch('/api/dial');
  dialConfig = await r.json();
}

async function loadKeymap() {
  const r = await fetch('/api/keymap');
  keymapConfig = await r.json();
  if (!keymapConfig.layers) keymapConfig = { layers: defaultLayers() };
}

function defaultLayers() {
  return [0,1,2,3].map(l => ({
    layer: l,
    keys: Array(12).fill('KC_NO'),
    macros: Array(12).fill(''),
    encoders: [
      { cw:'KC_NO', ccw:'KC_NO', click:'KC_NO', cwMacro:'', ccwMacro:'', clickMacro:'' },
      { cw:'KC_NO', ccw:'KC_NO', click:'KC_NO', cwMacro:'', ccwMacro:'', clickMacro:'' },
    ]
  }));
}

// --- Dial Panel ---

function renderDialPanel() {
  // App selector
  const sel = document.getElementById('dial-app-select');
  const current = sel.value;
  sel.innerHTML = '<option value="default">Default</option>';
  if (dialConfig.apps) {
    Object.keys(dialConfig.apps).forEach(bid => {
      const o = document.createElement('option');
      o.value = bid;
      o.textContent = bid;
      sel.appendChild(o);
    });
  }
  sel.value = current;
  currentDialApp = sel.value;

  // Remove btn visibility
  document.getElementById('btn-remove-app').style.display =
    currentDialApp === 'default' ? 'none' : '';

  // Render previews
  const mode = currentDialApp === 'default'
    ? dialConfig.default
    : (dialConfig.apps?.[currentDialApp] || {});

  renderDialPreview('cw', mode.rotateClockwise);
  renderDialPreview('ccw', mode.rotateCounterClockwise);
  renderDialPreview('click', mode.click);
  renderDialPreview('long', mode.longPress);
}

function renderDialPreview(id, action) {
  const el = document.getElementById(`preview-${id}`);
  if (!el) return;
  el.textContent = actionLabel(action);
}

function actionLabel(action) {
  if (!action) return '';
  if (action.type === 'key') {
    const mods = (action.modifiers || []).map(m => ({ command:'⌘', shift:'⇧', control:'⌃', option:'⌥' }[m] || m)).join('');
    return mods + (action.keyCode !== undefined ? ` [${action.keyCode}]` : '');
  }
  if (action.type === 'activate') return action.bundleId || '';
  return '';
}

// --- Creator Micro Panel ---

function renderMicroPanel() {
  renderKeyGrid();
  renderEncoders();
}

function renderKeyGrid() {
  const grid = document.getElementById('key-grid');
  grid.innerHTML = '';
  const layer = getLayer(currentLayer);

  for (let i = 0; i < 12; i++) {
    const kc = layer.keys[i] || 'KC_NO';
    const macro = layer.macros?.[i] || '';
    const div = document.createElement('div');
    div.className = 'key';
    div.dataset.keyIdx = i;
    div.innerHTML = `
      <span class="key-num">${i + 1}</span>
      <span class="key-label">${macro || KEY_LABELS[kc] || kc}</span>
    `;
    div.addEventListener('click', () => selectKey(div, i));
    grid.appendChild(div);
  }
}

function renderEncoders() {
  const layer = getLayer(currentLayer);
  document.querySelectorAll('.enc-btn').forEach(btn => {
    const enc = btn.dataset.enc === 'L' ? 0 : 1;
    const dir = btn.dataset.dir;
    const encoder = layer.encoders?.[enc] || {};
    const macroKey = dir + 'Macro';
    const kcKey = dir;
    const text = encoder[macroKey] || KEY_LABELS[encoder[kcKey]] || encoder[kcKey] || '';
    btn.querySelector('.action-preview').textContent = text;
  });
}

function getLayer(idx) {
  if (!keymapConfig.layers) keymapConfig.layers = defaultLayers();
  while (keymapConfig.layers.length <= idx) keymapConfig.layers.push({
    layer: keymapConfig.layers.length,
    keys: Array(12).fill('KC_NO'),
    macros: Array(12).fill(''),
    encoders: [
      { cw:'KC_NO',ccw:'KC_NO',click:'KC_NO',cwMacro:'',ccwMacro:'',clickMacro:'' },
      { cw:'KC_NO',ccw:'KC_NO',click:'KC_NO',cwMacro:'',ccwMacro:'',clickMacro:'' },
    ]
  });
  return keymapConfig.layers[idx];
}

// --- Selection & Edit Panel ---

function selectDialEvent(el, eventKey) {
  clearSelection();
  el.classList.add('selected');
  selectedEl = el;
  selectedTarget = { type: 'dial', eventKey };
  const mode = currentDialApp === 'default'
    ? dialConfig.default || {}
    : dialConfig.apps?.[currentDialApp] || {};
  openEditPanel(`Dial: ${eventKey}`, renderDialEditForm(mode[eventKey]));
}

function selectKey(el, idx) {
  clearSelection();
  el.classList.add('selected');
  selectedEl = el;
  selectedTarget = { type: 'key', idx };
  const layer = getLayer(currentLayer);
  openEditPanel(`키 ${idx + 1} (L${currentLayer})`, renderKeyEditForm(layer.keys[idx], layer.macros?.[idx]));
}

function selectEncoder(el, encIdx, dir) {
  clearSelection();
  el.classList.add('selected');
  selectedEl = el;
  selectedTarget = { type: 'encoder', encIdx, dir };
  const layer = getLayer(currentLayer);
  const enc = layer.encoders?.[encIdx] || {};
  openEditPanel(`Enc${encIdx === 0 ? 'L' : 'R'} ${dir}`, renderKeyEditForm(enc[dir], enc[dir + 'Macro']));
}

function clearSelection() {
  document.querySelectorAll('.selected').forEach(e => e.classList.remove('selected'));
}

function openEditPanel(title, body) {
  document.getElementById('edit-title').textContent = title;
  document.getElementById('edit-body').innerHTML = body;
  document.getElementById('edit-panel').classList.remove('hidden');
  bindEditFormEvents();
}

// --- Edit Forms ---

function renderDialEditForm(action) {
  const type = action?.type || 'key';
  const kc = action?.keyCode ?? '';
  const mods = action?.modifiers || [];
  const bundleId = action?.bundleId || '';

  return `
    <div class="edit-form">
      <div class="form-group">
        <label>타입</label>
        <div class="type-tabs">
          <div class="type-tab ${type === 'key' ? 'active' : ''}" data-type="key">키 입력</div>
          <div class="type-tab ${type === 'activate' ? 'active' : ''}" data-type="activate">앱 활성화</div>
        </div>
      </div>
      <div id="form-key-fields" style="${type !== 'key' ? 'display:none' : ''}">
        <div class="form-group">
          <label>KeyCode</label>
          <input type="number" id="edit-keycode" value="${kc}" placeholder="48 = Tab, 36 = Enter...">
        </div>
        <div class="form-group">
          <label>Modifiers</label>
          <div class="modifier-group">
            ${Object.entries(MOD_LABELS).map(([k,v]) =>
              `<div class="modifier-btn ${mods.includes(k) ? 'active' : ''}" data-mod="${k}">${v}</div>`
            ).join('')}
          </div>
        </div>
      </div>
      <div id="form-activate-fields" style="${type !== 'activate' ? 'display:none' : ''}">
        <div class="form-group">
          <label>Bundle ID</label>
          <input type="text" id="edit-bundleid" value="${bundleId}" placeholder="com.google.Chrome">
        </div>
      </div>
      <button class="edit-save" id="edit-apply">적용</button>
    </div>
  `;
}

function renderKeyEditForm(kc, macro) {
  return `
    <div class="edit-form">
      <div class="form-group">
        <label>매크로 텍스트 (우선)</label>
        <input type="text" id="edit-macro" value="${macro || ''}" placeholder="git status\n">
        <small style="color:var(--muted);margin-top:4px;">\\n 으로 Enter. 비우면 Keycode 사용.</small>
      </div>
      <div class="form-group">
        <label>QMK Keycode</label>
        <input type="text" id="edit-kc" value="${kc || 'KC_NO'}" placeholder="KC_ENT, KC_A...">
      </div>
      <button class="edit-save" id="edit-apply">적용</button>
    </div>
  `;
}

function bindEditFormEvents() {
  // Type tabs
  document.querySelectorAll('.type-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const t = tab.dataset.type;
      document.getElementById('form-key-fields').style.display = t === 'key' ? '' : 'none';
      document.getElementById('form-activate-fields').style.display = t === 'activate' ? '' : 'none';
    });
  });

  // Modifier buttons
  document.querySelectorAll('.modifier-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  // Apply
  const applyBtn = document.getElementById('edit-apply');
  if (applyBtn) applyBtn.addEventListener('click', applyEdit);
}

function applyEdit() {
  if (!selectedTarget) return;

  if (selectedTarget.type === 'dial') {
    const activeType = document.querySelector('.type-tab.active')?.dataset.type || 'key';
    let action;
    if (activeType === 'key') {
      const kc = parseInt(document.getElementById('edit-keycode')?.value || '0');
      const mods = [...document.querySelectorAll('.modifier-btn.active')].map(b => b.dataset.mod);
      action = { type: 'key', keyCode: kc, modifiers: mods };
    } else {
      const bid = document.getElementById('edit-bundleid')?.value || '';
      action = { type: 'activate', bundleId: bid };
    }

    if (currentDialApp === 'default') {
      dialConfig.default = dialConfig.default || {};
      dialConfig.default[selectedTarget.eventKey] = action;
    } else {
      dialConfig.apps = dialConfig.apps || {};
      dialConfig.apps[currentDialApp] = dialConfig.apps[currentDialApp] || {};
      dialConfig.apps[currentDialApp][selectedTarget.eventKey] = action;
    }
    renderDialPanel();

  } else if (selectedTarget.type === 'key') {
    const macro = document.getElementById('edit-macro')?.value || '';
    const kc = document.getElementById('edit-kc')?.value || 'KC_NO';
    const layer = getLayer(currentLayer);
    layer.keys[selectedTarget.idx] = kc;
    if (!layer.macros) layer.macros = Array(12).fill('');
    layer.macros[selectedTarget.idx] = macro;
    renderKeyGrid();

  } else if (selectedTarget.type === 'encoder') {
    const macro = document.getElementById('edit-macro')?.value || '';
    const kc = document.getElementById('edit-kc')?.value || 'KC_NO';
    const layer = getLayer(currentLayer);
    if (!layer.encoders) layer.encoders = defaultLayers()[0].encoders;
    layer.encoders[selectedTarget.encIdx][selectedTarget.dir] = kc;
    layer.encoders[selectedTarget.encIdx][selectedTarget.dir + 'Macro'] = macro;
    renderEncoders();
  }

  showStatus('변경됨 (미저장)');
}

// --- Save ---

async function saveAll() {
  showStatus('저장 중...');
  try {
    await Promise.all([
      fetch('/api/dial', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(dialConfig) }),
      fetch('/api/keymap', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(keymapConfig) }),
    ]);
    showStatus('저장 완료');
  } catch (e) {
    showStatus('오류: ' + e.message);
  }
}

function showStatus(msg) {
  const el = document.getElementById('status');
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 3000);
}

// --- Events ---

function bindEvents() {
  // Dial events
  document.querySelectorAll('.dial-event').forEach(el => {
    el.addEventListener('click', () => selectDialEvent(el, el.dataset.event));
  });
  document.getElementById('de-click').addEventListener('click', () =>
    selectDialEvent(document.getElementById('de-click'), 'click'));

  // App selector
  document.getElementById('dial-app-select').addEventListener('change', e => {
    currentDialApp = e.target.value;
    document.getElementById('btn-remove-app').style.display =
      currentDialApp === 'default' ? 'none' : '';
    renderDialPanel();
  });

  // Add app
  document.getElementById('btn-add-app').addEventListener('click', async () => {
    const bid = prompt('앱 Bundle ID 입력 (예: com.google.Chrome)');
    if (!bid) return;
    dialConfig.apps = dialConfig.apps || {};
    dialConfig.apps[bid] = {};
    currentDialApp = bid;
    renderDialPanel();
    document.getElementById('dial-app-select').value = bid;
  });

  // Remove app
  document.getElementById('btn-remove-app').addEventListener('click', () => {
    if (!confirm(`${currentDialApp} 삭제?`)) return;
    delete dialConfig.apps[currentDialApp];
    currentDialApp = 'default';
    renderDialPanel();
  });

  // Layer tabs
  document.querySelectorAll('.layer-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.layer-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentLayer = parseInt(tab.dataset.layer);
      renderMicroPanel();
    });
  });

  // Encoder buttons
  document.querySelectorAll('.enc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const encIdx = btn.dataset.enc === 'L' ? 0 : 1;
      selectEncoder(btn, encIdx, btn.dataset.dir);
    });
  });

  // Save
  document.getElementById('btn-save').addEventListener('click', saveAll);

  // Close edit panel
  document.getElementById('edit-close').addEventListener('click', () => {
    document.getElementById('edit-panel').classList.add('hidden');
    clearSelection();
    selectedTarget = null;
  });
}

init();
