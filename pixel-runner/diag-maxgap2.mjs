// 用「跑到坑边再跳」的可靠方式实测最大可跨坑宽（跑速 / 疾跑）
import { PR, GAME, player, keys, step, SOLID, tileAt } from './harness.mjs';
function cross(gapTiles, sprint) {
  PR.loadLevel(0); GAME.state = 'play';
  const l = GAME.level;
  for (let x = 0; x < l.def.w; x++) for (let y = 11; y < l.def.h; y++) l.grid[y][x] = '#';
  const g0 = 20;
  for (let x = g0; x < g0 + gapTiles; x++) { l.grid[11][x] = '.'; l.grid[12][x] = '.'; }
  const p = player;
  p.x = (g0 - 6) * 16; p.y = 11 * 16 - 14;
  p.vx = sprint ? 2.1 : 1.65;
  p.vy = 0; p.onGround = true; p.airFrames = 0; p.spin = 0; p.spinHeld = false;
  keys.left = false; keys.right = true; keys.run = sprint; keys.jump = false; keys.spin = false;
  let ok = false, jumped = false;
  for (let i = 0; i < 260; i++) {
    // 站在坑沿（前缘已进坑）时起跳 —— 与人类/机器人一致
    const edge = Math.floor((p.x + p.w) / 16);
    if (!jumped && p.onGround && !SOLID.has(tileAt(l, edge, 11))) { keys.jump = true; jumped = true; }
    step();
    if (jumped && p.onGround && p.x + p.w > (g0 + gapTiles) * 16) { ok = true; break; }
    if (p.y > 11 * 16 + 24) break;
  }
  keys.right = keys.jump = keys.run = false;
  return ok;
}
for (const sprint of [false, true]) {
  let max = 0;
  for (let g = 3; g <= 10; g++) { if (cross(g, sprint)) max = g; else break; }
  console.log(`${sprint ? '疾跑 2.1' : '跑速 1.65'}: 最大可跨 ${max} 格`);
}
