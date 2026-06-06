import HID from 'node-hid';
import { encodeTextMacro } from './via-keycodes.js';

const VENDOR_ID  = 0x574c;
const PRODUCT_ID = 0xe6e3;

// VIA protocol command IDs
const CMD_GET_KEYCODE         = 0x04;
const CMD_SET_KEYCODE         = 0x05;
const CMD_MACRO_GET_COUNT     = 0x0C;
const CMD_MACRO_GET_BUF_SIZE  = 0x0D;
const CMD_MACRO_GET_BUF       = 0x0E;
const CMD_MACRO_SET_BUF       = 0x0F;
const CMD_MACRO_RESET         = 0x10;

const REPORT_SIZE = 32;

// Creator Micro 12-key matrix: key number (1-12) → [row, col]
function keyMatrix(keyNum) {
  if (keyNum < 1 || keyNum > 12) throw new Error(`Invalid key number: ${keyNum}`);
  if (keyNum <= 6) return [0, keyNum - 1];
  return [1, keyNum - 7];
}

function openDevice() {
  // Try to find VIA usage page first (0xFF60/0x61)
  const devices = HID.devices().filter(d =>
    d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID
  );
  if (devices.length === 0) {
    throw new Error(`Creator Micro not found (VID:0x${VENDOR_ID.toString(16)} PID:0x${PRODUCT_ID.toString(16)}). Is it connected?`);
  }
  // Prefer VIA usage page
  const via = devices.find(d => d.usagePage === 0xFF60 && d.usage === 0x61);
  const target = via || devices[0];
  return new HID.HID(target.path);
}

function sendReport(dev, data) {
  const report = Buffer.alloc(REPORT_SIZE + 1, 0); // +1 for report ID
  report[0] = 0x00; // report ID
  data.copy(report, 1, 0, Math.min(data.length, REPORT_SIZE));
  dev.write([...report]);
  return Buffer.from(dev.readTimeout(1000));
}

export function keyboardListDevices() {
  return HID.devices()
    .filter(d => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID)
    .map(d => ({ path: d.path, usagePage: d.usagePage, usage: d.usage, product: d.product }));
}

export function keyboardGetKeycode(layer, keyNum) {
  const [row, col] = keyMatrix(keyNum);
  const dev = openDevice();
  try {
    const cmd = Buffer.alloc(REPORT_SIZE, 0);
    cmd[0] = CMD_GET_KEYCODE;
    cmd[1] = layer;
    cmd[2] = row;
    cmd[3] = col;
    const resp = sendReport(dev, cmd);
    const keycode = (resp[5] << 8) | resp[6];
    return { layer, keyNum, row, col, keycode: `0x${keycode.toString(16).padStart(4, '0')}` };
  } finally {
    dev.close();
  }
}

export function keyboardSetKeycode(layer, keyNum, keycode) {
  const [row, col] = keyMatrix(keyNum);
  const kc = typeof keycode === 'string'
    ? parseInt(keycode, keycode.startsWith('0x') ? 16 : 10)
    : keycode;
  const dev = openDevice();
  try {
    const cmd = Buffer.alloc(REPORT_SIZE, 0);
    cmd[0] = CMD_SET_KEYCODE;
    cmd[1] = layer;
    cmd[2] = row;
    cmd[3] = col;
    cmd[4] = (kc >> 8) & 0xFF;
    cmd[5] = kc & 0xFF;
    sendReport(dev, cmd);
    return { ok: true, layer, keyNum, row, col, keycode: `0x${kc.toString(16).padStart(4, '0')}` };
  } finally {
    dev.close();
  }
}

export function macroGetCount() {
  const dev = openDevice();
  try {
    const cmd = Buffer.alloc(REPORT_SIZE, 0);
    cmd[0] = CMD_MACRO_GET_COUNT;
    const resp = sendReport(dev, cmd);
    return { count: resp[1] };
  } finally {
    dev.close();
  }
}

