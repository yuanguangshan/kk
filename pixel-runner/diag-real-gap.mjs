// 在真实关卡里逐帧模拟：8 格坑，普通跳 vs 各种时机的旋转跳，看能不能落到对面
import { PR, GAME, player, keys, step, SOLID, tileAt } from './harness.mjs';
function tryGap(li, g0, gap, spinDelay, sprint) {
  PR.loadLevel(li); GAME.state = 'play';
  const l = GAME.level;
  const p = player;
  p.x = (g0 - 5) * 16; p.y = 11 * 16 - 14;
  p.vx = sprint ? 2.1 : 1.65; p.vy = 0; p.onGround = true;
  p.airFrames = 0; p.spin = 0; p.spinHeld = false; p.landGrace = 0;
  keys.left = false; keys.right = true; keys.run = sprint; keys.jump = false; keys.spin = false;
  let jumped = false, f = 0;
  for (let i = 0; i < 300; i++) {
    const edge = Math.floor((p.x + p.w) / 16);
    if (!jumped && p.onGround && !SOLID.has(tileAt(l, edge, 11)) && !SOLID.has(tileAt(l, edge, 10))) {
      keys.jump = true; jumped = true; f = 0;
    }
    if (jumped) { f++; if (spinDelay >= 0 && f === spinDelay) keys.spin = true; if (spinDelay >= 0 && f === spinDelay + 4) keys.spin = false; }
    step();
    if (jumped && p.onGround && p.x + p.w > (g0 + gap) * 16) { keys.right = keys.jump = keys.spin = keys.run = false; return true; }
    if (p.y > l.h * 16) break;
    if (p.x > (g0 + gap + 6) * 16) break;
  }
  keys.right = keys.jump = keys.spin = keys.run = false;
  return false;
}
const cases = [[8,18,8],[9,71,8],[16,16,8],[22,74,8]];
for (const [li, g0, gap] of cases) {
  const n = tryGap(li, g0, gap, -1, true);
  let spinOk = null;
  for (const d of [1,2,3,4,6,8,12,16]) if (tryGap(li, g0, gap, d, true)) { spinOk = d; break; }
  console.log(`第${li+1}关 坑${g0}(${gap}格): 疾跑普通跳=${n?'过':'掉坑'}  旋转跳=${spinOk!==null?'过(第'+spinOk+'帧)':'掉坑'}`);
}
