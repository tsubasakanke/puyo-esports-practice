import { Application } from 'pixi.js';
import { PuyoTextures } from './render/puyoTextures';
import { debugPuyoScene } from './render/debugPuyo';
import { GarbageIcons } from './render/garbageIcons';
import { GarbageQueueView } from './render/garbageQueue';
import { App } from './ui/app';
import { TitleScreen } from './ui/screens/title';

async function main() {
  const host = document.getElementById('app')!;
  const pixi = new Application();
  try {
    await pixi.init({ resizeTo: window, background: '#05070f', antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1), preference: 'webgl' });
  } catch {
    host.innerHTML = '<p style="color:#fff;font:20px sans-serif;padding:24px">このブラウザは WebGL に対応していないため遊べません。</p>';
    return;
  }
  host.appendChild(pixi.canvas);
  // 文字が出る前にフォントを読み込む（失敗しても代わりのフォントで続ける）
  try {
    await Promise.race([document.fonts.load('900 40px "M PLUS Rounded 1c"'), new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    // そのまま進む
  }
  if (new URLSearchParams(location.search).get('debug') === 'puyo') {
    pixi.stage.addChild(debugPuyoScene(new PuyoTextures(128), 64));
    return;
  }
  if (new URLSearchParams(location.search).get('debug') === 'garbage') {
    const icons = new GarbageIcons(120);
    [1, 7, 37, 200, 2165, 99999].forEach((n, i) => {
      const q = new GarbageQueueView(icons, 60);
      q.set(n);
      q.position.set(20, 20 + i * 80);
      pixi.stage.addChild(q);
    });
    return;
  }
  const app = new App(pixi);
  app.go(new TitleScreen());
  (window as unknown as { __app: App }).__app = app;
}

main();