export function macroGetBufferSize() {
  const dev = openDevice();
  try {
    const cmd = Buffer.alloc(REPORT_SIZE, 0);
    cmd[0] = CMD_MACRO_GET_BUF_SIZE;
    const resp = sendReport(dev, cmd);
    return { size: (resp[1] << 8) | resp[2] };
  } finally {
    dev.close();
  }
}

// Read raw macro buffer at offset
function macroReadChunk(dev, offset, size) {
  const cmd = Buffer.alloc(REPORT_SIZE, 0);
  cmd[0] = CMD_MACRO_GET_BUF;
  cmd[1] = (offset >> 8) & 0xFF;
  cmd[2] = offset & 0xFF;
  cmd[3] = size;
  const resp = sendReport(dev, cmd);
  return resp.slice(4, 4 + size);
}

// Write raw macro buffer at offset
function macroWriteChunk(dev, offset, data) {
  const cmd = Buffer.alloc(REPORT_SIZE, 0);
  cmd[0] = CMD_MACRO_SET_BUF;
  cmd[1] = (offset >> 8) & 0xFF;
  cmd[2] = offset & 0xFF;
  cmd[3] = data.length;
  data.copy(cmd, 4);
  sendReport(dev, cmd);
}

// Read all macros, return as array of decoded strings
export function macroGetAll() {
  const dev = openDevice();
  try {
    const { count } = macroGetCount();
    const { size } = macroGetBufferSize();
    // Read full buffer in 28-byte chunks (32 - 4 header bytes)
    const chunkSize = 28;
    const fullBuf = Buffer.alloc(size, 0);
    for (let offset = 0; offset < size; offset += chunkSize) {
      const read = Math.min(chunkSize, size - offset);
      const chunk = macroReadChunk(dev, offset, read);
      chunk.copy(fullBuf, offset);
    }
    // Split by double-null (macro separator)
    const macros = [];
    let start = 0;
    for (let i = 0; i < fullBuf.length; i++) {
      if (fullBuf[i] === 0x00) {
        macros.push(fullBuf.slice(start, i).toString('latin1'));
        start = i + 1;
        if (macros.length >= count) break;
      }
    }
    return { count, macros };
  } finally {
    dev.close();
  }
}

// Set macro slot N to a text command string (e.g., "git status\n")
export function macroSetText(slot, text) {
  const dev = openDevice();
  try {
    const { count } = macroGetCount();
    const { size } = macroGetBufferSize();
    if (slot < 0 || slot >= count) throw new Error(`Slot ${slot} out of range (0-${count - 1})`);

    // Read current full buffer
    const chunkSize = 28;
    const fullBuf = Buffer.alloc(size, 0);
    for (let offset = 0; offset < size; offset += chunkSize) {
      const read = Math.min(chunkSize, size - offset);
      macroReadChunk(dev, offset, read).copy(fullBuf, offset);
    }

    // Parse existing macros to find slot offsets
    const offsets = [0];
    let macroIdx = 0;
    for (let i = 0; i < fullBuf.length && macroIdx < count - 1; i++) {
      if (fullBuf[i] === 0x00) {
        offsets.push(i + 1);
        macroIdx++;
      }
    }

    const slotStart = offsets[slot];
    // Find next slot start or end of used region
    const slotEnd = offsets[slot + 1] || (slotStart + 256);

    // Encode new macro
    const newData = encodeTextMacro(text);
    if (newData.length > slotEnd - slotStart) {
      throw new Error(`Macro too long: ${newData.length} bytes, slot has ${slotEnd - slotStart} bytes`);
    }

    // Write new macro data
    newData.copy(fullBuf, slotStart);
    // Write modified chunks back
    for (let offset = slotStart; offset < slotStart + newData.length; offset += chunkSize) {
      const write = Math.min(chunkSize, slotStart + newData.length - offset);
      macroWriteChunk(dev, offset, fullBuf.slice(offset, offset + write));
    }

    return { ok: true, slot, text, bytes: newData.length };
  } finally {
    dev.close();
  }
}
