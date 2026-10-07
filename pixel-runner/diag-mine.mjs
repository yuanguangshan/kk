// 验证：① 埋伏雷踩上就炸 ② 移动雷看得见、会来回走、碰到就炸
import { PR, GAME, player, keys, step } from './harness.mjs';
function findLevel(pred) { for (let i = 0; i < PR.LEVELS.length; i++) { PR.loadLevel(i); if (pred(GAME.level)) return i; } return -1; }
const out = [];

// ① 埋伏雷
{
  const li = findLevel(l => (l.mines || []).some(m => m.buried));
  PR.loadLevel(li); GAME.state = 'play';
  const mn = GAME.level.mines.find(m => m.buried);
  const p = player;
  p.x = mn.x; p.y = 11 * 16 - 14; p.vy = 0; p.vx = 0; p.onGround = true;
  let died = false;
  for (let i = 0; i < 120; i++) { step(); if (GAME.state === 'dead' || GAME.lives < 3) { died = true; break; } }
  out.push(`埋伏雷(第${li + 1}关): 踩上去 → ${died ? '✓ 炸了' : '✗ 没反应'}`);
}

// ② 移动雷
{
  const li = findLevel(l => (l.mines || []).some(m => !m.buried));
  PR.loadLevel(li); GAME.state = 'play';
  const mn = GAME.level.mines.find(m => !m.buried);
  const x0 = mn.x;
  const p = player;
  p.x = mn.x - 200; p.y = 11 * 16 - 14; p.vy = 0; p.vx = 0; p.onGround = true;   // 玩家离远点，观察雷自己走
  let minX = 1e9, maxX = -1e9;
  for (let i = 0; i < 260; i++) { step(); minX = Math.min(minX, mn.x); maxX = Math.max(maxX, mn.x); }
  const span = (maxX - minX) / 16;
  out.push(`移动雷(第${li + 1}关): 巡逻跨度 ${span.toFixed(1)} 格 → ${span > 0.8 ? '✓ 会来回移动' : '✗ 没动'}`);
  out.push(`  可见性: buried=${mn.buried}（false = 画成看得见的圆盘雷）`);
  // 撞上去
  PR.loadLevel(li); GAME.state = 'play';
  const mn2 = GAME.level.mines.find(m => !m.buried);
  const p2 = player;
  p2.x = mn2.x + 2; p2.y = 11 * 16 - 14; p2.vy = 0; p2.vx = 0; p2.onGround = true;
  let died = false;
  for (let i = 0; i < 120; i++) { step(); if (GAME.state === 'dead' || GAME.lives < 3) { died = true; break; } }
  out.push(`  碰到它 → ${died ? '✓ 炸了' : '✗ 没反应'}`);
}
console.log(out.join('\n'));
