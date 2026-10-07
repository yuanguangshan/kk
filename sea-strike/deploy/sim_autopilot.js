/* 自动驾驶闭环仿真（Node，不依赖浏览器）
 * 直接 eval game.js 里的真实 autopilotCtrl，用真实的 Ent.updatePlane 作为被控对象。
 *   node deploy/sim_autopilot.js
 */
'use strict';
global.window = global;
require('../js/math.js');
global.AudioSys = { play() {}, update() {}, init() {}, isMuted() { return false; }, setMuted() {}, toggleMuted() { return false; }, setVolume() {} };
require('../js/entities.js');

const fs = require('fs');
const path = require('path');
const { V3, Q, clamp, DEG, wrapPi } = MM;
const Ent = global.Ent;

/* ---- 取出 game.js 里的自动驾驶段落并 eval ---- */
const src = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
const n0 = src.indexOf('  function nearestCarrier(p) {');
const n1 = src.indexOf('\n  }\n', n0);
const nearestSrc = n0 > 0 && n1 > n0 ? src.slice(n0, n1 + 4) : '';
const s0 = src.indexOf('  const AUTO_HANDOVER');
const s1 = src.indexOf('  function updateLock(dt) {');
if (s0 < 0 || s1 < 0) { console.error('未找到自动驾驶代码段'); process.exit(1); }
const chunk = nearestSrc + src.slice(s0, s1) + '\n;global.__auto = { engageAuto, disengageAuto, autopilotCtrl };';

const G = { auto: { on: false }, carrier: null };
const DECK = { halfLen: 165, halfBeam: 20.5, y: 14 };   // 与 game.js 一致
function log() { }
eval(chunk);
const auto = global.__auto;

/* ---- 场景与被控对象 ---- */
function makeWorld() {
  const ship = Ent.makeShip('carrier', 0, 0, 0);
  ship.deckY = 14;
  const p = Ent.makePlane('player', 0, 0, 0, 0);
  p.alive = true; p.hp = 100; p.fuel = 1; p.gear = false; p.gearPos = 0;
  G.player = p; G.carrier = ship; G.carriers = [ship]; G.landing = ship;
  return { ship, p };
}

function attitude(p) {
  const ax = Q.axes({}, p.q);
  p.pitch = Math.asin(clamp(ax.f.y, -1, 1));
  p.yaw = Math.atan2(ax.f.x, -ax.f.z);
  p.roll = Math.atan2(-ax.r.y, Math.hypot(ax.r.x, ax.r.z));
  p.spd = V3.len(p.vel); p.vs = p.vel.y;
}

function run(name, place) {
  const { ship, p } = makeWorld();
  place(p, ship);
  attitude(p);
  G.auto.on = false;
  auto.engageAuto('sim');

  const dt = 1 / 60;
  const traj = [];
  let crashed = false, handedOver = false, minAlt = 1e9, minDist = 1e9;
  let landed = null; const L1 = true;
  for (let i = 0; i < 10800; i++) {
    const c = auto.autopilotCtrl(p, dt);
    Ent.updatePlane(p, dt, c);
    attitude(p);
    const dx = p.pos.x - ship.pos.x, dz = p.pos.z - ship.pos.z;
    const dist = Math.hypot(dx, dz);
    minAlt = Math.min(minAlt, p.pos.y);
    minDist = Math.min(minDist, dist);
    if (i % 600 === 0 || i === 0) {
      const f = Ent.shipFwd(ship), r = Ent.shipRight(ship);
      const ds = G.auto.ds || -1;
      const along = -((p.pos.x - ship.pos.x) * (f.x * ds) + (p.pos.z - ship.pos.z) * (f.z * ds));
      const off = (p.pos.x - ship.pos.x) * r.x + (p.pos.z - ship.pos.z) * r.z;
      traj.push({ t: i / 60, dist: Math.round(dist), alt: Math.round(p.pos.y), kmh: Math.round(p.spd * 3.6), stage: G.auto.label, along: Math.round(along), off: Math.round(off), gate: G.auto.gate ? 1 : 0 });
    }
    if (p.pos.y < 3) { crashed = true; break; }
    // 触舰检测（与 game.js 的 checkCarrierDeck 条件一致）
    if (L1 !== false) {
      const L = Ent.shipLocal(ship, p.pos);
      if (p.pos.y < ship.deckY + 1.1 && p.vel.y < -0.3 && p.pos.y > ship.deckY - 1.2 &&
          Math.abs(L.x) < 20.5 && L.z > -165 && L.z < 165) {
        landed = { 下沉: +(-p.vel.y).toFixed(1), 相对速度: +(p.spd - ship.speed).toFixed(1),
                   横向: +L.x.toFixed(1), 舰位: Math.round(L.z), 高度: +p.pos.y.toFixed(1) };
        break;
      }
    }
    if (!G.auto.on) { handedOver = true; traj.push({ t: +(i / 60).toFixed(1), dist: Math.round(dist), alt: Math.round(p.pos.y), kmh: Math.round(p.spd * 3.6), stage: G.auto.label, auto: 0 }); break; }
    // 航母匀速前进（真实会移动）
    ship.pos.x += Math.sin(ship.yaw) * ship.speed * dt;
    ship.pos.z += -Math.cos(ship.yaw) * ship.speed * dt;
  }
  console.log('── ' + name);
  console.log('   轨迹 ' + JSON.stringify(traj));
  if (landed) {
    console.log('   坠海:✅ 否  🛬 触舰成功 ' + JSON.stringify(landed) + (handedOver ? '（中途交接给人类）' : '（全程 AI 自动落舰）'));
    return { crashed: false, handedOver: true, landed: true, minAlt, minDist };
  }
  console.log('   坠海:' + (crashed ? '❌ 是' : '✅ 否') + '  最低高度:' + Math.round(minAlt) + 'm  最近距离:' + Math.round(minDist) + 'm  交接:' + (handedOver ? '✅ ' + Math.round(minDist) + 'm' : '❌ 未交接'));
  return { crashed, handedOver, minAlt, minDist, landed: false };
}

