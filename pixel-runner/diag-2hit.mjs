// 验证蘑菇怪「踩两下才死」：第一下受伤(仍活着, hp 1)、被击退；第二下才死
import { PR, GAME, player, keys, step } from './harness.mjs';

PR.loadLevel(0); GAME.state = 'play';
const l = GAME.level, e = l.enemies[0];
console.log('初始: type=' + e.type + ' hp=' + e.hp);

// 第一次踩：从上方落下
player.x = e.x + e.w / 2 - player.w / 2; player.y = e.y - 30;
player.vx = 0; player.vy = 1; player.airFrames = 99; player.landGrace = 0;
keys.jump = false; keys.right = false;
let res1 = null;
for (let i = 0; i < 60; i++) {
  step();
  if (e.hp < 2 || e.dead) { res1 = { 帧: i, hp: e.hp, dead: e.dead, 玩家vy: +player.vy.toFixed(2), 怪受击闪白: e.hitFlash > 0 }; break; }
}
console.log('第一次踩后:', JSON.stringify(res1));
console.log('  → 是否还活着(应活着):', !e.dead ? '✓ 仍活着' : '✗ 一下就死了');

// 等玩家落回、第二次踩
let res2 = null;
for (let i = 0; i < 200; i++) {
  // 每次落地就再跳起来踩一次（模拟玩家连踩）
  if (player.onGround && !e.dead) { keys.jump = true; player.vy = -5.2; player.onGround = false; }
  step();
  if (e.dead) { res2 = { 帧: i, hp: e.hp, dead: e.dead }; break; }
}
console.log('第二次踩后:', JSON.stringify(res2));
console.log('  → 是否被踩死(应死):', e.dead ? '✓ 第二下踩死' : '✗ 两下还没死');

// 侧撞仍应受伤（蘑菇怪有威胁）
PR.loadLevel(0); GAME.state = 'play';
const l2 = GAME.level, e2 = l2.enemies[0];
player.x = e2.x - 26; player.y = 11 * 16 - 14; player.vx = 1.65; player.vy = 0; player.hp = 3;
player.airFrames = 0; player.landGrace = 0;
keys.right = true; keys.jump = false;
let hurt = false;
for (let i = 0; i < 120; i++) { step(); if (player.hp < 3 || GAME.state === 'dead') { hurt = true; break; } }
console.log('侧撞是否受伤(应受伤):', hurt ? '✓ 有伤害' : '✗ 无伤害');
