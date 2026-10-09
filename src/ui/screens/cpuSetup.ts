import { Text } from 'pixi.js';
import type { App, Screen } from '../app';
import { Menu } from '../menu';
import { makeBackground } from '../../render/background';
import { BASE_W } from '../../render/layout';
import { FONT } from '../../render/hud';
import { CPU_LEVELS } from '../../ai/cpuController';
import { TitleScreen } from './title';
import { VersusScreen } from './versus';

/** CPU 対戦の設定（強さ・先取数） */
export class CpuSetupScreen implements Screen {
  private app!: App;
  private menu!: Menu;

  enter(app: App): void {
    this.app = app;
    app.root.addChild(makeBackground('tsu'));
    const title = new Text({ text: 'CPU 対戦', style: { fill: '#ffffff', fontSize: 80, fontWeight: '900', fontFamily: FONT, stroke: { color: '#1a3a8a', width: 14, join: 'round' } } });
    title.anchor.set(0.5);
    title.position.set(BASE_W / 2, 200);
    const prefs = app.cpuPrefs;
    this.menu = new Menu(
      [
        { label: '', onLeftRight: (d) => ((prefs.level = Math.max(1, Math.min(5, prefs.level + d))), this.refresh()) },
        { label: '', onLeftRight: (d) => ((prefs.firstTo = Math.max(1, Math.min(5, prefs.firstTo + d))), this.refresh()) },
        { label: 'ルール：通（フィーバーはじゅんび中）', disabled: true },
        { label: 'スタート！', onSelect: () => app.go(new VersusScreen(prefs.level, prefs.firstTo)) },
        { label: 'タイトルへ', onSelect: () => app.go(new TitleScreen()) },
      ],
      760,
      76,
    );
    this.menu.position.set(BASE_W / 2 - 380, 330);
    const help = new Text({ text: '↑↓で選ぶ / ←→で変更 / Enter・X で決定', style: { fill: '#ffffff', fontSize: 26, fontWeight: '700', fontFamily: FONT } });
    help.anchor.set(0.5);
    help.position.set(BASE_W / 2, 900);
    app.root.addChild(title, this.menu, help);
    this.refresh();
  }

  private refresh() {
    const p = this.app.cpuPrefs;
    this.menu.setLabel(0, `CPU の強さ：◀ ${p.level}（${CPU_LEVELS[p.level - 1].name}）▶`);
    this.menu.setLabel(1, `先取：◀ ${p.firstTo} 本 ▶`);
  }

  tick(): void {
    this.menu.handle(this.app.keyboard);
    if (this.app.keyboard.wasPressed('pause')) this.app.go(new TitleScreen());
    this.app.keyboard.endFrame();
  }

  leave(): void {}
}
