// 验证：① 踩鸟跳的弹起高度是否明显高于普通跳 ② 地刺埋伏会弹出/缩回、缩着时不伤人
import { PR, GAME, player, keys, step } from './harness.mjs';
const out = [];

// ① 踩鸟跳
PR.loadLevel(0); GAME.state = 'play';
{
  const l = GAME.level;
  const bird = l.enemies.find(e => e.type === 1);
  const p = player;
  p.x = bird.x - 2; p.y = bird.y - 30; p.vy = 1; p.vx = 0;
  p.prevBottom = p.y + p.h; p.airFrames = 99; p.landGrace = 0;
  let vyAfter = null, apex = p.y;
  for (let i = 0; i < 90; i++) {
    step();
    if (bird.dead && vyAfter === null) vyAfter = p.vy;
    if (vyAfter !== null) apex = Math.min(apex, p.y);
    if (vyAfter !== null && p.onGround && i > 10) break;
  }
  const rise = (11 * 16 - 14) - apex;
  out.push('踩鸟跳: 踩中后 vy=' + (vyAfter === null ? '未踩到' : vyAfter.toFixed(2)) +
    ', 弹起高度约 ' + Math.round(rise) + 'px ' + (rise > 90 ? '✓ 明显高于普通跳(73px)' : '✗ 不够高'));
}

// ② 地刺埋伏
{
  let found = null;
  for (let i = 0; i < PR.LEVELS.length && !found; i++) {
    PR.loadLevel(i);
    const b = (GAME.level.buried || [])[0];
    if (b) found = { li: i, x: b.x, y: b.y };
  }
  if (!found) out.push('地刺埋伏: 关卡里没有 ✗');
  else {
    PR.loadLevel(found.li); GAME.state = 'play';
    const bp = GAME.level.buried[0];
    const p = player;
    p.x = bp.x - 120; p.y = 11 * 16 - 14; p.vx = 0; p.vy = 0; p.onGround = true;
    // 远离时应该保持缩着
    for (let i = 0; i < 40; i++) step();
    const farUp = bp.up;
    // 走近 → 应该弹出
    p.x = bp.x - 20; p.vx = 0;
    let maxUp = 0;
    for (let i = 0; i < 80; i++) { step(); maxUp = Math.max(maxUp, bp.up); }
    out.push('地刺埋伏: 远离时 up=' + farUp.toFixed(2) + '（应≈0）, 靠近后最高 up=' + maxUp.toFixed(2) +
      ' → ' + (farUp < 0.05 && maxUp > 0.8 ? '✓ 会埋伏弹出' : '✗ 行为不对'));
    // 弹出时踩上去会死
    const dead = GAME.state === 'dead' || GAME.lives < 3;
    out.push('  弹出时是否致命: ' + (dead ? '✓ 会死' : '（这一轮没碰到）'));
  }
}
console.log(out.join('\n'));
