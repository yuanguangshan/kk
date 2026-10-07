// 生成 20 关并写入 index.html 标记区；每关都用 rules.mjs 校验，不过就换种子重试
import { readFileSync, writeFileSync } from 'node:fs';
import { checkLevel, buildGrid, landXFrom, SOLID, T } from './rules.mjs';

const FILE = new URL('./index.html', import.meta.url);
const BEGIN = '  /* EXTRAS:BEGIN 由 gen-levels.mjs 生成，勿手改；regen: node gen-levels.mjs */';
const END = '  /* EXTRAS:END */';

const NAMES = ['HILLTOP', 'BROOK', 'ORCHARD', 'RUINS', 'CANYON', 'EMBER', 'FROST', 'HOLLOW',
  'MINE', 'TEMPLE', 'SPRING', 'SUMMIT', 'GLADE', 'VAULT', 'CLIFF', 'MIRE', 'PEAK',
  'SHRINE', 'TUNNEL', 'PINNACLE', 'SHROOMSKY'];
const THEMES = ['meadow', 'dusk', 'night'];
const H = 13, GY = 11;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 某站面末端满跳的落点是否都有实地（RUN 与 SPRINT 两种落点都要安全）。 */
/** 某站面末端满跳的落点是否都安全（RUN 与 SPRINT 两种落点都要有实地、且不落在尖刺上）。 */
function endLandsOK(def, grid, row, endCol) {
  const at = (x, y) => (y < 0 || y >= def.h || x < 0 || x >= def.w) ? '.' : grid[y][x];
  for (const speed of [1.65, 2.1]) {
    const landX = landXFrom(row, endCol, speed);
    const c0 = Math.floor(landX / T), c1 = Math.floor((landX + 9) / T);
    if (!SOLID.has(at(c0, def.groundY)) && !SOLID.has(at(c1, def.groundY))) return false;
    // 落点不能是尖刺：从平台末端跳下去正踩尖刺等于送死
    for (const c of [c0, c1]) if (at(c, def.groundY - 1) === '^') return false;
  }
  return true;
}

/** 区域 rows 内无实体/平台。 */
function areaClear(def, grid, x0, x1, r0, r1) {
  const at = (x, y) => (y < 0 || y >= def.h || x < 0 || x >= def.w) ? '.' : grid[y][x];
  for (let x = x0; x <= x1; x++) for (let r = r0; r <= r1; r++) {
    const ch = at(x, r);
    if (SOLID.has(ch) || ch === '=') return false;
  }
  return true;
}

/** 区域 rows 内是否有实体砖块（单向平台不算，与校验器同口径）。 */
function noSolid(def, grid, x0, x1, r0, r1) {
  const at = (x, y) => (y < 0 || y >= def.h || x < 0 || x >= def.w) ? '.' : grid[y][x];
  for (let x = x0; x <= x1; x++) for (let r = r0; r <= r1; r++) if (SOLID.has(at(x, r))) return false;
  return true;
}

