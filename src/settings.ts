export interface KeyBinds {
  left: string[];
  right: string[];
  down: string[];
  rotL: string[];
  rotR: string[];
  pause: string[];
  undo: string[];
  restart: string[];
}

export interface Settings {
  binds: KeyBinds;
  das: number;
  arr: number;
  volume: number;
  colorMarks: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  binds: {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    down: ['ArrowDown'],
    rotL: ['KeyZ'],
    rotR: ['KeyX', 'ArrowUp'],
    pause: ['Escape'],
    undo: ['KeyU'],
    restart: ['KeyR'],
  },
  das: 8,
  arr: 2,
  volume: 0.6,
  colorMarks: false,
};

const KEY = 'puyo-esports-practice/settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const s = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_SETTINGS), ...s, binds: { ...DEFAULT_SETTINGS.binds, ...s.binds } };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できなくても遊べる
  }
}
