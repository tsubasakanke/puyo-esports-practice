import { Application, Graphics } from 'pixi.js';
import { PuyoTextures } from './render/puyoTextures';
import { debugPuyoScene } from './render/debugPuyo';
import { FieldView } from './render/fieldView';
import { Player } from './engine/player';
import { Keyboard } from './input/keyboard';
import { FixedLoop } from './ui/loop';
import { loadSettings } from './settings';

async function main() {
  const app = new Application();
  await app.init({ resizeTo: window, background: '#0b1020', antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 });
  document.getElementById('app')!.appendChild(app.canvas);
  const params = new URLSearchParams(location.search);
  if (params.get('debug') === 'puyo') {
    app.stage.addChild(debugPuyoScene(new PuyoTextures(128), 64));
    return;
  }
  if (params.get('debug') === 'field') {
    const cell = 48;
    const tex = new PuyoTextures(cell * 2);
    const bg = new Graphics().rect(0, 0, cell * 6, cell * 12).fill(0x151a33);
    bg.position.set(40, 60);
    const view = new FieldView(tex, cell);
    view.position.set(40, 60);
    app.stage.addChild(bg, view);
    const s = loadSettings();
    const kb = new Keyboard(window, s.binds);
    let player = new Player({ seed: Number(params.get('seed') ?? 0) });
    const loop = new FixedLoop(
      () => {
        if (kb.wasPressed('restart')) {
          player = new Player({ seed: player.tsumo.seed });
          view.reset();
        }
        player.step(kb.sample());
        kb.endFrame();
        view.update(player);
      },
      (a) => view.render(a),
    );
    loop.reset(performance.now());
    app.ticker.add(() => loop.tick(performance.now()));
    (window as unknown as { __player: () => Player }).__player = () => player;
  }
}

main();
