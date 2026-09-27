// utils/moderation.js —— 内容安全（屏蔽词 + 长度/图片校验）
//
// 说明：这里的前端过滤是「体验层」——给用户即时反馈，省得发完才被删。
// 真正的拦截在服务端（云函数 user / store 写入时），前端绕过不了后端。
// 词表故意做得短，误伤比漏放更烦人；命中后一律提示改词，不自动替换。

const BLOCK_WORDS = [
  '傻逼', '煞笔', '沙比', '智障', '脑残', '废物', '滚蛋', '去死',
  '约炮', '一夜情', '裸聊', '成人', '赌场', '博彩', '私彩',
  '加微信', '加v信', '加微', '私聊出', '刷单', '兼职日结', '贷款',
  '内部消息', '包过', '代考', '作弊器'
];

// 「怎么联系」这一类词，在特定板块要放行。
//
// 社团招新、同好群、组队、找东西，核心内容就是「加群」「加微信」——
// 而「加微信」正在上面的屏蔽词表里，照原样这类帖子一条都发不出去。
// 可它恰恰是校园社区冷启动最值钱的内容：社团自带一群人，
// 让他们把群贴在这儿，比自己去拉活有效得多。
//
// ⚠️ 必须和云函数 user/index.js 的 JOIN_WORDS_EXEMPT 保持一致，
// 否则会出现「前端放行了、云端又拦回来」这种最难查的错
const JOIN_WORDS_EXEMPT = ['加微信', '加v信', '加微'];

// 允许留联系方式的板块，和云函数的 CONTACT_OK_BOARDS 一一对应
const CONTACT_OK_BOARDS = ['社团同好', '活动组队', '失物招领', '树洞'];

// 举报原因（与云函数 reports 集合的 reason 字段对应）
const REPORT_REASONS = ['广告骚扰', '不文明用语', '虚假信息', '涉及隐私', '违规交易', '其他'];

// 高敏原因：这几类危害最直接，凑够人数就能自动处置。
// ⚠️ 但门槛也最高 —— 除了人数，还要有人拿得出可查证的线索（见 reportTip 的说明）。
// 必须和云函数 MOD_RULES.HIGH_RISK 保持一致
const HIGH_RISK_REASONS = ['广告骚扰', '涉及隐私', '违规交易'];

// 举报弹窗里给用户的说明。
// 高敏那几类要多要一句「可查证的线索」：这句提示是必须的 ——
// 系统判不出内容有没有罪，只能判「有没有人给出事实」，
// 不提前说清，认真举报的人会觉得「我明明写了怎么只给下架」
function reportTip(reason) {
  if (HIGH_RISK_REASONS.indexOf(reason) >= 0) {
    return '补充说明（选填，200 字内）。这类举报危害直接、凑够人数就会自动处置，' +
      '所以请尽量写上能查证的东西：链接、联系方式、金额、时间地点。' +
      '写得越具体，核实越快。';
  }
  return '补充说明（选填，200 字内）。写得越具体，核实越快。';
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

// 返回命中的屏蔽词数组，空数组表示通过
function checkBlocked(text) {
  const s = normalize(text);
  if (!s) return [];
  return BLOCK_WORDS.filter((w) => s.indexOf(normalize(w)) >= 0);
}

// 按板块校验：社团同好 / 活动组队这类地方，留群号联系方式是正常内容。
// 放行的只是「怎么联系」，涉黄涉赌、代考刷单一律照旧拦截
function checkBlockedInBoard(board, text) {
  const exempt = CONTACT_OK_BOARDS.indexOf(String(board || '')) >= 0;
  if (!exempt) return checkBlocked(text);
  const s = normalize(text);
  if (!s) return [];
  return BLOCK_WORDS.filter((w) => {
    if (JOIN_WORDS_EXEMPT.indexOf(w) >= 0) return false;
    return s.indexOf(normalize(w)) >= 0;
  });
}

// 给调用方用：不通过直接 toast 并返回 false
// 提示里必须点名是哪个词。只说「含不合适用词」的话，用户会以为是自己没写好、
// 是程序 bug，然后一遍遍重写 —— 把词摆出来，他才能马上改掉继续发。
// board 传了就按板块校验（社团同好里可以留联系方式），不传按全局规则
function guardText(text, label, board) {
  const hit = checkBlockedInBoard(board, text);
  if (hit.length) {
    wx.showToast({
      title: (label || '内容') + '里有「' + hit.slice(0, 2).join('、') + '」，换个说法',
      icon: 'none',
      duration: 2500
    });
    return false;
  }
  return true;
}

// 长文本压缩：把连续空白压成一个换行，避免有人刷屏
function tidy(text, maxLength) {
  let s = String(text || '').replace(/[ \t]{2,}/g, ' ').trim();
  if (maxLength && s.length > maxLength) s = s.slice(0, maxLength);
  return s;
}

module.exports = {
  BLOCK_WORDS,
  JOIN_WORDS_EXEMPT,
  CONTACT_OK_BOARDS,
  REPORT_REASONS,
  HIGH_RISK_REASONS,
  reportTip,
  checkBlocked,
  checkBlockedInBoard,
  guardText,
  tidy
};
