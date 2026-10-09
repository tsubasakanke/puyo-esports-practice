import { Text } from 'pixi.js';
import type { App, Screen } from '../app';
import { Menu, type MenuItem } from '../menu';
import { makeBackground } from '../../render/background';
import { BASE_W } from '../../render/layout';
import { FONT } from '../../render/hud';
import type { KeyBinds } from '../../settings';
import { DEFAULT_SETTINGS } from '../../settings';
import { TitleScreen } from './title';

const ACTIONS: [keyof KeyBinds, string][] = [
  ['left', '左'],
  ['right', '右'],
  ['down', '下（ソフトドロップ）'],
  ['rotL', '左回転'],
  ['rotR', '右回転'],
  ['undo', '1手戻す'],
  ['restart', 'やり直し'],
  ['pause', 'ポーズ'],
];

const ARROWS: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
export const keyName = (code: string): string => ARROWS[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '');

export class SettingsScreen implements Screen {
  private app!: App;
  private menu!: Menu;
  private waitingFor: keyof KeyBinds | null = null;
  private status!: Text;
  private onKey = (e: KeyboardEvent) => {
    if (!this.waitingFor) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code !== 'Escape' || this.waitingFor === 'pause') this.app.settings.binds[this.waitingFor] = [e.code];
    this.waitingFor = null;
    this.app.saveSettings();
    this.refresh();
  };

  enter(app: App): void {
    this.app = app;
    app.root.addChild(makeBackground('tsu'));
    const title = new Text({ text: '設定', style: { fill: '#ffffff', fontSize: 72, fontWeight: '900', fontFamily: FONT, stroke: { color: '#1a3a8a', width: 12 } } });
    title.anchor.set(0.5);
    title.position.set(BASE_W / 2, 75);
    const s = app.settings;
    const items: MenuItem[] = [
      ...ACTIONS.map(([a]) => ({ label: '', onSelect: () => this.startBind(a) })),
      { label: '', onLeftRight: (d) => ((s.das = Math.max(1, Math.min(30, s.das + d))), this.save()) },
      { label: '', onLeftRight: (d) => ((s.arr = Math.max(1, Math.min(10, s.arr + d))), this.save()) },
      { label: '', onLeftRight: (d) => ((s.volume = Math.round(Math.max(0, Math.min(1, s.volume + d * 0.1)) * 10) / 10), this.save()) },
      { label: '', onSelect: () => ((s.colorMarks = !s.colorMarks), this.save()), onLeftRight: () => ((s.colorMarks = !s.colorMarks), this.save()) },
      { label: '初期設定にもどす', onSelect: () => ((app.settings = structuredClone(DEFAULT_SETTINGS)), app.saveSettings(), app.go(new SettingsScreen())) },
      { label: 'タイトルへ', onSelect: () => app.go(new TitleScreen()) },
    ];
    this.menu = new Menu(items, 900, 46);
    this.menu.position.set(BASE_W / 2 - 450, 140);
    this.status = new Text({ text: '', style: { fill: '#ffe14a', fontSize: 28, fontWeight: '800', fontFamily: FONT } });
    this.status.anchor.set(0.5);
    this.status.position.set(BASE_W / 2, 1050);
    app.root.addChild(title, this.menu, this.status);
    window.addEventListener('keydown', this.onKey, true);
    this.refresh();
  }

  private save() {
    this.app.saveSettings();
    this.refresh();
  }

  private startBind(a: keyof KeyBinds) {
    this.waitingFor = a;
    this.refresh();
  }

  private refresh() {
    const s = this.app.settings;
    ACTIONS.forEach(([a, label], i) => this.menu.setLabel(i, `${label}：${s.binds[a].map(keyName).join(' / ')}`));
    const n = ACTIONS.length;
    this.menu.setLabel(n, `横移動の長押し開始（DAS）：◀ ${s.das}F ▶`);
    this.menu.setLabel(n + 1, `横移動の速さ（ARR）：◀ ${s.arr}F ▶`);
    this.menu.setLabel(n + 2, `音量：◀ ${Math.round(s.volume * 10)} ▶`);
    this.menu.setLabel(n + 3, `色のマーク表示：${s.colorMarks ? 'ON' : 'OFF'}`);
    this.status.text = this.waitingFor ? 'わりあてるキーを押してね' : '↑↓で選ぶ / Enter でキー変更 / ←→ で数値変更';
  }

  tick(): void {
    if (!this.waitingFor) this.menu.handle(this.app.keyboard);
    this.app.keyboard.endFrame();
  }

  leave(): void {
    window.removeEventListener('keydown', this.onKey, true);
  }
}
