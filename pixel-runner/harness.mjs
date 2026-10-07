// 无头运行 index.html 里的真实游戏脚本：桩 canvas + 可控时钟
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const src = html.split('<script>')[1].split('</script>')[0];

const noop = () => {};
const gradient = { addColorStop: noop };
const ctxStub = new Proxy({}, {
  get: (t, k) => {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => gradient;
    return () => {};
  },
  set: () => true,
});
const canvasStub = { getContext: () => ctxStub, style: {}, width: 320, height: 180 };
globalThis.document = { getElementById: () => canvasStub, createElement: () => canvasStub, hidden: false };
globalThis.innerWidth = 1280;
globalThis.innerHeight = 800;
globalThis.performance = { now: () => clockNow };
globalThis.requestAnimationFrame = cb => { rafCb = cb; return 1; };
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
globalThis.clearInterval = noop;
let clockNow = 0;
let rafCb = null;
const listeners = {};
globalThis.addEventListener = (type, fn) => { (listeners[type] ||= []).push(fn); };
globalThis.window = globalThis;

new Function(src)();
const PR = globalThis.PR;

export const press = code => { for (const fn of listeners.keydown || []) fn({ code, preventDefault() {} }); };
export const release = code => { for (const fn of listeners.keyup || []) fn({ code, preventDefault() {} }); };
export const step = () => {
  clockNow += 1000 / 60;
  const cb = rafCb; rafCb = null;
  if (cb) cb(clockNow);
};
export const SOLID = new Set(['#', 'B', '?', 'u', 'X']);
export const tileAt = (l, tx, ty) => (ty < 0 || ty >= l.h || tx < 0 || tx >= l.w) ? '.' : l.grid[ty][tx];
export { PR };
export const GAME = PR.GAME;
export const player = PR.player;
export const keys = PR.keys;
export const LEVELS = PR.LEVELS;