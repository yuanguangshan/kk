// 无头机器人试玩：用真实游戏脚本验证每一关都能跑通
import { PR, GAME, player, keys, SOLID, tileAt, step } from './harness.mjs';

const RUNNER = !!process.env.RUNNER;   // 只考核地形：忽略敌人与尖刺
const WALK = !!process.env.WALK;       // 不疾跑：手机端只能按普通跑速过关
const only = process.env.LEVEL ? Number(process.env.LEVEL) - 1 : null;
const MAX_FRAMES = 60 * 150;

function play(levelIndex) {
  GAME.totalCoins = 0; GAME.totalTime = 0; GAME.deaths = 0;
  GAME.state = 'play';
  PR.loadLevel(levelIndex);
  GAME.state = 'play';
  GAME.lives = 80;
  if (RUNNER) for (const e of GAME.level.enemies) e.dead = -9999;

  let jumping = 0, hold = 0, frames = 0, spinArmed = false, spinAt = 0;
  let sprint = true, holdMul = 1, hopSpike = false;
  let lastLives = GAME.lives, prevState = 'play', lastX = 0;
  const deathsAt = [];
  const ring = [];
  const jumps = [];

  while (frames < MAX_FRAMES) {
    step(); frames++;
    const l = GAME.level;
    if (!l) break;
    if (GAME.state === 'dead' && prevState === 'play') {
      deathsAt.push(Math.round(lastX / 16));
      if (process.env.TRACE) console.error('--- 死于 tile ' + Math.round(lastX / 16) + ' (原因:' + GAME.deathWhy + ') ---\n' + ring.slice(-60).join('\n') + '\n[起跳] ' + jumps.slice(-3).join('\n[起跳] '));
    }
    if (GAME.state === 'play') { ring.push(frames + ' x=' + player.x.toFixed(1) + ' y=' + player.y.toFixed(1) + ' vx=' + player.vx.toFixed(2) + ' vy=' + player.vy.toFixed(2) + ' g=' + (player.onGround ? 1 : 0) + ' j=' + (keys.jump ? 1 : 0)); if (ring.length > 60) ring.shift(); }
    prevState = GAME.state;
    lastX = player.x;

    if (GAME.lives < lastLives) {           // 刚复活，换一套打法
      lastLives = GAME.lives;
      sprint = Math.random() < 0.75;
      holdMul = 0.5 + Math.random() * 0.5;
      hopSpike = Math.random() < 0.5;
      jumping = 0; hold = 0;
    }

    if (GAME.state === 'clear') {
      keys.right = false; keys.jump = false;
      return { ok: true, time: GAME.time / 60, coins: GAME.coins, deaths: GAME.deaths, deathsAt };
    }
    if (GAME.state === 'over') return { ok: false, deathsAt, reason: '命数用尽' };
    if (GAME.state !== 'play') { keys.right = false; keys.jump = false; jumping = 0; continue; }

    keys.right = true;
    keys.run = !WALK && sprint;
    const cx = Math.floor((player.x + player.w / 2) / 16);
    const feet = Math.floor((player.y + player.h + 2) / 16);
    // 斜坡也算站得住（站在坡上时脚底行是 groundY-1，必须一起认，否则机器人看不出前面是坑会直接走下去）
    const onGroundRow = feet === l.def.groundY ||
      ['/', '\\'].includes(tileAt(l, Math.floor((player.x + player.w / 2) / 16), feet));
    const stand = ch => SOLID.has(ch) || ch === '=' || ch === '/' || ch === '\\';   // 单向平台与斜坡都能站，不算空
    // 起跳时机看 box 前缘是否已进入下一格：太早起跳会少跨半格，落进坑里
    const edge = Math.floor((player.x + player.w) / 16);

    const gap = onGroundRow && !stand(tileAt(l, edge, feet));
    // 站在平台上跑到边缘也要起跳，否则会掉进坑里
    const platEdge = !onGroundRow && player.onGround && !stand(tileAt(l, edge, feet));
    // 阶梯攀爬：前方 1 格是实心台阶时就跳（长度按台阶高度选，避免满跳冲过头）
    let onStair = false, stepH = 0;
    {
      const cAhead = Math.floor((player.x + player.w + 2) / 16);
      const rowFeet = Math.floor((player.y + player.h) / 16);
      if (SOLID.has(tileAt(l, cAhead, rowFeet - 1))) {
        onStair = true;
        for (let r = rowFeet - 1; r >= 0 && SOLID.has(tileAt(l, cAhead, r)); r--) stepH++;
      }
    }
    let wall = false;
    for (let r = Math.floor(player.y / 16); r <= Math.floor((player.y + player.h - 2) / 16); r++) {
      if (SOLID.has(tileAt(l, Math.floor((player.x + player.w + 3) / 16), r))) wall = true;
    }
    let enemy = false, enemyTarget = null;
    if (RUNNER) enemy = false;
    for (const e of l.enemies) {
      if (e.dead) continue;
      // 天空偷袭怪：还没掉下来时不算威胁（在高处），掉下来之后按普通怪处理
      if (e.faller && (e.armed || e.windup > 0)) continue;
      if (e.type !== 0 && !e.faller) continue;
      const dx = (e.x - player.x) / 16;
      if (dx > 0 && dx < 5 && Math.abs(e.y - player.y) < 18 && Math.abs(player.vx) > 0.6) {
        enemy = true;
        if (!enemyTarget || e.x < enemyTarget.x) enemyTarget = e;
      }
    }
    // 按 box 前缘检测：用中心格会比实际踏入晚一帧，撞上尖刺才起跳
    const spike = !RUNNER && [0, 1].some(d => tileAt(l, edge + d, feet - 1) === '^');

    let pitNear = false;
    for (let d = 1; d <= 6; d++) if (onGroundRow && !stand(tileAt(l, edge + d - 1, feet))) { pitNear = true; break; }

    const want = gap || platEdge || wall || enemy || spike || onStair;
        let holdFrames;
    if (onStair && !gap) {
      holdFrames = Math.round(62 * holdMul);          // 上台阶：中等跳就够，满跳会冲过平台
    } else if (gap || platEdge || wall) {
      holdFrames = Math.round(99 * holdMul);
    } else {
      // 选一个能安全落地的按跳时长：估算滞空距离，挑落点后方还有 2 格实地的最短跳
      // 撞敌人要跳够高：矮跳会从侧面擦到，判为撞死而不是踩死
      const vx = Math.max(1.2, Math.abs(player.vx));
      // 敌人：优先算一个「正好踩在怪身上」的跳（预测怪在这段时间的位移），
      // 踩头判定要求落地瞬间脚底压在怪身上，靠太近起跳会在上升段被撞。
      let stompHold = -1;
      if (enemy && enemyTarget) {
        const evx = enemyTarget.vx || 0;
        for (let h = 6; h <= 40; h += 2) {
          const rise = h * 4.85 - 0.0775 * h * h;
          const fall = Math.sqrt(2 * Math.max(0, rise) / 0.22);
          const T = h + fall;                      // 滞空帧数
          const landX = player.x + T * vx;         // 我方落点
          const exX = enemyTarget.x + evx * T;     // 怪的预测位置
          if (Math.abs(landX - (exX + enemyTarget.w / 2 - player.w / 2)) < 6) { stompHold = h; break; }
        }
      }
      const cands = enemy ? (stompHold > 0 ? [stompHold, 14, 18, 22, 26, 30, 34] : [14, 18, 22, 26, 30, 34])
                          : [4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 26, 34];
      let best = cands[cands.length - 1];
      for (const h of cands) {
        const rise = h * 4.85 - 0.0775 * h * h;
        const fall = Math.sqrt(2 * Math.max(0, rise) / 0.22);
        const landX = player.x + (h + fall) * vx;
        const t0 = Math.floor(landX / 16);
        let safe = stand(tileAt(l, t0, feet)) && stand(tileAt(l, t0 + 1, feet));
        for (let k = 0; k < 3 && safe; k++) { const ch = tileAt(l, t0 + k, feet - 1); safe = safe && !SOLID.has(ch) && ch !== "^"; }
        if (safe) { best = h; break; }
      }
      holdFrames = best;
    }

    // 深坑（≥7 格）普通跳够不到：起跳后在上升段按旋转，延长滞空跨过去
    let wideGap = 0;
    if (onGroundRow) for (let d = 0; d < 9; d++) { if (stand(tileAt(l, edge + d, feet))) break; wideGap++; }
    const needSpin = wideGap >= 7;

    if (want && player.onGround && !jumping) {
      if (process.env.TRACE) {
        jumps.push(`frame${frames} x=${player.x.toFixed(0)} y=${player.y.toFixed(0)} feet=${feet} cx=${cx} gap=${gap} plat=${platEdge} wall=${wall} enemy=${enemy} spike=${spike} hold=${holdFrames}`);
        if (jumps.length > 8) jumps.shift();
      }
      jumping = 1; hold = holdFrames; keys.jump = true; spinArmed = needSpin; spinAt = 4;
    } else if (jumping && spinArmed && spinAt-- <= 0 && !player.onGround) {
      keys.spin = true; spinArmed = false;          // 空中旋转：延长滞空飞过深坑
    } else if (jumping && player.vy < -0.25 && hold > 0) {
      hold--; keys.jump = true; keys.spin = false;
    } else {
      keys.jump = false;
      if (jumping && player.vy >= 0) jumping = 0;
    }
  }
  keys.right = false; keys.jump = false; keys.spin = false;
  return { ok: false, deathsAt, reason: '超时', x: Math.round(player.x / 16), y: Math.round(player.y) };
}

for (let i = 0; i < PR.LEVELS.length; i++) {
  if (only !== null && i !== only) continue;
  const r = play(i);
  const stuck = r.deathsAt.length ? ` 反复卡在 tile ${[...new Set(r.deathsAt)].join('/')}` : '';
  const tail = r.ok ? '' : ` 结束于 tile${r.x} y${r.y}`;
  console.log(`关卡${i + 1}: ${r.ok ? `通关 ${r.time.toFixed(1)}s 金币${r.coins} 死亡${r.deaths}` : `失败(${r.reason}) 尝试${r.deathsAt.length}次`}${stuck}${tail}`);
}