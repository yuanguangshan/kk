// 只看 5~7 格坑：普通跳 vs 旋转跳 的通过情况（跑速）
import { PR, GAME, player, keys, step, SOLID, tileAt } from './harness.mjs';
function cross(gapTiles, spinDelay) {
  PR.loadLevel(0); GAME.state = 'play';
  const l = GAME.level;
  for (let x = 0; x < l.def.w; x++) for (let y = 0; y < l.def.h; y++) l.grid[y][x] = '.';
  for (let x = 0; x < l.def.w; x++) for (let y = 11; y < l.def.h; y++) l.grid[y][x] = '#';
  l.movers.length = 0; l.enemies.length = 0;
  const g0 = 20;
  for (let x = g0; x < g0 + gapTiles; x++) { l.grid[11][x] = '.'; l.grid[12][x] = '.'; }
  const p = player;
  p.x = (g0 - 5) * 16; p.y = 11 * 16 - 14; p.vx = 1.65; p.vy = 0; p.onGround = true;
  p.airFrames = 0; p.spin = 0; p.spinHeld = false;
  keys.left = false; keys.right = true; keys.run = false; keys.jump = false; keys.spin = false;
  let jumped = false, f = 0, landCol = 0, ok = false;
  for (let i = 0; i < 300; i++) {
    const edge = Math.floor((p.x + p.w) / 16);
    if (!jumped && p.onGround && !SOLID.has(tileAt(l, edge, 11))) { keys.jump = true; jumped = true; f = 0; }
    if (jumped) { f++; if (spinDelay >= 0 && f === spinDelay) keys.spin = true; if (spinDelay >= 0 && f === spinDelay + 4) keys.spin = false; }
    step();
    if (jumped && p.onGround) { landCol = p.x / 16; ok = landCol > g0 + gapTiles; break; }
    if (p.y > 11 * 16 + 24) break;
  }
  keys.right = keys.jump = keys.spin = false;
  return { ok, landCol: +landCol.toFixed(1) };
}
for (const g of [5, 6, 7]) {
  const n = cross(g, -1);
  let best = null;
  for (const d of [1, 2, 4, 6, 9, 14]) { const r = cross(g, d); if (r.ok) { best = d; break; } }
  console.log(`${g} 格坑: 普通跳=${n.ok ? '过(落'+n.landCol+')' : '掉坑'}  旋转跳=${best !== null ? '过(第'+best+'帧)' : '掉坑'}`);
}
