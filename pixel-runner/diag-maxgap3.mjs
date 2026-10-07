// 在平地上挖不同宽度的坑，实测「普通跳 / 旋转跳」各自能跨多宽
import { PR, GAME, player, keys, step, SOLID, tileAt } from './harness.mjs';
function cross(gapTiles, spinDelay, sprint) {
  PR.loadLevel(0); GAME.state = 'play';
  const l = GAME.level;
  for (let x = 0; x < l.def.w; x++) for (let y = 0; y < l.def.h; y++) l.grid[y][x] = '.';
  for (let x = 0; x < l.def.w; x++) for (let y = 11; y < l.def.h; y++) l.grid[y][x] = '#';
  l.movers.length = 0; l.enemies.length = 0; (l.spikeMovers || []).length = 0;
  const g0 = 20;
  for (let x = g0; x < g0 + gapTiles; x++) { l.grid[11][x] = '.'; l.grid[12][x] = '.'; }
  const p = player;
  p.x = (g0 - 5) * 16; p.y = 11 * 16 - 14;
  p.vx = sprint ? 2.1 : 1.65; p.vy = 0; p.onGround = true;
  p.airFrames = 0; p.spin = 0; p.spinHeld = false; p.landGrace = 0;
  keys.left = false; keys.right = true; keys.run = sprint; keys.jump = false; keys.spin = false;
  let jumped = false, f = 0, ok = false;
  for (let i = 0; i < 300; i++) {
    const edge = Math.floor((p.x + p.w) / 16);
    if (!jumped && p.onGround && !SOLID.has(tileAt(l, edge, 11))) { keys.jump = true; jumped = true; f = 0; }
    if (jumped) { f++; if (spinDelay >= 0 && f === spinDelay) keys.spin = true; if (spinDelay >= 0 && f === spinDelay + 3) keys.spin = false; }
    step();
    if (p.onGround && p.x > (g0 + gapTiles) * 16) { ok = true; break; }
    if (p.y > 11 * 16 + 24) break;
  }
  keys.right = keys.jump = keys.spin = keys.run = false;
  return ok;
}
for (const sprint of [false, true]) {
  const tag = sprint ? '疾跑' : '跑速';
  let maxN = 0, maxS = 0, bestSpin = 0;
  for (let g = 3; g <= 9; g++) {
    if (cross(g, -1, sprint)) maxN = g;
    let spinOk = false;
    for (const d of [1, 2, 3, 4, 6, 9, 14, 20]) if (cross(g, d, sprint)) { spinOk = true; bestSpin = d; break; }
    if (spinOk) maxS = g;
  }
  console.log(`${tag}: 普通跳最大 ${maxN} 格, 旋转跳最大 ${maxS} 格`);
}