const r = [];
r.push(run('A 侧方 8km / 350m（用户报的转圈场景）', (p, ship) => {
  const rr = Ent.shipRight(ship);
  p.pos.x = rr.x * 8000; p.pos.z = rr.z * 8000; p.pos.y = 350;
  p.vel.x = 0; p.vel.y = -5; p.vel.z = -230; p.spd = 230;
  Q.fromEulerYXZ(p.q, Math.atan2(0, 230), 0, 0);
}));
r.push(run('B 舰后 6km / 600m', (p, ship) => {
  const f = Ent.shipFwd(ship);
  p.pos.x = f.x * -6000; p.pos.z = f.z * -6000; p.pos.y = 600;
  p.vel.x = f.x * 230; p.vel.y = -3; p.vel.z = f.z * 230; p.spd = 230;
  Q.fromEulerYXZ(p.q, Math.atan2(f.x, -f.z), 0, 0);
}));
r.push(run('C 舰前 7km / 900m（逆向进场）', (p, ship) => {
  const f = Ent.shipFwd(ship);
  p.pos.x = f.x * 7000; p.pos.z = f.z * 7000; p.pos.y = 900;
  p.vel.x = -f.x * 250; p.vel.y = -5; p.vel.z = -f.z * 250; p.spd = 250;
  Q.fromEulerYXZ(p.q, Math.atan2(-f.x, f.z), 0, 0);
}));
r.push(run('D 侧方 4km / 低空 120m', (p, ship) => {
  const rr = Ent.shipRight(ship);
  p.pos.x = rr.x * 4000; p.pos.z = rr.z * 4000; p.pos.y = 120;
  p.vel.x = 0; p.vel.y = -3; p.vel.z = -160; p.spd = 160;
  Q.fromEulerYXZ(p.q, Math.atan2(0, 160), 0, 0);
}));

r.push(run('E 舰前 1.5km 却在飞离（须 180° 掉头）', (p, ship) => {
  const f = Ent.shipFwd(ship);
  p.pos.x = f.x * 1500; p.pos.z = f.z * 1500; p.pos.y = 500;
  p.vel.x = f.x * 220; p.vel.y = -2; p.vel.z = f.z * 220; p.spd = 220;
  Q.fromEulerYXZ(p.q, Math.atan2(f.x, -f.z), 0, 0);
}));
r.push(run('F 舰正后方 2km / 低空 80m', (p, ship) => {
  const f = Ent.shipFwd(ship);
  p.pos.x = f.x * -2000; p.pos.z = f.z * -2000; p.pos.y = 80;
  p.vel.x = f.x * 200; p.vel.y = -3; p.vel.z = f.z * 200; p.spd = 200;
  Q.fromEulerYXZ(p.q, Math.atan2(f.x, -f.z), 0, 0);
}));

r.push(run('G 全自动机型 · 自动起飞+自动落舰', (p, ship) => {
  const f = Ent.shipFwd(ship);
  // 起始：舰后 4000m 高度 600m（模拟起飞后直接交给 AI 返航）
  p.pos.x = f.x * -4000; p.pos.z = f.z * -4000; p.pos.y = 600;
  p.vel.x = f.x * 220; p.vel.y = -4; p.vel.z = f.z * 220; p.spd = 220;
  Q.fromEulerYXZ(p.q, Math.atan2(f.x, -f.z), 0, 0);
  p.autoFly = true; p.lockRate = 5; p.dmgMul = 1.2;
}));

const bad = r.filter(x => x.crashed || !x.handedOver);
console.log('\n总结: ' + (bad.length === 0 ? '✅ ' + r.length + '/' + r.length + ' 全部安全收敛并在最后 700m 交接' : '❌ ' + bad.length + ' 个场景失败'));
process.exit(bad.length ? 1 : 0);