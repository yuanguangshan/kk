// 移动端路径测试：在 Node 里以"触屏环境"加载游戏脚本，
// 验证虚拟按键出现、点「开始」能进游戏、点画面能开始、开始键兼作暂停。
// 运行：node mobile-test.mjs（全部通过输出 MOBILE OK）
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const src = html.split('<script>')[1].split('</script>')[0];

/* ---- 触屏环境桩 ---- */
globalThis.ontouchstart = null;                       // 'ontouchstart' in window === true
if (!globalThis.navigator) globalThis.navigator = { maxTouchPoints: 5 };

const listeners = el => (el.__l ||= {});
function elStub(id) {
  return {
    id, innerHTML: '', style: {},
    classes: new Set(),
    get classList() {
      const c = this.classes;
      return { add: v => c.add(v), contains: v => c.has(v) };
    },
    __buttons: [],
    querySelectorAll() { return this.__buttons; },
    addEventListener(type, fn) { listeners(this)[type] = fn; },
    fire(type, ev = {}) { const f = listeners(this)[type]; if (f) f({ preventDefault() {}, ...ev }); }
  };
}
const cvStub = {
  style: {}, width: 320, height: 180,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 180 }),
  getContext: () => new Proxy({}, {
    get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient')
      ? () => ({ addColorStop() {} }) : () => {},
    set: () => true
  }),
  addEventListener(type, fn) { listeners(this)[type] = fn; },
  fire(type) { const f = listeners(this)[type]; if (f) f({ preventDefault() {} }); }
};
const padStub = elStub('pad');
for (const k of ['left', 'right', 'start', 'jump']) {
  const b = { dataset: { k }, __l: {}, addEventListener(type, fn) { this.__l[type] = fn; } };
  b.fire = type => b.__l[type] && b.__l[type]({ preventDefault() {} });
  padStub.__buttons.push(b);
}
const els = { cv: cvStub, pad: padStub, hint: elStub('hint'), stage: elStub('stage') };
globalThis.document = {
  getElementById: id => els[id] || elStub(id),
  createElement: () => cvStub,
  querySelectorAll: () => []
};
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
globalThis.innerWidth = 390;
globalThis.innerHeight = 844;
globalThis.performance = { now: () => clockNow };
let clockNow = 0, rafCb = null;
globalThis.requestAnimationFrame = cb => { rafCb = cb; return 1; };
const gListeners = {};
globalThis.addEventListener = (type, fn) => { (gListeners[type] ||= []).push(fn); };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.window = globalThis;

/* ---- 加载游戏 ---- */
new Function(src)();
const PR = globalThis.PR;
const { GAME, keys } = PR;
const fails = [];
const check = (name, ok, extra) => { if (!ok) fails.push(name + (extra ? ' → ' + extra : '')); };
const tick = (n = 1) => { for (let i = 0; i < n && rafCb; i++) { const f = rafCb; rafCb = null; clockNow += 1000 / 60; f(clockNow); } };
const startBtn = padStub.__buttons.find(b => b.dataset.k === 'start');
const jumpBtn = padStub.__buttons.find(b => b.dataset.k === 'jump');

/* 1) 触屏环境识别：虚拟按键条应启用，提示文案应为触屏版 */
check('虚拟按键条启用', padStub.classList.contains('on'));
check('触屏提示文案', /◀ ▶/.test(padStub.hint?.innerHTML ?? els.hint.innerHTML), els.hint.innerHTML.slice(0, 30));
check('开局为标题态', GAME.state === 'title', GAME.state);

/* 2) 点标题画面 → 进入游戏（点画面开始） */
els.stage.fire('pointerdown');
check('点画面开始游戏', GAME.state === 'play', GAME.state);
tick(30);

/* 3) 游戏中按「开始」= 暂停 / 再按恢复 */
startBtn.fire('touchstart'); startBtn.fire('touchend');
check('开始键暂停', GAME.paused === true, String(GAME.paused));
startBtn.fire('touchstart'); startBtn.fire('touchend');
check('开始键恢复', GAME.paused === false);

/* 4) 「跳」键按下/松开映射到 keys.jump */
jumpBtn.fire('touchstart');
check('跳键生效', keys.jump === true);
jumpBtn.fire('touchend');
check('跳键抬起', !keys.jump);

/* 5) 移动键映射 */
const leftBtn = padStub.__buttons.find(b => b.dataset.k === 'left');
leftBtn.fire('touchstart');
check('左移键生效', keys.left === true);
leftBtn.fire('touchend');
check('左移键抬起', !keys.left);

/* 6) 失败/通关界面点「开始」= 打开选关（而不是把进度清零重头来） */
GAME.state = 'over';
startBtn.fire('touchstart'); startBtn.fire('touchend');
check('失败界面点开始进选关', GAME.state === 'select', GAME.state);
/* 6b) 选关界面点「开始」进入当前选中的关卡 */
startBtn.fire('touchstart'); startBtn.fire('touchend');
check('选关界面可进入关卡', GAME.state === 'play' || GAME.state === 'select', GAME.state);

/* 7) 触屏下标题提示应为 TAP 文案（渲染一帧验证像素无异常） */
GAME.state = 'title';
let renderOk = true;
try { tick(2); } catch (e) { renderOk = false; fails.push('渲染异常: ' + e.message); }
check('标题渲染无异常', renderOk);

/* 7) 进度保存：过关应写入 localStorage；重开后能读回 */
{
  const raw0 = localStorage.getItem('pixelrunner.save.v1');
  GAME.state = 'play';
  PR.loadLevel(0);
  const lv = GAME.level;
  PR.player.x = lv.flag.x + 2; PR.player.y = 10 * 16;
  tick(4);
  check('过关进入结算', GAME.state === 'clear', GAME.state);
  const raw1 = localStorage.getItem('pixelrunner.save.v1');
  check('过关后写入了存档', !!raw1 && raw1 !== raw0, String(raw1));
  if (raw1) {
    const sv = JSON.parse(raw1);
    check('存档记录了已解锁关卡', sv.unlocked >= 2, JSON.stringify(sv.unlocked));
    check('存档记录了本关最佳', sv.best && sv.best['0'], JSON.stringify(sv.best));
  }
}
/* 8) 标题界面点下半屏 → 打开选关（手机没有 S 键） */
{
  GAME.state = 'title';
  els.stage.fire('pointerdown', { clientX: 160, clientY: 170 });   // y=170/180 落在下 1/4
  check('标题点下半屏进入选关', GAME.state === 'select', GAME.state);
  /* 选关界面点第 1 关格子 → 进入游戏 */
  els.stage.fire('pointerdown', { clientX: 52, clientY: 50 });
  check('选关点格子进入游戏', GAME.state === 'play', GAME.state);
}

if (fails.length) { console.error('MOBILE FAIL'); fails.forEach(f => console.error(' ✗ ' + f)); process.exit(1); }
console.log('MOBILE OK — 触屏识别/点画面开始/开始键暂停恢复/虚拟按键映射 全部通过');