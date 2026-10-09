import type { App, Screen } from '../app';
import { overlay } from '../htmlOverlay';
import { makeBackground } from '../../render/background';
import { getTransport, onlineAvailable } from '../../net/connect';
import { Room } from '../../net/room';
import { TitleScreen } from './title';
import { OnlineRoomScreen } from './onlineRoom';

const NAME_KEY = 'puyo-esports-practice/name';

const ERRORS: Record<string, string> = {
  not_found: 'その部屋は見つかりませんでした。部屋コードを確かめてね',
  full: 'その部屋は満員です（最大 4 人）',
  expired: 'その部屋は期限切れです。新しく作ってね',
  playing: 'その部屋は対戦中です。試合が終わってからもう一度入ってね',
  not_puyo: 'その部屋コードはこのゲームの部屋ではありません',
  not_configured: 'オンライン対戦の設定がされていません',
};

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    // 保存できなくても続ける
  }
}

/** オンライン対戦の入口（名前・部屋を作る・部屋に入る） */
export class OnlineScreen implements Screen {
  private app!: App;
  private el!: HTMLDivElement;
  private busy = false;

  constructor(private code = '') {}

  enter(app: App): void {
    this.app = app;
    app.root.addChild(makeBackground('tsu'));
    this.el = overlay(`
      <h2>オンライン対戦</h2>
      <label>なまえ（12 文字まで）</label>
      <input id="ol-name" maxlength="12" placeholder="プレイヤー" />
      <label>先取（部屋を作るとき）</label>
      <select id="ol-first">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === 2 ? 'selected' : ''}>${n} 本先取</option>`).join('')}</select>
      <div class="row"><button id="ol-create">部屋を作る</button></div>
      <label>部屋コード（友達の部屋に入るとき）</label>
      <input id="ol-code" maxlength="7" placeholder="例: ABCD234" style="text-transform: uppercase" />
      <div class="row"><button id="ol-join">部屋に入る</button></div>
      <div class="err" id="ol-err"></div>
      <div class="row"><button class="sub" id="ol-back">タイトルへ</button></div>
      <div class="note">最大 4 人・通ルール。部屋を作ったら招待リンクを友達に送ってね</div>
    `);
    const $ = <T extends HTMLElement>(id: string) => this.el.querySelector<T>(`#${id}`)!;
    $<HTMLInputElement>('ol-name').value = loadName();
    $<HTMLInputElement>('ol-code').value = this.code;
    $('ol-back').onclick = () => app.go(new TitleScreen());
    $('ol-create').onclick = () => this.start(async (name) => Room.create(await getTransport(), name, Number($<HTMLSelectElement>('ol-first').value)));
    $('ol-join').onclick = () => {
      const code = $<HTMLInputElement>('ol-code').value.trim().toUpperCase();
      if (!code) return this.error('部屋コードを入れてね');
      this.start(async (name) => Room.join(await getTransport(), code, name));
    };
    if (!onlineAvailable()) this.error(ERRORS.not_configured);
    // 招待リンクから来て、名前もあるならそのまま入る
    if (this.code && loadName()) $('ol-join').click();
  }

  private error(msg: string) {
    this.el.querySelector('#ol-err')!.textContent = msg;
  }

  private async start(open: (name: string) => Promise<Room>) {
    if (this.busy) return;
    const name = (this.el.querySelector<HTMLInputElement>('#ol-name')!.value.trim() || 'プレイヤー').slice(0, 12);
    saveName(name);
    this.busy = true;
    this.el.querySelectorAll('button').forEach((b) => (b.disabled = true));
    this.error('つないでいます…');
    try {
      const room = await open(name);
      this.app.go(new OnlineRoomScreen(room));
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      this.error(ERRORS[code] ?? 'つなげませんでした。ネットワークを確かめて、もう一度試してね');
      this.busy = false;
      this.el.querySelectorAll('button').forEach((b) => (b.disabled = false));
    }
  }

  tick(): void {
    if (this.app.keyboard.wasPressedCode('Escape')) this.app.go(new TitleScreen());
    this.app.keyboard.endFrame();
  }

  leave(): void {
    this.el.remove();
  }
}
