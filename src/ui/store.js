/**
 * Local persistence. Every access is wrapped in try/catch: storage can be disabled,
 * full, or unavailable (private windows, embedded previews). The app works without it.
 */
const KEY = 'cfoArena.save.v1';
const THEME_KEY = 'cfoArena.theme';

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Save the minimum needed to rebuild a game: code, length, nickname, decisions, draft, step. */
export function saveGame(save) {
  return safeSet(KEY, JSON.stringify({ ...save, savedAt: Date.now() }));
}

export function loadGame() {
  const raw = safeGet(KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data.code !== 'string' || !Array.isArray(data.decisions)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearGame() {
  safeRemove(KEY);
}

export function getTheme() {
  return safeGet(THEME_KEY);
}

export function setTheme(theme) {
  if (theme) safeSet(THEME_KEY, theme);
  else safeRemove(THEME_KEY);
}