function makeLevel(idx, attempt) {
  const rng = mulberry32(0x9E3779B9 ^ ((idx + 1) * 7919) ^ (attempt * 104729));
  const diff = idx / (NAMES.length - 1);
  const rnd = (n) => Math.floor(rng() * n);
  const pick = (arr) => arr[rnd(arr.length)];

  const segCount = 9 + Math.round(diff * 5);
  const segs = [];
  const spinGaps = [];                          // 需要旋转跳才能过的深坑（在通往终点的主路上）
  // 第 24 关（SHROOMSKY）特殊：脚下是「一整块连续陆地，没有坑」，天上铺满紫色蘑菇，靠疾跑冲过去
  const isL24Level = idx === NAMES.length - 1;
  if (isL24Level) {
    // 一整块陆地：只有一个段，从 0 到约 150 格（够长才能体现"疾跑冲过去"）
    const w24 = 150;
    segs.push([0, w24 - 1]);
    const def24 = { name: NAMES[idx], theme: THEMES[idx % 3], w: w24, h: H, groundY: GY, life: 3, segs, ops: [] };
    const g24 = buildGrid(def24);
    // 整屏密密麻麻全是「紫色蘑菇」：它们挂在天上，玩家走到下面就会预警抖动后俯冲偷袭。
    // 用 fall（紫色蘑菇偷袭），不是飞鸟 f。
    for (let cx = 4; cx < w24 - 4; cx += 1 + rnd(2)) {
      const fy = 2 + rnd(5);                    // 挂在行 2~6（天上）
      if (g24[fy][cx] !== '.') continue;
      // 第 4 个参数 = 触发列（玩家走到这里它就掉下来）；提前 2 格触发，给玩家反应距离
      def24.ops.push(['fall', cx, fy, Math.max(2, cx - 2)]);
    }
    // 起点与终点（一整块平地上，终点在最后）
    def24.ops.push(['start', 2, 10]);
    def24.ops.push(['cp', Math.floor(w24 * 0.4), 10]);
    def24.ops.push(['goal', w24 - 6, 10]);
    // 平地上撒一些金币，指示"往右冲"
    for (let cx = 6; cx < w24 - 8; cx += 4) def24.ops.push(['c', cx, 9, 2]);
    return { def: def24, warn: [] };
  }
  // 先定「虚空踩板段」放在哪：它后面那个坑会收窄（从板上跳下来没有助跑距离）
  const voidSegIdx = (() => {
    for (let i = 3; i <= segCount - 3; i++) if (rng() < 0.35) return i;
    return -1;
  })();
  let x = 0;
  for (let i = 0; i < segCount; i++) {
    let len = 5 + rnd(4);                       // 5..8：站脚地更窄、助跑更短
    if (i === 0) len = Math.max(len, 6);
    if (i === segCount - 1) len = Math.max(len, 8);
    if (i === voidSegIdx) len = Math.max(len, 8);   // 虚空段要放得下三块板
    segs.push([x, x + len - 1]);
    // 坑宽上限锁死 6 格：实测跑速普通满跳能过 6 格、疾跑能过 7 格，
    // 7 格以上在手机（不能疾跑）就只能靠旋转跳，时机没抓准就掉坑 → 玩家会觉得"跳不过去"。
    // 所以主路径一律 ≤6 格，旋转跳只作为更快/更稳的补充手段，不作为通过门槛。
    const afterVoid = i === voidSegIdx;         // 虚空段后面：收窄，落地才有余地
    const gapW = afterVoid ? 3
      : diff < 0.25 ? (rng() < 0.7 ? 3 : 4)
      : diff < 0.6 ? (rng() < 0.4 ? 3 : (rng() < 0.75 ? 4 : 5))
      : (rng() < 0.35 ? 4 : 5);          // 最难也只到 5 格：跑速满跳 6 格，留 1 格容错
    x = x + len + gapW;
  }
  const w = segs[segCount - 1][1] + 1;
  const def = { name: NAMES[idx], theme: THEMES[idx % 3], w, h: H, groundY: GY, life: 3, segs, ops: [] };
  const grid = buildGrid(def);                  // 随内容追加一起维护
  const at = (x, y) => (y < 0 || y >= H || x < 0 || x >= w) ? '.' : grid[y][x];
  const mark = (x, y, ch) => { if (x >= 0 && x < w && y >= 0 && y < H) grid[y][x] = ch; };
  const ops = def.ops;
  const used = new Set();                       // 已占用列的粗查（行10）
  const warn = [];

  ops.push(['start', 1, 10]);
  const lastSeg = segs[segCount - 1];
  const goalCol = lastSeg[1] - 3;
  ops.push(['goal', goalCol, 10]);

  // 选 0-2 个坑放移动平台（避开前两坑和最后一坑）
  const gapStarts = segs.slice(0, -1).map(s => s[1] + 1);
  const moverCount = diff > 0.55 ? 2 : (diff > 0.25 ? 1 : (rng() < 0.4 ? 1 : 0));
  const candGaps = gapStarts.map((g, i) => i).filter(i => i >= 2 && i < gapStarts.length - 1);
  for (let i = candGaps.length - 1; i > 0; i--) { const j = rnd(i + 1); [candGaps[i], candGaps[j]] = [candGaps[j], candGaps[i]]; }
  const moverGaps = new Set();
  for (const gi of candGaps.slice(0, moverCount)) {
    // 只有「从移动平台末端满跳能落到实地」的坑才放移动平台（与校验器同一条规则）
    const endCol = gapStarts[gi] - 1 + 1 + 2;
    if (endLandsOK(def, grid, 9, endCol)) moverGaps.add(gi);
  }
  for (const gi of moverGaps) ops.push(['m', gapStarts[gi] - 1, 9, 1]);   // 右端停在坑末，避免深入下段后起跳落坑

  let skyBridge = false;

  // —— 虚空踩板：把某一段整段挖空（下面是虚空，掉下去就死），
  //    在空出来的位置架三块层层升高的板子，踩着板子一路「旋转跳」上到天上。
  let voidTrial = false;
  {
    // 用前面预留好的段（宽 8 格，正好放三块板）；三块板各隔 2 格、每块高 3 格
    const vi = voidSegIdx;
    if (vi >= 0) {
      const [va, vb] = segs[vi];
      const pads = [];
      for (let k = 0; k < 3; k++) {
        const pc = va + 1 + k * 2;
        const pr = (k === 0 ? GY - 1 : (GY - 1) - k * 2);   // 第一块与地面同高（好落上去），之后每块高 2 格
        if (pc + 1 > vb || pr < 3) break;
        pads.push([pc, pr]);
      }
      if (pads.length === 3) {
        ops.push(['void', va, vb]);                // 游戏与校验器都据此把这一段挖空
        for (let x = va; x <= vb; x++) for (let r = 0; r < H; r++) grid[r][x] = '.';
        const drop = new Set(['p', 'q', 'b', 'c', 'e', 'sp', 'd', 'h', 'sl']);
        for (let i = ops.length - 1; i >= 0; i--) {
          const o = ops[i];
          if (drop.has(o[0]) && o[1] >= va && o[1] <= vb) ops.splice(i, 1);
        }
        for (const [pc, pr] of pads) {
          for (let i = 0; i < 2; i++) { grid[pr][pc + i] = '='; ops.push(['p', pc + i, pr, 1, 'v']); }
          ops.push(['c', pc + 1, pr - 1, 1]);      // 板上给一枚金币当落点提示
        }
        voidTrial = true;
      }
    }
  }
  // —— 高空长桥：一条很长的高空平台（行 4~5），上面站着一只巡逻的蘑菇怪。
  //    玩家要先跳上高台，再追着踩「天上的怪」。桥要长到怪能来回走，两头必须留够落脚点。
  const skySeg = segs.findIndex((s, i) => i >= 2 && i <= segCount - 3 && s[1] - s[0] + 1 >= 7);
  if (skySeg >= 0) {
    const [sa, sb] = segs[skySeg];
    const blen = Math.max(6, Math.min(9, sb - sa - 1));   // 桥长 6~9 格（长到怪能来回走）
    const bx = sa + 1 + rnd(Math.max(1, sb - sa - blen));
    const brow = 4 + rnd(2);                          // 行 4 或 5（够高，踩的是「天上的怪」）
    let ok = bx >= 1 && bx + blen <= def.w - 2;
    for (let i = 0; i < blen && ok; i++) {
      for (let r = brow - 1; r <= brow; r++) if (grid[r][bx + i] !== '.') { ok = false; break; }
    }
    if (ok) {
      for (let i = 0; i < blen; i++) { grid[brow][bx + i] = '='; ops.push(['p', bx + i, brow, 1]); }
      // 桥两头各挂一枚金币，提示这条路值得走
      ops.push(['c', bx + 1, brow - 1, 2]);
      ops.push(['c', bx + blen - 3, brow - 1, 2]);
      // 桥上放一只怪：patrol 范围就是整条桥（key: 'se' = 空中的巡逻怪）
      const ec = bx + 1 + rnd(Math.max(1, blen - 3));
      ops.push(['se', ec, brow - 1, bx, bx + blen - 1]);   // 巡逻 = 整条桥
      skyBridge = true;
    }
  }

  let walkers = 0, brickGroups = 0, spikeCount = 0;

  for (let si = 0; si < segCount; si++) {
    const [a, b] = segs[si];
    const L = si === 0 ? 4 : a + 1;
    const R = si === segCount - 1 ? b - 6 : b - 1;    // 末段给旗杆留 6 格
    if (R - L < 1) continue;
    const wide = b - a + 1 >= 9;
    const free = (x0, x1, r0, r1) => areaClear(def, grid, x0, x1, r0, r1);
    const pickCol = (lo, hi, len) => {                 // 试 len 格的起始列
      if (hi < lo) return -1;
      return lo + rnd(hi - lo + 1);
    };

    // —— 高山坡：逐格垒砖成阶梯，一格比一格高（往右一跳一跳爬上去）
    //    最高一列紧贴段末，爬上去就是断口，必须从高处跳出去
    if (rng() < 0.6 && b - a + 1 >= 8) {
      const peak = Math.min(3 + rnd(2), b - a + 1 - 5);   // 3~4 格高
      const hx = b - 2 - peak;                            // 段末留 2 格平地：别让高墙紧贴坑
      let ok = hx > a;
      for (let i = 0; i < peak && ok; i++) {
        const col = hx + i;
        for (let r = GY - 1 - i; r <= GY - 1; r++) if (grid[r][col] !== '.') { ok = false; break; }
      }
      if (ok) for (let i = 0; i < peak; i++) {
        const col = hx + i;
        for (let r = GY - 1 - i; r <= GY - 1; r++) { grid[r][col] = '#'; ops.push(['h', col, r]); }
      }
    }

    // —— 斜坡：段尾做成上坡（爬到坡顶路就断了，必须从坡顶跳出去）
    if (diff > 0.15 && rng() < 0.45 && b - a + 1 >= 8) {
      const climb = Math.min(4, Math.max(2, Math.floor((b - a + 1) / 3)));
      let ok = true;
      for (let k = 0; k < climb; k++) {
        const cx = b - k;
        if (grid[GY - 1][cx] !== '.' || grid[GY][cx] !== '#') { ok = false; break; }
      }
      if (ok) for (let k = 0; k < climb; k++) { const cx = b - k; grid[GY - 1][cx] = '/'; ops.push(['sl', cx, GY - 1, 1]); }
    }
    // —— 下坡断层：一段下坡 → 中间一道坑 → 再接一段下坡。
    //    顺着坡度冲下去时看不清前面的坑，是「下坡路上突然断了」的地形。
    if (diff > 0.35 && rng() < 0.45 && b - a + 1 >= 8) {
      const run = 3;                              // 两边各 3 格坡
      const pa = a + run, pb = pa + 1;            // 中间 2 格挖成坑
      let ok = pb + run - 1 <= b;
      for (let k = 0; k < run * 2 + 2 && ok; k++) {
        const cx = a + k;
        if (grid[GY - 1][cx] !== '.' || grid[GY][cx] !== '#') { ok = false; break; }
      }
      if (ok) {
        for (let k = 0; k < run; k++) { const cx = a + k; grid[GY - 1][cx] = '\\'; ops.push(['sl', cx, GY - 1, -1]); }
        // 下坡中间的坑：只挖地面，不发 void op（void 是「整段虚空」，语义不同）
        const pit = [];
        for (let cx = pa; cx <= pb; cx++) { grid[GY][cx] = '.'; grid[GY + 1][cx] = '.'; pit.push(cx); }
        ops.push(['dpit', pa, pb]);
        for (let k = 0; k < run; k++) { const cx = pb + 1 + k; grid[GY - 1][cx] = '\\'; ops.push(['sl', cx, GY - 1, -1]); }
      }
    }

    // —— 下坡跳：段首做成下坡，落上去后借坡度冲出去
    if (diff > 0.3 && rng() < 0.4 && b - a + 1 >= 7) {
      const drop = Math.min(3, Math.max(2, Math.floor((b - a + 1) / 4)));
      let ok = true;
      for (let k = 0; k < drop; k++) {
        const cx = a + k;
        if (grid[GY - 1][cx] !== '.' || grid[GY][cx] !== '#') { ok = false; break; }
      }
      if (ok) for (let k = 0; k < drop; k++) { const cx = a + k; grid[GY - 1][cx] = '\\'; ops.push(['sl', cx, GY - 1, -1]); }
    }

    // —— 平台：高度分层（6/7/8 行），低台好跳、高台要踩点；末端落点必须安全
    if (rng() < 0.55) {
      const prow = [8, 8, 7, 6][rnd(4)];
      const plen = 2 + rnd(2);
      for (let t = 0; t < 6; t++) {
        const px = pickCol(L, R - plen + 1, plen);
        if (px < 0) break;
        const end = px + plen - 1;
        if (free(px, end, prow - 3, prow - 1) && free(px - 1, end + 1, prow - 3, prow - 1) &&
            endLandsOK(def, grid, prow, end)) {
          ops.push(['p', px, prow, plen]); for (let i = 0; i < plen; i++) mark(px + i, prow, '=');
          if (rng() < 0.7) { ops.push(['c', px, prow - 1, plen]); }
          break;
        }
      }
    }
    // —— 行7 砖块/问号组（末端落点安全 + 不压平台）
    if (brickGroups < 3 && rng() < 0.45) {
      const blen = 2 + rnd(2);
      for (let t = 0; t < 6; t++) {
        const bx = pickCol(L, R - blen + 1, blen);
        if (bx < 0) break;
        const end = bx + blen - 1;
        if (free(bx - 1, end + 1, 5, 8) && endLandsOK(def, grid, 7, end)) {
          for (let i = 0; i < blen; i++) {
            const ch = (i % 2 === 0) ? '?' : 'B';
            ops.push([ch === '?' ? 'q' : 'b', bx + i, 7]); mark(bx + i, 7, ch);
          }
          ops.push(['c', bx, 6, blen]);
          brickGroups++;
          break;
        }
      }
    }
    // —— 地面敌人：出生 [a+3, b-5]，头顶与附近无实体/平台/尖刺
    const maxE = Math.min(b - 6, R);   // 离段末留 6 格：怪不靠近坑边，处理完怪还有助跑距离
    if (walkers < 4 + Math.round(diff * 6) && maxE >= Math.max(a + 5, L) && rng() < 0.8 + 0.2 * diff) {
      for (let t = 0; t < 8; t++) {
        const e = pickCol(Math.max(a + 5, L), maxE, 1);
        if (e < 0) break;
        // 离尖刺至少 3 格：不然玩家要同时处理怪和刺，实际过不去
        if (!ops.some(o => o[0] === 'sp' && Math.abs(o[1] - e) <= 4) &&
            noSolid(e - 4, e + 4, 5, 10) && free(e - 3, e + 3, 6, 10) &&
            at(e, 10) === '.' && at(e, 11) === '#') {
          ops.push(['e', e, 10]); mark(e, 10, 'e'); walkers++;
          break;
        }
      }
    }
    // —— 尖刺：只有超宽段（落点区之后才有位置）
    if (b - a + 1 >= 9 && spikeCount < 10 && rng() < 0.8 + 0.2 * diff) {
      for (let t = 0; t < 8; t++) {
        const sa = pickCol(a + 5, b - 3, 1);
        if (sa < 0) break;
        // 尖刺不能落在任何平台末端跳的落点上（平台先生成，那时还看不到尖刺）
        const onPlatLanding = ops.filter(o => o[0] === 'p').some(o => {
          const end = o[1] + o[3] - 1;
          return [1.65, 2.1].some(sp => {
            const lx = landXFrom(o[2], end, sp);
            const c0 = Math.floor(lx / T), c1 = Math.floor((lx + 9) / T);
            return (c0 === sa || c1 === sa || c0 === sa + 1 || c1 === sa + 1);
          });
        });
        if (!onPlatLanding &&
            !ops.some(o => o[0] === 'e' && Math.abs(o[1] - sa) <= 4) &&
            free(sa - 2, sa + 3, 7, 9) && at(sa, 10) === '.' && at(sa + 1, 10) === '.') {
          ops.push(['sp', sa, 10, 2]); mark(sa, 10, '^'); mark(sa + 1, 10, '^');
          spikeCount++;
          break;
        }
      }
    }
    // —— 行5 高台（建在该段行8平台上方，末端落点安全）
    if (rng() < 0.3) {
      const plat = def.ops.find(o => o[0] === 'p' && o[2] >= 6 && o[2] <= 8 && o[1] >= a && o[1] <= b);
      if (plat) {
        const hlen = 3 + rnd(2);
        for (let t = 0; t < 6; t++) {
          const hx = pickCol(plat[1] - 1, plat[1] + plat[3] - hlen, hlen);
          if (hx < 0 || hx < L || hx + hlen - 1 > b - 1) continue;
          const end = hx + hlen - 1;
          if (free(hx, end, 2, 4) && endLandsOK(def, grid, 5, end)) {
            ops.push(['p', hx, 5, hlen]); for (let i = 0; i < hlen; i++) mark(hx + i, 5, '=');
            if (rng() < 0.85) { ops.push(['c', hx, 4, hlen]); }
            break;
          }
        }
      }
    }
    // —— 装饰
    if (rng() < 0.5) {
      const d = pickCol(Math.max(a, L), Math.min(b, R), 1);
      if (d >= 0 && at(d, 10) === '.') { ops.push(['d', d, 10]); mark(d, 10, 'd'); used.add(d); }
    }
    void wide;
  }

  // —— 危险配额补足：低难度关太"空旷"，按难度保证尖刺/敌人的数量下限
  const rndCol = (lo, hi) => hi < lo ? -1 : lo + rnd(hi - lo + 1);
  const zoneFree = (x0, x1, r0, r1) => areaClear(def, grid, x0, x1, r0, r1);
  const spikeBudget = 3 + Math.round(diff * 4);      // 3~7 处尖刺
  const walkerBudget = 3 + Math.round(diff * 4);     // 3~7 只地面怪
  for (let pass = 0; pass < 2; pass++) {
    for (let si = 1; si < segCount - 1; si++) {
      const [a, b] = segs[si];
      const len = b - a + 1;
      const L = a + 1, R = b - 1;
      if (spikeCount < spikeBudget && len >= 9 && rng() < 0.8) {
        for (let t = 0; t < 6; t++) {
          const sa = rndCol(a + 5, b - 3);
          if (sa < 0) break;
          const onPlatLanding = ops.filter(o => o[0] === 'p').some(o => {
            const end = o[1] + o[3] - 1;
            return [1.65, 2.1].some(sp => {
              const lx = landXFrom(o[2], end, sp);
              const c0 = Math.floor(lx / T), c1 = Math.floor((lx + 9) / T);
              return (c0 === sa || c1 === sa || c0 === sa + 1 || c1 === sa + 1);
            });
          });
          if (!onPlatLanding &&
              !ops.some(o => o[0] === 'e' && Math.abs(o[1] - sa) <= 4) &&
              !ops.some(o => o[0] === 'sp' && Math.abs(o[1] - sa) <= 3) &&
              zoneFree(sa - 2, sa + 3, 7, 9) && at(sa, 10) === '.' && at(sa + 1, 10) === '.') {
            ops.push(['sp', sa, 10, 2]); mark(sa, 10, '^'); mark(sa + 1, 10, '^');
            spikeCount++;
            break;
          }
        }
      }
      if (walkers < walkerBudget && len >= 9 && rng() < 0.7) {
        const maxE = Math.min(b - 6, R);
        for (let t = 0; t < 6; t++) {
          const e = rndCol(Math.max(a + 5, L), maxE);
          if (e < 0) break;
          if (!ops.some(o => o[0] === 'sp' && Math.abs(o[1] - e) <= 4) &&
              !ops.some(o => o[0] === 'e' && Math.abs(o[1] - e) <= 2) &&
              noSolid(e - 4, e + 4, 5, 10) && zoneFree(e - 3, e + 3, 6, 10) &&
              at(e, 10) === '.' && at(e, 11) === '#') {
            ops.push(['e', e, 10]); mark(e, 10, 'e'); walkers++;
            break;
          }
        }
      }
    }
  }

  // —— 坑上方金币 / 飞行敌人（跨坑弧线，规则不涉及实体网格）
  gapStarts.forEach((g, gi) => {
    if (moverGaps.has(gi)) return;
    if (rng() < 0.55) ops.push(['c', g, 9, 3]);
    if (rng() < 0.3) ops.push(['f', g + 1, 3 + rnd(2)]);
  });

  // —— 天空偷袭怪：挂在高处，玩家走到它下面才俯冲下来（对应「尖刺天空偷袭」）
  {
    const n = 1;
    for (let i = 0; i < n; i++) {
      const si = 1 + rnd(Math.max(1, segCount - 3));
      const [sa, sb] = segs[si];
      if (sb - sa < 5) continue;
      const fx = sa + 2 + rnd(Math.max(1, sb - sa - 4));
      const fy = 2 + rnd(2);                      // 挂在 2~3 行（很高）
      if (at(fx, fy) !== '.') continue;
      let clearCol = true;
      for (let r = fy + 1; r < GY; r++) if (grid[r][fx] !== '.') { clearCol = false; break; }
      if (!clearCol) continue;                    // 下方有平台就不放：否则会砸在玩家必经的路上
      ops.push(['fall', fx, fy, Math.max(sa + 1, fx - 2)]);   // 提前 2 格触发：玩家有反应距离
    }
  }

  // —— 移动地雷：看得见的圆盘雷，在段内来回巡逻，碰到就炸
  for (let i = 0; i < 1 + rnd(2); i++) {
    const si = 2 + rnd(Math.max(1, segCount - 4));
    const [sa, sb] = segs[si];
    if (sb - sa < 6) continue;
    let mx = -1;
    for (let c = sa + 2; c <= sb - 3; c++) {
      if (grid[GY - 1][c] === '.' && grid[GY][c] === '#' &&
          grid[GY - 1][c + 1] === '.' && grid[GY][c + 1] === '#') { mx = c; break; }
    }
    if (mx < 0) continue;
    if (ops.some(o => o[0] === 'void' && mx >= o[1] && mx <= o[2])) continue;
    // 优先用段后半部分：段首留给跨坑落点，中段留给埋伏雷
    let pick = -1;
    for (let c = sb - 3; c >= sa + 4; c--) {
      if (grid[GY - 1][c] === '.' && grid[GY][c] === '#' &&
          grid[GY - 1][c + 1] === '.' && grid[GY][c + 1] === '#') { pick = c; break; }
    }
    if (pick < 0) pick = mx;
    if (ops.some(o => (o[0] === 'mine' || o[0] === 'walkmine') && Math.abs(o[1] - pick) <= 4)) continue;
    ops.push(['walkmine', pick, GY - 2, pick, pick + 2]);
  }

  // —— 埋伏地雷：埋在地下几乎看不见，踩上去就炸（比地刺更阴）
  for (let i = 0; i < 1; i++) {
    // 一次随机段常常没空地：把中间几段都试一遍，找到一个就放
    let px = -1;
    const order = [];
    for (let k = 3; k <= segCount - 3; k++) order.push(k);
    for (let k = order.length - 1; k > 0; k--) { const j = rnd(k + 1); [order[k], order[j]] = [order[j], order[k]]; }
    for (const si of order) {
      const [sa, sb] = segs[si];
      if (sb - sa < 6) continue;
      for (let c = sa + 3; c <= sb - 2; c++) {
        if (grid[GY - 1][c] === '.' && grid[GY][c] === '#' &&
            grid[GY - 1][c + 1] === '.' && grid[GY][c + 1] === '#') { px = c; break; }
      }
      if (px >= 0) break;
    }
    if (px < 0) continue;
    if (ops.some(o => o[0] === 'void' && px >= o[1] && px <= o[2])) continue;
    if (ops.some(o => (o[0] === 'mine' || o[0] === 'walkmine' || o[0] === 'spikeup') && Math.abs(o[1] - px) <= 4)) continue;
    ops.push(['mine', px, GY - 2]);
  }

  // —— 地刺埋伏：平时缩在地下，玩家走到跟前才「唰」地弹出。
  //    放在段中部（离段首 ≥3 格，避开跨坑落点），地面必须平整。
  for (let i = 0; i < 1; i++) {
    const si = 3 + rnd(Math.max(1, segCount - 5));
    const [sa, sb] = segs[si];
    if (sb - sa < 7) continue;
    let bx = -1;
    for (let c = sa + 3; c <= sb - 2; c++) {
      if (grid[GY - 1][c] === '.' && grid[GY][c] === '#' &&
          grid[GY - 1][c + 1] === '.' && grid[GY][c + 1] === '#') { bx = c; break; }
    }
    if (bx < 0) continue;
    if (ops.some(o => o[0] === 'void' && bx >= o[1] && bx <= o[2])) continue;
    if (ops.some(o => o[0] === 'spikeup' && Math.abs(o[1] - bx) <= 4)) continue;
    if (ops.some(o => o[0] === 'sp' && Math.abs(o[1] - bx) <= 3)) continue;
    ops.push(['spikeup', bx, GY - 1]);
  }

  // —— 踩鸟跳机会：宽坑正上方放一只低飞的鸟，踩它弹起就能飞过更宽的坑
  gapStarts.forEach((g, gi) => {
    const nextG = gi + 1 < gapStarts.length ? gapStarts[gi + 1] : w;
    const gap = Math.max(0, nextG - 3 - g);
    if (gap >= 4 && rng() < 0.5) ops.push(['f', g + Math.max(1, Math.floor(gap / 2)), 5 + rnd(2)]);
  });

  // —— 横扫尖刺：贴地一条来回移动的刺，逼玩家卡时间过（难度够才出现）
  //    位置必须离段首足够远：段首是上一道坑的落点，刚落地的玩家还没站稳就被扫到 = 不讲理。
  if (diff > 0.4) {
    for (let i = 0; i < 1 + rnd(2); i++) {
      const si = 3 + rnd(Math.max(1, segCount - 5));
      const [sa, sb] = segs[si];
      if (sb - sa < 7) continue;                  // 段太短放不下
      const sw = 12;                             // 刺条短一点，窄位置也放得下
      // 在段内找一个「整段都空」的位置（山坡/斜坡/尖刺都会占掉行 10，不能写死偏移）
      const sw2 = 1 + rnd(2);
      let sx0 = -1;
      for (let c = sa + 3; c + sw2 <= sb - 1; c++) {
        let free = true;
        for (let d = 0; d <= sw2; d++) if (grid[GY - 1][c + d] !== '.' || grid[GY][c + d] !== '#') { free = false; break; }
        if (free) { sx0 = c; break; }
      }
      if (sx0 < 0) continue;
      if (ops.some(o => o[0] === 'sp' && Math.abs(o[1] - sx0) <= 3)) continue;
      if (ops.some(o => o[0] === 'void' && sx0 <= o[2] && sx0 + sw2 >= o[1])) continue;   // 扫刺范围压在虚空段上才跳过
      ops.push(['spm', sx0, GY - 1, sx0, sx0 + sw2, sw]);
    }
  }

  // —— 复活点：中段、空列、前后 2 格安全
  let cpCol = -1;
  const mid0 = Math.floor(w * 0.35), mid1 = Math.floor(w * 0.75);
  const cands = [];
  for (let cx = mid0; cx <= mid1; cx++) {
    if (at(cx, 10) !== '.' || at(cx, 11) !== '#') continue;
    if ([...used].some(u => Math.abs(u - cx) <= 1)) continue;
    if (def.ops.some(o => o[0] === 'e' && Math.abs(o[1] - cx) <= 2)) continue;
    if (def.ops.some(o => o[0] === 'sp' && Math.abs(o[1] - cx) <= 1)) continue;
    let ok = true;
    for (let d = -2; d <= 2; d++) {
      const r = at(cx + d, 10);
      if (r !== '.' && r !== 'd') { ok = false; break; }
      if (!SOLID.has(at(cx + d, 11))) { ok = false; break; }
    }
    if (ok) cands.push(cx);
  }
  if (cands.length) {
    const target = Math.floor(w * 0.5);
    cpCol = cands.reduce((best, c) => Math.abs(c - target) < Math.abs(best - target) ? c : best, cands[0]);
    ops.push(['cp', cpCol, 10]);
  }
  warn.push(`cp=${cpCol}`);
  return { def, warn };
}

