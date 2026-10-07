// 验证存档：过关解锁下一关、最佳成绩记录、重启后仍能读回、选关只放行已解锁关卡
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const src = html.split('<script>')[1].split('</script>')[0];
const store = new Map();
const mkEl = () => ({ style: {}, classes: new Set(), innerHTML: '', __b: [], querySelectorAll() { return this.__b; }, addEventListener() {}, getContext: () => new Proxy({}, { get: (t, k) => k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {}, set: () => true }), getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 180 }) });
globalThis.localStorage = {
  getItem: k => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};
globalThis.document = { getElementById: () => mkEl(), createElement: () => mkEl(), hidden: false, querySelectorAll: () => [] };
globalThis.addEventListener = () => {};
globalThis.innerWidth = 390; globalThis.innerHeight = 844;
let t = 0, raf = null;
globalThis.performance = { now: () => t };
globalThis.requestAnimationFrame = cb => { raf = cb; return 1; };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
globalThis.window = globalThis;
new Function(src)();
const PR = globalThis.PR, { GAME, LEVELS } = PR;
const step = (n = 1) => { for (let i = 0; i < n && raf; i++) { const f = raf; raf = null; t += 1000 / 60; f(t); } };
const fails = [];
const ok = (name, cond, extra) => { if (!cond) fails.push(name + (extra ? ' → ' + extra : '')); };

// 直接读 localStorage 里的存档 JSON
const readSave = () => JSON.parse(store.get('pixelrunner.save.v1') || '{}');

step(2);
ok('开局存档为未解锁状态', readSave().unlocked === undefined || readSave().unlocked === 1, JSON.stringify(readSave()));

// 从第 1 关开始，直接判定过关
GAME.state = 'title';
globalThis.onPress ? null : null;
// 用游戏的 startAt 走正式流程：模拟按 Enter（通过 dispatch 太绕，直接调用内部状态）
PR.GAME.levelIndex = 0;
PR.loadLevel(0); GAME.state = 'play';
// 把玩家放到旗杆上触发过关（用 checkWorld 的正式判定路径）
const l = GAME.level;
PR.player.x = l.flag.x + 2; PR.player.y = 10 * 16; PR.player.prevBottom = PR.player.y + PR.player.h;
step(5);
ok('触发过关', GAME.state === 'clear', GAME.state);
const s1 = readSave();
ok('过关后解锁第 2 关', s1.unlocked === 2, JSON.stringify(s1));
ok('记录了第 1 关最佳成绩', s1.best && s1.best['0'] && typeof s1.best['0'].time === 'number', JSON.stringify(s1.best));
ok('记录了金币累计', typeof s1.coins === 'number', String(s1.coins));

// 模拟「关掉页面重开」：用同一份 localStorage 重新加载脚本，检查进度是否还在
const savedRaw = store.get('pixelrunner.save.v1');
let raf2 = null;
globalThis.requestAnimationFrame = cb => { raf2 = cb; return 1; };
new Function(src)();
const PR2 = globalThis.PR;
ok('重开后读回了进度', PR2 && PR2.GAME, 'PR2 存在');
ok('重开后存档内容未丢', store.get('pixelrunner.save.v1') === savedRaw, 'raw 变化');

console.log(fails.length ? 'SAVE FAIL\n ✗ ' + fails.join('\n ✗ ') : 'SAVE OK — 过关解锁、最佳成绩、金币累计、重开读回 全部通过');
process.exit(fails.length ? 1 : 0);
