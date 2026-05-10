import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants';

export function generateRoomCode(): string {
  const bytes =
    typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(ROOM_CODE_LENGTH))
      : null;
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const r = bytes ? bytes[i] : Math.floor(Math.random() * 0xffffffff);
    s += ROOM_CODE_ALPHABET[r % ROOM_CODE_ALPHABET.length];
  }
  return s;
}

export function isValidRoomCode(code: string): boolean {
  if (!code || code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}
