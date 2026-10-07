// 扫描：不同坑宽 × 普通跳/旋转跳(多个时机) × 跑速/疾跑，落到对面算过
import { PR, GAME, player, keys, step, SOLID, tileAt } from './harness.mjs';
function tryGap(gap, spinDelay, sprint) {
  PR.loadLevel(0); GAME.state = 'play';
  const l = GAME.level;
  for (let x = 0; x < l.def.w; x++) for (let y = 0; y < l.def.h; y++) l.grid[y][x] = '.';
  for (let x = 0; x < l.def.w; x++) for (let y = 11; y < l.def.h; y++) l.grid[y][x] = '#';
  l.movers.length = 0; l.enemies.length = 0;
  const g0 = 20;
  for (let x = g0; x < g0 + gap; x++) { l.grid[11][x] = '.'; l.grid[12][x] = '.'; }
  const p = player;
  p.x = (g0 - 6) * 16; p.y = 11 * 16 - 14;
  p.vx = sprint ? 2.1 : 1.65; p.vy = 0; p.onGround = true;
  p.airFrames = 0; p.spin = 0; p.spinHeld = false; p.landGrace = 0;
  keys.left = false; keys.right = true; keys.run = sprint; keys.jump = false; keys.spin = false;
  let jumped = false, f = 0;
  for (let i = 0; i < 300; i++) {
    const edge = Math.floor((p.x + p.w) / 16);
    if (!jumped && p.onGround && !SOLID.has(tileAt(l, edge, 11))) { keys.jump = true; jumped = true; f = 0; }
    if (jumped) { f++; if (spinDelay >= 0 && f === spinDelay) keys.spin = true; if (spinDelay >= 0 && f === spinDelay + 4) keys.spin = false; }
    step();
    if (jumped && p.onGround && p.x + p.w > (g0 + gap) * 16) { keys.right = keys.jump = keys.spin = keys.run = false; return true; }
    if (p.y > l.h * 16) break;
    if (p.x > (g0 + gap + 6) * 16) break;
  }
  keys.right = keys.jump = keys.spin = keys.run = false;
  return false;
}
for (const sprint of [false, true]) {
  const tag = sprint ? '疾跑' : '跑速(手机)';
  console.log(`--- ${tag} ---`);
  for (let g = 4; g <= 9; g++) {
    const n = tryGap(g, -1, sprint);
    let spin = 0, total = 0;
    for (const d of [1,2,3,4,6,8,10,14,18]) { total++; if (tryGap(g, d, sprint)) spin++; }
    console.log(`  ${g}格: 普通跳=${n?'过':'掉坑'}  旋转跳=${spin}/${total} 种时机能过`);
  }
}
