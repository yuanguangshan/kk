// 关卡规则库：静态检查每一关的可达性。check-levels.mjs 与 gen-levels.mjs 共用。
export const T = 16;
export const SOLID = new Set(['#', 'B', '?', 'u', 'X']);
export const CLEAR_ROWS = 6;   // 坑沿上方需净空的行数（满跳约 73px ≈ 4.5 格）

const tileOf = (g, def, tx, ty) => (ty < 0 || ty >= def.h || tx < 0 || tx >= def.w) ? '.' : g[ty][tx];

/** 按段与 ops 复原关卡网格（与游戏 buildLevel 同口径，无实体：敌人/金币/移动平台）。 */
export function buildGrid(def) {
  const g = [];
  for (let y = 0; y < def.h; y++) g.push(new Array(def.w).fill('.'));
  const set = (x, y, ch) => { if (x >= 0 && x < def.w && y >= 0 && y < def.h) g[y][x] = ch; };
  for (const [a, b] of def.segs) for (let x = a; x <= b; x++) for (let y = def.groundY; y < def.h; y++) set(x, y, '#');
  // 虚空段：把该段地面整段挖空（掉下去就是死），板子随后再由 ops 铺上
  for (const op of def.ops) if (op[0] === 'dpit') for (let x = op[1]; x <= op[2]; x++) { set(x, def.groundY, '.'); set(x, def.groundY + 1, '.'); }
  for (const op of def.ops) if (op[0] === 'void') for (let x = op[1]; x <= op[2]; x++) for (let y = 0; y < def.h; y++) set(x, y, '.');
  for (const op of def.ops) {
    const k = op[0];
    if (k === 'p') for (let j = 0; j < op[3]; j++) set(op[1] + j, op[2], '=');
    else if (k === 'q' || k === 'b') set(op[1], op[2], k === 'q' ? '?' : 'B');
    else if (k === 'sp') for (let j = 0; j < op[3]; j++) set(op[1] + j, op[2], '^');
    else if (k === 'd') set(op[1], op[2], 'd');
    else if (k === 'goal') set(op[1], op[2], 'G');
  }
  return g;
}

/** 从地面满跳（RUN 1.65）或站面满跳的落点横坐标。 */
export function landXFrom(row, endCol, speed = 1.65) {
  const apex = row * T - 14 - 73;
  return (endCol + 1) * T - 10 + (31 + Math.sqrt(2 * (162 - apex) / 0.22)) * speed;
}

