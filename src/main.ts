import { Application } from 'pixi.js';
import { PuyoTextures } from './render/puyoTextures';
import { debugPuyoScene } from './render/debugPuyo';

async function main() {
  const app = new Application();
  await app.init({ resizeTo: window, background: '#0b1020', antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 });
  document.getElementById('app')!.appendChild(app.canvas);
  const params = new URLSearchParams(location.search);
  if (params.get('debug') === 'puyo') {
    app.stage.addChild(debugPuyoScene(new PuyoTextures(128), 64));
  }
}

main();
