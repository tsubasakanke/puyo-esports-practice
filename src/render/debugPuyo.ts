import { Container, Sprite, Text } from 'pixi.js';
import type { Color } from '../engine/types';
import { PuyoTextures } from './puyoTextures';

/** ?debug=puyo で出す、テクスチャ確認用の一覧 */
export function debugPuyoScene(tex: PuyoTextures, cell: number): Container {
  const root = new Container();
  const title = new Text({ text: 'ぷよテクスチャ一覧（色 × 連結16パターン）', style: { fill: '#ffffff', fontSize: 28 } });
  title.position.set(20, 10);
  root.addChild(title);
  ([1, 2, 3, 4, 5, 6] as Color[]).forEach((color, row) => {
    for (let links = 0; links < 16; links++) {
      const s = new Sprite(tex.get(color, links));
      s.width = s.height = cell;
      s.position.set(20 + links * (cell + 8), 60 + row * (cell + 8));
      root.addChild(s);
      const e = new Sprite(tex.eyes(color, links === 15));
      e.width = e.height = cell;
      e.position.copyFrom(s.position);
      root.addChild(e);
    }
  });
  // つながった塊の見え方
  const shape = [
    [1, 1, 0, 3],
    [1, 2, 2, 3],
    [4, 4, 2, 3],
  ];
  const at = (x: number, y: number) => shape[y]?.[x] ?? 0;
  shape.forEach((row, y) =>
    row.forEach((c, x) => {
      if (!c) return;
      let links = 0;
      if (at(x, y - 1) === c) links |= 1;
      if (at(x + 1, y) === c) links |= 2;
      if (at(x, y + 1) === c) links |= 4;
      if (at(x - 1, y) === c) links |= 8;
      const s = new Sprite(tex.get(c as Color, links));
      s.width = s.height = cell;
      s.position.set(20 + x * cell, 60 + 6 * (cell + 8) + 20 + y * cell);
      const e = new Sprite(tex.eyes(c as Color));
      e.width = e.height = cell;
      e.position.copyFrom(s.position);
      root.addChild(s, e);
    }),
  );
  return root;
}
