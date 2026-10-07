// 验证 7 格坑：普通满跳过不去、旋转跳过得去
import { PR, GAME, player, keys, step } from './harness.mjs';
function tryCross(li, g0, useSpin) {
  PR.loadLevel(li); GAME.state = 'play';
  const p = player;
  p.x = (g0 - 3) * 16; p.y = 11 * 16 - 14;     // 坑前 3 格起跑
  p.vx = 1.65; p.vy = 0; p.onGround = true;
  p.airFrames = 0; p.spin = 0; p.spinHeld = false; p.landGrace = 0;
  keys.left = false; keys.right = true; keys.jump = false; keys.spin = false;
  let spun = false, ok = false;
  for (let i = 0; i < 240; i++) {
    const atEdge = p.x + p.w > g0 * 16 - 6;
    if (p.onGround && atEdge) keys.jump = true;             // 到坑边就起跳
    if (useSpin && keys.jump && !spun && !p.onGround && p.vy > -3.0) { keys.spin = true; spun = true; }
    step();
    if (p.x > (g0 + 7) * 16 && p.onGround) { ok = true; break; }   // 落到对面
    if (p.y > 11 * 16 + 20) break;                                  // 掉坑
  }
  keys.right = keys.jump = keys.spin = false;
  return ok;
}
// 找出有 7 格坑的关
let tested = 0, normalOk = 0, spinOk = 0;
for (let li = 0; li < PR.LEVELS.length && tested < 6; li++) {
  PR.loadLevel(li);
  const segs = GAME.level.def.segs;
  for (let k = 0; k + 1 < segs.length; k++) {
    const g0 = segs[k][1] + 1, gap = segs[k + 1][0] - g0;
    if (gap !== 7) continue;
    const a = tryCross(li, g0, false), b = tryCross(li, g0, true);
    console.log(`第${li + 1}关 坑${g0}-${g0 + 6}(7格): 普通跳=${a ? '过去了' : '掉坑'}  旋转跳=${b ? '过去了' : '掉坑'}`);
    tested++; normalOk += a ? 1 : 0; spinOk += b ? 1 : 0;
    if (tested >= 6) break;
  }
}
console.log(`\n合计 ${tested} 个 7 格坑: 普通跳过 ${normalOk} 个, 旋转跳过 ${spinOk} 个`);