function emit(def) {
  const segs = def.segs.map(s => `[${s[0]}, ${s[1]}]`).join(', ');
  const lines = [`  {`,
    `    name: '${def.name}', theme: '${def.theme}', w: ${def.w}, h: ${def.h}, groundY: ${def.groundY}, life: 3,`,
    `    segs: [${segs}],`,
    `    ops: [`];
  // ops 分组输出，每行约 5 个
  const rows = [];
  let cur = [];
  for (const op of def.ops) {
    cur.push('[' + op.map(v => typeof v === 'string' ? `'${v}'` : v).join(', ') + ']');
    if (cur.length >= 5) { rows.push('      ' + cur.join(', ') + ','); cur = []; }
  }
  if (cur.length) rows.push('      ' + cur.join(', ') + ',');
  lines.push(...rows, `    ],`, `  },`);
  return lines.join('\n');
}

const results = [];
let out = [];
for (let idx = 0; idx < NAMES.length; idx++) {
  let done = null;
  for (let attempt = 0; attempt < 10 && !done; attempt++) {
    const { def, warn } = makeLevel(idx, attempt);
    const problems = checkLevel(def);
    if (problems.length === 0) done = { def, attempt, warn };
    else if (attempt === 9) results.push(`${NAMES[idx]} 放弃: ${problems.slice(0, 3).join('；')}`);
  }
  if (!done) continue;
  out.push(emit(done.def));
  results.push(`${NAMES[idx]} (w=${done.def.w}) OK 第${done.def.segs.length}段 seed${done.def.ops.length}ops`);
}

const html = readFileSync(FILE, 'utf8');
const block = `${BEGIN}\n${out.join('\n')}\n${END}`;
let next;
if (html.includes(BEGIN) && html.includes(END)) {
  const i0 = html.indexOf(BEGIN), i1 = html.indexOf(END) + END.length;
  next = html.slice(0, i0) + block + html.slice(i1);
} else {
  // 首次插入：放在 LEVELS 数组收尾 `];` 之前
  const anchor = html.lastIndexOf('\n];');
  if (anchor < 0) throw new Error('LEVELS 数组结尾未找到');
  next = html.slice(0, anchor) + '\n' + block + html.slice(anchor);
}
writeFileSync(FILE, next);
console.log(results.join('\n'));
console.log(`\n写入 ${out.length / 1} 关`);