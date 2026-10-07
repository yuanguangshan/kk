import { PR, GAME, player, keys, step, SOLID, tileAt } from './harness.mjs';

const setup = () => { PR.loadLevel(0); GAME.state = 'play'; return GAME.level; };
const report = [];

/* A. 侧面平撞（玩家在地面走向敌人）——期望：玩家受伤 */
{
  const l = setup(); const e = l.enemies[0];
  player.x = e.x - 30; player.y = 11 * 16 - 14; player.vx = 0; player.vy = 0; player.landFrames = 99;
  keys.right = true; keys.jump = false; keys.left = false;
  let out = '未接触';
  for (let i = 0; i < 90; i++) {
    step();
    if (e.dead) { out = '敌人被踩死(玩家无伤!)'; break; }
    if (GAME.state === 'play' && player.hp < 3) { out = '玩家受伤 ✓'; break; }
    if (GAME.state === 'dead') { out = '玩家死亡 ✓'; break; }
  }
  report.push('A 侧面平撞      -> ' + out);
}
/* B. 从上方落下踩（竖直落到敌人头顶）——期望：敌人死 */
{
  const l = setup(); const e = l.enemies[0];
  player.x = e.x + e.w / 2 - player.w / 2; player.y = e.y - 30; player.vx = 0; player.vy = 1;
  player.landFrames = 99; keys.right = false; keys.jump = false;
  let out = '未接触';
  for (let i = 0; i < 60; i++) {
    step();
    if (e.dead) { out = '敌人被踩死 ✓'; break; }
    if (GAME.state === 'dead' || player.hp < 3) { out = '玩家受伤/死亡 ✗'; break; }
  }
  report.push('B 上方落下踩    -> ' + out);
}
/* C. 巡逻范围（敌人能否走完整段平台） */
{
  const l = setup(); const e = l.enemies[0];
  const seg = l.def.segs.find(s => e.sx / 16 >= s[0] && e.sx / 16 <= s[1]);
  let min = 1e9, max = -1e9;
  keys.right = keys.jump = false;
  player.x = -999; player.y = -999;              // 玩家挪开，避免干扰
  for (let i = 0; i < 600; i++) { step(); min = Math.min(min, e.x); max = Math.max(max, e.x); }
  const span = ((max - min) / 16).toFixed(1);
  const segW = seg[1] - seg[0] + 1;
  report.push(`C 巡逻范围      -> 出生列${Math.round(e.sx / 16)} 所在段[${seg[0]},${seg[1]}] 宽${segW}格；实际走动 ${span} 格 ${span < 2 ? '← 只走一小段' : '← 走全程 ✓'}`);
}
/* D. 命耗尽后的去向——期望：留本关复活点，而不是回第 1 关 */
{
  setup();
  GAME.levelIndex = 5; PR.loadLevel(5); GAME.state = 'play';
  const l = GAME.level;
  if (l.cp) { l.cp.active = true; }
  GAME.lives = 1;
  player.y = l.h * 16 + 40;                       // 掉坑
  let out = '?';
  for (let i = 0; i < 200; i++) {
    step();
    if (GAME.state === 'over') { out = 'GAME OVER（再按开始会回到第 1 关，进度全丢）✗'; break; }
    if (GAME.state === 'play' && GAME.levelIndex === 5) { out = `留在第 ${GAME.levelIndex + 1} 关复活 ✓ 命=${GAME.lives}`; break; }
    if (GAME.state === 'play' && GAME.levelIndex === 0) { out = '被丢回第 1 关 ✗'; break; }
  }
  report.push('D 命耗尽后      -> ' + out);
}
console.log(report.join('\n'));
