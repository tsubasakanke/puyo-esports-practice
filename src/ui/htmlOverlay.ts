/** PixiJS の画面の上に重ねる HTML（文字入力やボタン用）。画面を離れるときに remove() する */
export function overlay(html: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'overlay';
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

const style = document.createElement('style');
style.textContent = `
.overlay { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(560px, calc(100vw - 32px));
  background: rgba(11, 16, 40, 0.94); border: 3px solid #fff; border-radius: 24px; padding: 28px; color: #fff;
  font-family: "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", system-ui, sans-serif; font-weight: 800; box-sizing: border-box; z-index: 10; }
.overlay h2 { margin: 0 0 16px; font-size: 30px; color: #ffe14a; text-align: center; }
.overlay label { display: block; margin: 14px 0 6px; font-size: 16px; }
.overlay input, .overlay select { width: 100%; box-sizing: border-box; font: inherit; font-size: 22px; padding: 10px 14px; border-radius: 12px; border: 2px solid #5a6aa8; background: #0d1430; color: #fff; }
.overlay .row { display: flex; gap: 12px; margin-top: 18px; }
.overlay button { flex: 1; font: inherit; font-size: 20px; padding: 12px; border-radius: 999px; border: 3px solid #ffc23a; background: #fff; color: #1a1f3a; cursor: pointer; }
.overlay button.sub { border-color: #5a6aa8; background: #0d1430; color: #fff; }
.overlay button:disabled { opacity: 0.5; cursor: default; }
.overlay .err { color: #ff8fa0; min-height: 1.4em; margin-top: 12px; text-align: center; }
.overlay .note { font-size: 14px; opacity: 0.85; margin-top: 10px; text-align: center; font-weight: 700; }
.overlay.top { top: 24px; transform: translate(-50%, 0); padding: 14px 20px; }
`;
document.head.appendChild(style);
