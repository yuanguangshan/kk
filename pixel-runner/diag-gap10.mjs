// 针对第10关那个 8 格坑，试：普通跳 vs 起跳后第 N 帧旋转
import { PR, GAME, player, keys, step, SOLID, tileAt } from './harness.mjs';
function attempt(spinDelay, sprint) {
  PR.loadLevel(9); GAME.state = 'play';
  const l = GAME.level;
  const p = player;
  p.x = 10 * 16; p.y = 11 * 16 - 14; p.vx = sprint ? 2.1 : 1.65; p.vy = 0;
  p.onGround = true; p.airFrames = 0; p.spin = 0; p.spinHeld = false; p.landGrace = 0;
  keys.left = false; keys.right = true; keys.jump = false; keys.spin = false; keys.run = sprint;
  let jumped = false, f = 0, res = '掉坑';
  for (let i = 0; i < 300; i++) {
    const edge = Math.floor((p.x + p.w) / 16);
    if (!jumped && p.onGround && !SOLID.has(tileAt(l, edge, 11))) { keys.jump = true; jumped = true; f = 0; }
    if (jumped) {
      f++;
      if (spinDelay >= 0 && f === spinDelay) keys.spin = true;
      if (spinDelay >= 0 && f === spinDelay + 3) keys.spin = false;
    }
    step();
    if (p.onGround && p.x > 25 * 16) { res = '过坑了'; break; }
    if (p.y > 11 * 16 + 24) { res = '掉坑'; break; }
  }
  keys.right = keys.jump = keys.spin = keys.run = false;
  return res;
}
for (const sprint of [false, true]) {
  console.log(`--- ${sprint ? '疾跑 2.1' : '跑速 1.65'} ---`);
  console.log('  不旋转      : ' + attempt(-1, sprint));
  for (const d of [2, 4, 6, 10]) console.log(`  起跳后${String(d).padStart(2)}帧旋转: ` + attempt(d, sprint));
}