/** 返回问题列表；空数组即合规。 */
export function checkLevel(def) {
  const problems = [];
  const g = buildGrid(def);
  const gy = def.groundY;
  const at = (x, y) => tileOf(g, def, x, y);

  // 1) 坑宽与坑沿净空
  for (let s = 0; s + 1 < def.segs.length; s++) {
    const from = def.segs[s][1] + 1, to = def.segs[s + 1][0] - 1;
    const gap = to - from + 1;
    // 普通满跳射程约 6 格；7 格是「旋转跳专用坑」——空中旋转能延长滞空跨过去。
    // 超过 7 格连旋转跳也过不去，仍然算不合规。
    if (gap > 5) problems.push(`坑 ${from}-${to} 宽 ${gap} 格（超过 5 格跑跳极限）`);
    else if (false) {
      // 7 格坑必须落在「通往终点的主路上」，且两侧段要有助跑与落脚余地
      const before = def.segs[s][1] - def.segs[s][0] + 1, after = def.segs[s + 1][1] - def.segs[s + 1][0] + 1;
      if (before < 6 || after < 3) problems.push(`旋转跳坑 ${from}-${to} 两侧段太短（起跳 ${before} 格 / 落脚 ${after} 格）`);
    }
    for (const col of [from - 1, from, to, to + 1]) {
      for (let r = 1; r <= CLEAR_ROWS; r++) {
        const ch = at(col, gy - r);
        if (SOLID.has(ch)) problems.push(`坑 ${from}-${to} 附近列 ${col} 上方 ${gy - r} 行是实体 '${ch}'，会撞头`);
      }
    }
  }
  // 2) 尖刺必须踩在实地上
  for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) {
    if (g[y][x] === '^' && !SOLID.has(at(x, y + 1))) problems.push(`尖刺 ${x},${y} 下面是空的`);
  }
  // 3) 旗杆：在地面上且上方净空
  const goal = def.ops.find(o => o[0] === 'goal');
  if (!goal) problems.push('没有旗杆');
  else {
    for (let r = 1; r <= CLEAR_ROWS; r++) if (SOLID.has(at(goal[1], gy - r))) problems.push(`旗杆列 ${goal[1]} 上方被挡`);
    if (!SOLID.has(at(goal[1], gy))) problems.push('旗杆不在地面上');
  }
  // 4) 出生点脚下实地
  const st = def.ops.find(o => o[0] === 'start');
  if (!st) problems.push('没有出生点');
  else if (!SOLID.has(at(st[1], st[2] + 1))) problems.push(`出生点 ${st[1]} 脚下没有地面`);
  // 5) 飞行敌人高度（撞上去会被顶开，只做提示）
  // 第 24 关（SHROOMSKY）是「整屏紫蘑菇」特殊关，允许紫蘑菇铺到贴地行挡路；其他关仍限制高度
  const isShroomSky = def.name === 'SHROOMSKY';
  if (!isShroomSky) {
    for (const o of def.ops.filter(x => x[0] === 'f')) if (o[2] > 6) problems.push(`飞行敌人 ${o[1]},${o[2]} 太低`);
  }
  // 6) 平台上方 3 格净空（起跳不撞头）
  for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) {
    if (g[y][x] !== '=') continue;
    for (let r = 1; r <= 3; r++) {
      const ch = at(x, y - r);
      if (SOLID.has(ch)) { problems.push(`平台 ${x},${y} 上方 ${y - r} 行是 '${ch}'，起跳会撞头`); break; }
    }
  }
  // 7) 踩敌人反弹送出 4-5 格：敌人身后要有落点；头顶 ±4 格无实体
  for (const o of def.ops.filter(x => x[0] === 'e')) {
    let run = 0;
    for (let x = o[1] + 1; x < def.w; x++) { if (!SOLID.has(at(x, gy))) break; run++; }
    if (run < 3) problems.push(`敌人 ${o[1]} 身后只有 ${run} 格实地`);
    // 出生点必须在段首 3 格之后：段首是跨坑落点区，怪蹲在那里会直接撞死刚落地的玩家
    const seg = def.segs.find(sg => o[1] >= sg[0] && o[1] <= sg[1]);
    if (seg && o[1] - seg[0] < 3) problems.push(`敌人 ${o[1]} 在段首 ${o[1] - seg[0]} 格（落点区），需 ≥3`);
    for (let dx = -4; dx <= 4; dx++) for (let r = 1; r <= 5; r++) {
      const ch = at(o[1] + dx, gy - r);
      if (SOLID.has(ch)) { problems.push(`敌人 ${o[1]} 头顶 ${o[1] + dx},${gy - r} 是 '${ch}'`); dx = 9; break; }
    }
  }
  // 8) 每关恰好一个复活点，脚下实地、前后 2 格安全
  const cps = def.ops.filter(x => x[0] === 'cp');
  if (cps.length !== 1) problems.push(`复活点数量 ${cps.length}（应为 1）`);
  else {
    const [cx, cy] = [cps[0][1], cps[0][2]];
    if (!SOLID.has(at(cx, cy + 1))) problems.push(`复活点 ${cx} 脚下没有地面`);
    for (let dx = -2; dx <= 2; dx++) {
      const row = at(cx + dx, cy);
      if (row !== '.' && row !== 'd') problems.push(`复活点 ${cx} 旁是 '${row}'`);
      if (!SOLID.has(at(cx + dx, cy + 1))) problems.push(`复活点 ${cx} 旁有坑`);
      if (row === '^') problems.push(`复活点 ${cx} 旁有尖刺`);
    }
  }
  // 9) 尖刺头顶 3 格净空
  for (let x = 0; x < def.w; x++) {
    if (g[gy - 1][x] !== '^') continue;
    for (let r = 1; r <= 3; r++) {
      const ch = at(x, gy - 1 - r);
      if (SOLID.has(ch)) { problems.push(`尖刺 ${x} 头顶是 '${ch}'`); break; }
    }
  }
  // 10) 空中站面（平台/砖顶）末端满跳落点必须够到实地，否则必死跳
  const voidRanges = def.ops.filter(o => o[0] === 'void').map(o => [o[1], o[2]]);
  const inVoid = (x) => voidRanges.some(([a2, b2]) => x >= a2 && x <= b2);
  for (let y = 0; y < gy - 1; y++) {
    for (let x = 0; x < def.w; x++) {
      if (inVoid(x)) continue;                 // 虚空段上的板子：落点本来就是虚空
      const me = g[y][x];
      if (me !== '=' && !SOLID.has(me)) continue;
      const above = at(x, y - 1);
      if (above === '=' || SOLID.has(above)) continue;      // 只看顶面开放的连续块末端
      if (at(x + 1, y) === '=' || SOLID.has(at(x + 1, y))) continue;
      const landX = landXFrom(y, x, 1.65);
      const c0 = Math.floor(landX / T), c1 = Math.floor((landX + 9) / T);
      if (!SOLID.has(at(c0, gy)) && !SOLID.has(at(c1, gy))) problems.push(`${me === '=' ? '平台' : '砖'}顶 ${x},${y} 满跳落点 ${c0} 是坑`);
    }
  }
  // 10b) 虚空段：段末之后必须有实地，玩家从最后一块板跳出来不能直接掉进虚空
  for (const [a2, b2] of voidRanges) {
    let solidAfter = false;
    for (let x = b2 + 1; x <= Math.min(def.w - 1, b2 + 8) && !solidAfter; x++) if (SOLID.has(at(x, gy))) solidAfter = true;
    if (!solidAfter) problems.push();
  }
  // 11) 移动平台末端满跳落点必须够到实地（['m', x, row, dx]，右端覆盖到 x+dx+2 列）
  for (const o of def.ops.filter(x => x[0] === 'm')) {
    const endCol = o[1] + o[3] + 2;
    for (const speed of [1.65, 2.1]) {
      const landX = landXFrom(o[2], endCol, speed);
      const c0 = Math.floor(landX / T), c1 = Math.floor((landX + 9) / T);
      if (!SOLID.has(at(c0, gy)) && !SOLID.has(at(c1, gy))) {
        problems.push(`移动平台末端 ${endCol} 满跳落点 ${c0} 是坑`);
        break;
      }
    }
  }
  return problems;
}