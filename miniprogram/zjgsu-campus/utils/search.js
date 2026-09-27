// utils/search.js —— 全站共用的「精准 / 模糊」搜索内核
//
// 为什么单独抽一个文件：以前只有课程列表页有一套匹配逻辑，
// 论坛、闲置、找同学、选课程全都各写各的 —— 基本都是「indexOf 命中就算」，
// 同学打错一个字就什么都搜不到，还以为小程序坏了。
// 现在收敛到这一处，改一处全站生效。
//
// 模糊不是随便放宽，而是有章法的四级降级：
//   ① 完全一致      「高等数学」→ 高等数学
//   ② 包含          「高等数」  → 高等数学
//   ③ 打错字 / 乱序  「高等数雪」「数学高等」 → 高等数学
// 数字越小越准，排序时越靠前，结果就不会「一开模糊就彻底乱掉」。
const MATCH_RANK = { exact: 0, contain: 1, chars: 2, near: 3, order: 4 };

// 只认「相差 1 个字」：差 2 个字基本就是两回事了，硬认等于把不相干的也捞进来
const MAX_EDIT = 1;

// 经典编辑距离（增删换各算 1）。只算够用的一张表，不做整表重算
function editDistance(a, b) {
  const s = String(a || ''), t = String(b || '');
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  if (s === t) return 0;
  let prev = [];
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= t.length; j += 1) {
      cur[j] = Math.min(
        prev[j] + 1,                  // 删
        cur[j - 1] + 1,               // 增
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1)  // 换
      );
    }
    prev = cur;
  }
  return prev[t.length];
}

// 对一组文本打分：返回最准的那一项的等级，一个都不中返回 -1。
// fields[0] 是「主字段」（课程名、帖子标题……）——只有它值得放宽，
// 其余字段放宽会把整个学院、整个板块都捞出来，等于没搜。
function matchFields(fields, kw) {
  const arr = (fields || []).map((f) => String(f || ''));
  const list = arr.filter((f) => f.length);
  if (!list.length || !kw) return -1;
  const main = list[0];

  let best = -1;
  const better = (lv) => { if (lv >= 0 && (best < 0 || lv < best)) best = lv; };

  if (main === kw) return MATCH_RANK.exact;
  list.forEach((f) => { if (f.indexOf(kw) >= 0) better(MATCH_RANK.contain); });
  if (best === MATCH_RANK.contain) return best;

  const k = kw.length;
  const n = main.length;
  if (k >= 2) {
    let hit = 0;
    for (let i = 0; i < k; i += 1) if (main.indexOf(kw[i]) >= 0) hit += 1;
    // 短词（≤3 字）要求至少 2 个字对上，长词按 7 成才认 —— 太松会什么都能搜到
    const need = k <= 3 ? 2 : Math.ceil(k * 0.7);
    if (hit >= need && k >= Math.min(2, n)) better(MATCH_RANK.chars);
    if (hit === k) better(MATCH_RANK.order);
  }
  if (k >= 3 && Math.abs(n - k) <= 2 && editDistance(main, kw) <= MAX_EDIT) better(MATCH_RANK.near);
  return best;
}

// 课程对象那一版：name / major / college 任一命中即算搜到
function matchLevel(course, kw) {
  if (!course) return -1;
  return matchFields([course.name, course.major, course.college], kw);
}

// 命中字数：模糊档里用来再排一次序，命中越多的越靠前
function hitCount(text, kw) {
  const t = String(text || '');
  let c = 0;
  for (let i = 0; i < String(kw || '').length; i += 1) if (t.indexOf(kw[i]) >= 0) c += 1;
  return c;
}

// 精准档只留「原样命中」，模糊档把四级降级全放开。
// exact 传 true 时，等级高于 contain 的一律不算
function passLevel(lv, exact) {
  if (lv < 0) return false;
  if (exact && lv > MATCH_RANK.contain) return false;
  return true;
}

// 精准 / 模糊的展示提示词，各页面搜索框上方共用
const MODE_HINT = {
  exact: '只找完全一致的',
  fuzzy: '打错字也能找到'
};

module.exports = {
  MATCH_RANK,
  editDistance,
  matchFields,
  matchLevel,
  hitCount,
  passLevel,
  MODE_HINT
};
