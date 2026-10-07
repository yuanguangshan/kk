// 实测：普通跳 / 旋转跳 各自最大能跨多宽的坑（直接在平地上挖坑试）
import { PR, GAME, player, keys, step } from './harness.mjs';
function cross(gapTiles, useSpin) {
  PR.loadLevel(0); GAME.state = 'play';
  const l = GAME.level;
  for (let x = 0; x < l.def.w; x++) for (let y = 11; y < l.def.h; y++) l.grid[y][x] = '#';
  const g0 = 20;                                   // 坑从 20 列开始
  for (let x = g0; x < g0 + gapTiles; x++) { l.grid[11][x] = '.'; l.grid[12][x] = '.'; }
  const p = player;
  p.x = (g0 - 4) * 16; p.y = 11 * 16 - 14; p.vx = 1.65; p.vy = 0; p.onGround = true;
  p.airFrames = 0; p.spin = 0; p.spinHeld = false; p.landGrace = 0;
  keys.left = false; keys.right = true; keys.jump = false; keys.spin = false;
  let spun = false, ok = false;
  for (let i = 0; i < 260; i++) {
    if (p.onGround && p.x + p.w > g0 * 16 - 8) keys.jump = true;      // 坑边起跳
    if (useSpin && keys.jump && !p.onGround && !spun && p.vy < 0) { keys.spin = true; spun = true; }
    step();
    if (p.onGround && p.x > (g0 + gapTiles) * 16) { ok = true; break; }
    if (p.y > 11 * 16 + 24) break;
  }
  keys.right = keys.jump = keys.spin = false;
  return ok;
}
for (const useSpin of [false, true]) {
  const label = useSpin ? '旋转跳' : '普通跳';
  let max = 0;
  for (let g = 3; g <= 9; g++) { if (cross(g, useSpin)) max = g; else break; }
  console.log(`${label}: 最大可跨 ${max} 格`);
}
