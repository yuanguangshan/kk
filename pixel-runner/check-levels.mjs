// 关卡静态检查：打印每一关的规则问题（规则本体在 rules.mjs）
import { LEVELS } from './harness.mjs';
import { checkLevel } from './rules.mjs';

for (let i = 0; i < LEVELS.length; i++) {
  const problems = checkLevel(LEVELS[i]);
  console.log(`关卡${i + 1} ${LEVELS[i].name} (w=${LEVELS[i].w}) — ${problems.length ? problems.join('；') : 'OK'}`);
}