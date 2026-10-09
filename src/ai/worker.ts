import { Field } from '../engine/field';
import { think } from './think';
import type { ThinkRequest } from './cpuController';

self.onmessage = (e: MessageEvent<ThinkRequest & { id: number }>) => {
  const { id, cells, pieces, params } = e.data;
  const { placement } = think(new Field(Uint8Array.from(cells)), pieces, params);
  (self as unknown as Worker).postMessage({ id, placement });
};
