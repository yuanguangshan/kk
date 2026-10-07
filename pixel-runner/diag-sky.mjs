// 验证「天上的怪」：站在高空桥上巡逻、能被踩两下踩死
import { PR, GAME, player, keys, step } from './harness.mjs';
PR.loadLevel(3); GAME.state = 'play';
const l = GAME.level;
const e = l.enemies.find(x => x.sky);
if (!e) { console.log('第 4 关没有空中怪'); process.exit(1); }
const y0 = e.y, x0 = e.x;
// 让怪自己走一会儿，看是否掉下去
for (let i = 0; i < 300; i++) step();
console.log('巡逻 300 帧后: y 变化 ' + (e.y - y0).toFixed(1) + 'px（0=没掉下去）, 走了 ' + (Math.abs(e.x - x0) / 16).toFixed(1) + ' 格');
console.log('  仍站在桥面: ' + (e.y === y0 ? '✓' : '✗ 掉下去了'));

// 踩两下
PR.loadLevel(3); GAME.state = 'play';
const e2 = GAME.level.enemies.find(x => x.sky);
player.hp = 3;
const stomp = () => {
  player.x = e2.x + 4; player.y = e2.y - 24; player.vy = 1;
  player.prevBottom = player.y + player.h; player.landGrace = 0;
  for (let i = 0; i < 40; i++) { step(); if (e2.hp < 2 || e2.dead) break; }
};
stomp();
console.log('第 1 下踩后: hp=' + e2.hp + ' 活着=' + !e2.dead);
for (let i = 0; i < 80; i++) step();        // 等冷却过去
stomp();
console.log('第 2 下踩后: hp=' + e2.hp + ' 死了=' + !!e2.dead);
