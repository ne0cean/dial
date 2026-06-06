// QMK basic keycodes for macro encoding
// Maps ASCII characters to QMK keycode + shift flag

export const KC = {
  NO: 0x00,
  ENTER: 0x28,
  ESCAPE: 0x29,
  BACKSPACE: 0x2A,
  TAB: 0x2B,
  SPACE: 0x2C,
  MINUS: 0x2D,
  EQUAL: 0x2E,
  LBRACKET: 0x2F,
  RBRACKET: 0x30,
  BACKSLASH: 0x31,
  SEMICOLON: 0x33,
  QUOTE: 0x34,
  GRAVE: 0x35,
  COMMA: 0x36,
  DOT: 0x37,
  SLASH: 0x38,
  A: 0x04, B: 0x05, C: 0x06, D: 0x07, E: 0x08,
  F: 0x09, G: 0x0A, H: 0x0B, I: 0x0C, J: 0x0D,
  K: 0x0E, L: 0x0F, M: 0x10, N: 0x11, O: 0x12,
  P: 0x13, Q: 0x14, R: 0x15, S: 0x16, T: 0x17,
  U: 0x18, V: 0x19, W: 0x1A, X: 0x1B, Y: 0x1C,
  Z: 0x1D,
  N1: 0x1E, N2: 0x1F, N3: 0x20, N4: 0x21, N5: 0x22,
  N6: 0x23, N7: 0x24, N8: 0x25, N9: 0x26, N0: 0x27,
};

// VIA macro action types
export const VIA_MACRO_ACTION = {
  DOWN:  0x01,
  UP:    0x02,
  TAP:   0x03,
  DELAY: 0x04,
};

// Encode a plain text string into VIA macro byte sequence
// Format: [ACTION_TAP, keycode] pairs, terminated by 0x00
export function encodeTextMacro(text) {
  const bytes = [];
  for (const ch of text) {
    const { kc, shift } = charToKeycode(ch);
    if (kc === null) continue;
    if (shift) {
      bytes.push(VIA_MACRO_ACTION.DOWN, 0xE1); // LSFT down
      bytes.push(VIA_MACRO_ACTION.TAP, kc);
      bytes.push(VIA_MACRO_ACTION.UP, 0xE1);   // LSFT up
    } else {
      bytes.push(VIA_MACRO_ACTION.TAP, kc);
    }
  }
  bytes.push(0x00); // null terminator
  return Buffer.from(bytes);
}

function charToKeycode(ch) {
  const map = {
    'a': [KC.A, false], 'b': [KC.B, false], 'c': [KC.C, false],
    'd': [KC.D, false], 'e': [KC.E, false], 'f': [KC.F, false],
    'g': [KC.G, false], 'h': [KC.H, false], 'i': [KC.I, false],
    'j': [KC.J, false], 'k': [KC.K, false], 'l': [KC.L, false],
    'm': [KC.M, false], 'n': [KC.N, false], 'o': [KC.O, false],
    'p': [KC.P, false], 'q': [KC.Q, false], 'r': [KC.R, false],
    's': [KC.S, false], 't': [KC.T, false], 'u': [KC.U, false],
    'v': [KC.V, false], 'w': [KC.W, false], 'x': [KC.X, false],
    'y': [KC.Y, false], 'z': [KC.Z, false],
    'A': [KC.A, true],  'B': [KC.B, true],  'C': [KC.C, true],
    'D': [KC.D, true],  'E': [KC.E, true],  'F': [KC.F, true],
    'G': [KC.G, true],  'H': [KC.H, true],  'I': [KC.I, true],
    'J': [KC.J, true],  'K': [KC.K, true],  'L': [KC.L, true],
    'M': [KC.M, true],  'N': [KC.N, true],  'O': [KC.O, true],
    'P': [KC.P, true],  'Q': [KC.Q, true],  'R': [KC.R, true],
    'S': [KC.S, true],  'T': [KC.T, true],  'U': [KC.U, true],
    'V': [KC.V, true],  'W': [KC.W, true],  'X': [KC.X, true],
    'Y': [KC.Y, true],  'Z': [KC.Z, true],
    '1': [KC.N1, false], '2': [KC.N2, false], '3': [KC.N3, false],
    '4': [KC.N4, false], '5': [KC.N5, false], '6': [KC.N6, false],
    '7': [KC.N7, false], '8': [KC.N8, false], '9': [KC.N9, false],
    '0': [KC.N0, false],
    '!': [KC.N1, true],  '@': [KC.N2, true],  '#': [KC.N3, true],
    '$': [KC.N4, true],  '%': [KC.N5, true],  '^': [KC.N6, true],
    '&': [KC.N7, true],  '*': [KC.N8, true],  '(': [KC.N9, true],
    ')': [KC.N0, true],
    ' ': [KC.SPACE, false], '\n': [KC.ENTER, false], '\t': [KC.TAB, false],
    '-': [KC.MINUS, false], '_': [KC.MINUS, true],
    '=': [KC.EQUAL, false], '+': [KC.EQUAL, true],
    '[': [KC.LBRACKET, false], '{': [KC.LBRACKET, true],
    ']': [KC.RBRACKET, false], '}': [KC.RBRACKET, true],
    '\\': [KC.BACKSLASH, false], '|': [KC.BACKSLASH, true],
    ';': [KC.SEMICOLON, false], ':': [KC.SEMICOLON, true],
    "'": [KC.QUOTE, false], '"': [KC.QUOTE, true],
    ',': [KC.COMMA, false], '<': [KC.COMMA, true],
    '.': [KC.DOT, false],   '>': [KC.DOT, true],
    '/': [KC.SLASH, false], '?': [KC.SLASH, true],
    '`': [KC.GRAVE, false], '~': [KC.GRAVE, true],
  };
  const entry = map[ch];
  if (!entry) return { kc: null, shift: false };
  return { kc: entry[0], shift: entry[1] };
}
