// 虚空踩板：逐块验证「从上一块能不能跳到下一块」（跑速，普通跳）
import { PR, GAME, player, keys, step, SOLID, tileAt } from './harness.mjs';
function padJump(li, fromCol, fromRow, toCol, toRow, sprint) {
  PR.loadLevel(li); GAME.state = 'play';
  const l = GAME.level;
  const p = player;
  // 站在 from 板左端
  p.x = fromCol * 16; p.y = fromRow * 16 - 14;
  p.vx = sprint ? 2.1 : 1.65; p.vy = 0; p.onGround = true;
  p.airFrames = 0; p.spin = 0; p.spinHeld = false; p.landGrace = 0;
  keys.left = false; keys.right = true; keys.run = sprint; keys.jump = true; keys.spin = false;
  for (let i = 0; i < 200; i++) {
    step();
    if (p.onGround && p.x + p.w > toCol * 16 && p.x < (toCol + 3) * 16) { keys.right = keys.jump = keys.spin = keys.run = false; return true; }
    if (p.y > l.h * 16) break;
    if (p.x > (toCol + 5) * 16) break;
  }
  keys.right = keys.jump = keys.spin = keys.run = false;
  return false;
}
let bad = 0, total = 0;
for (let i = 0; i < PR.LEVELS.length; i++) {
  PR.loadLevel(i); const l = PR.GAME.level;
  if (!l.voids.length) continue;
  const vp = l.def.ops.filter(o => o[0] === 'p' && o[4] === 'v');
  const byRow = {}; vp.forEach(o => { (byRow[o[2]] = byRow[o[2]] || []).push(o[1]); });
  const rows = Object.keys(byRow).map(Number).sort((a, b) => b - a);   // 行大在下
  for (let k = 0; k + 1 < rows.length; k++) {
    const fc = Math.min(...byRow[rows[k]]), tc = Math.min(...byRow[rows[k + 1]]);
    total++;
    const ok = padJump(i, fc, rows[k], tc, rows[k + 1], false);
    if (!ok) { bad++; if (bad <= 6) console.log(`  ✗ 第${i + 1}关: 行${rows[k]}列${fc} → 行${rows[k+1]}列${tc} 跳不过去`); }
  }
}
console.log(`虚空板跳跃: 共 ${total} 处, 跳不过去 ${bad} 处`);
