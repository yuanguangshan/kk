// 为现有关卡挑复活点位置（只读分析）：中段、脚下实地、无敌人/尖刺/装饰冲突
import { PR, LEVELS } from './harness.mjs';

for (let i = 0; i < LEVELS.length; i++) {
  PR.loadLevel(i);
  const l = PR.GAME.level;
  const gy = l.def.groundY;
  const walkerCols = l.enemies.filter(e => e.type === 0).map(e => Math.round(e.x / 16));
  const coinCols = l.coins.map(c => c.x);
  const spikeCols = [];
  const decorCols = [];
  for (let x = 0; x < l.w; x++) {
    const row10 = l.grid[gy - 1][x];
    if (row10 === '^') spikeCols.push(x);
    if (row10 === 'd') decorCols.push(x);
  }
  const ok = [];
  for (let x = Math.floor(l.w * 0.35); x <= Math.floor(l.w * 0.78); x++) {
    if (l.grid[gy - 1][x] !== '.') continue;
    if (l.grid[gy][x] !== '#') continue;
    if (walkerCols.some(c => Math.abs(c - x) <= 2)) continue;
    if (spikeCols.some(c => Math.abs(c - x) <= 1)) continue;
    if (coinCols.some(c => Math.abs(c - x) <= 1)) continue;
    if (decorCols.some(c => c === x)) continue;
    // 复活点前后各留 2 格空地，避免一复活就掉坑/撞尖刺
    let clear = true;
    for (let d = -2; d <= 2 && clear; d++) {
      if (l.grid[gy - 1][x + d] !== '.' && l.grid[gy - 1][x + d] !== 'd') clear = false;
      if (l.grid[gy][x + d] !== '#') clear = false;
    }
    if (!clear) continue;
    ok.push(x);
  }
  console.log(`L${i + 1} ${l.name}: 候选列 [${ok.join(', ')}]`);
}