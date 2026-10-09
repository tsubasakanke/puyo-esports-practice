import { Application, Container, Graphics } from 'pixi.js';
import { Keyboard } from '../input/keyboard';
import { BASE_H, BASE_W, fitStage } from '../render/layout';
import { loadSettings, saveSettings, type Settings } from '../settings';
import { Sfx } from '../audio/sfx';

export interface Screen {
  /** 画面に入るとき。root に表示物を足す */
  enter(app: App): void;
  /** 描画フレームごと */
  tick(nowMs: number): void;
  /** 画面から出るとき（表示物は App が消す） */
  leave(): void;
}

/** PixiJS アプリと、画面の切り替え・共有の入力/設定/効果音 */
export class App {
  readonly root = new Container();
  readonly keyboard: Keyboard;
  readonly sfx: Sfx;
  settings: Settings;
  private screen: Screen | null = null;

  constructor(readonly pixi: Application) {
    this.settings = loadSettings();
    this.keyboard = new Keyboard(window, this.settings.binds);
    this.sfx = new Sfx(this.settings.volume);
    pixi.stage.addChild(this.root);
    // 1920×1080 の外は見せない
    const clip = new Graphics().rect(0, 0, BASE_W, BASE_H).fill(0xffffff);
    pixi.stage.addChild(clip);
    this.root.mask = clip;
    const fit = () => {
      fitStage(this.root, pixi.screen.width, pixi.screen.height);
      clip.scale.copyFrom(this.root.scale);
      clip.position.copyFrom(this.root.position);
    };
    pixi.renderer.on('resize', fit);
    fit();
    pixi.ticker.add(() => this.screen?.tick(performance.now()));
  }

  get current(): Screen | null {
    return this.screen;
  }

  go(next: Screen): void {
    this.screen?.leave();
    for (const c of this.root.removeChildren()) c.destroy({ children: true });
    this.screen = next;
    next.enter(this);
  }

  saveSettings(): void {
    saveSettings(this.settings);
    this.keyboard.binds = this.settings.binds;
    this.sfx.setVolume(this.settings.volume);
  }
}
