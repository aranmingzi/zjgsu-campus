// 云函数 user —— 用户身份 / 个人资料 / 同学联系方式交换
//
// 设计要点：
//  1) 用户不需要「登录」。微信云开发在云函数里能直接拿到 openid，
//     openid 就是全校唯一的身份证，换手机、卸载重装都不变。
//  2) 联系方式（微信号 / 手机号）属于个人信息，权限过滤必须放在服务端。
//     前端拿得到就等于公开，所以这里统一由云函数返回，前端不做隐藏。
//  3) 只有双向都 accepted 的关系，双方才看得到对方的联系方式。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
// 全站同一套精准 / 模糊搜索内核（云函数也要带一份，不能指望打包时自动跟过去）
const searchCore = require('./search.js');

const COL_USERS = 'users';      // 个人资料
const COL_CONTACTS = 'contacts'; // 交友 / 联系请求
const COL_BLOCKS = 'blocks';    // 拉黑：我拉黑的人，反过来也不能给我发请求
const COL_REPORTS = 'reports';  // 举报：别人内容违规时留下的记录
const COL_POSTS = 'posts';      // 论坛帖子
const COL_REVIEWS = 'reviews';  // 课程评价
const COL_COURSES = 'courses';  // 同学共建课程（官方课程在前端 seed 里，不占云库）
const COL_ADMINS = 'admins';    // 审核员名册：谁点过「把我设为审核员」，谁就在里面
const COL_FAVS = 'favorites';   // 收藏：整个数组存一条文档（_id = openid），量小、无联表
const COL_MARKET = 'market';    // 失物招领 / 二手交易
const COL_CHATS = 'chats';      // 私信会话：一条会话一条文档
const COL_RESOURCES = 'resources'; // 学习资料（笔记 / 真题 / 讲义）元数据，文件本体在云存储
const COL_CALENDAR = 'calendar';   // 校历节点：开学 / 考试周 / 四六级 / 考研
const COL_PLACES = 'places';       // 校园地点：教学楼 / 食堂 / 快递点，带经纬度
const COL_MEMOS = 'memos';         // 备忘录：个人日常记录，读写都带 openid，任何人看不到别人的
const COL_EVENTS = 'events';           // 校园活动：讲座 / 比赛 / 组队 / 社团活动
const COL_EVENT_JOINS = 'event_joins'; // 活动报名：一条报名一条记录（见 eventJoin 处的注释）
const COL_TEACHERS = 'teachers';       // 教师名录：官方导入 + 同学补充，用于评价时的自动补全
const COL_COURSE_REQS = 'course_reqs'; // 删除课程的申请：加课人毕业/失联时，得有别人能收尾的办法
const COL_BOTTLES = 'bottles';         // 校园盲盒 / 漂流瓶：同学匿名扔进去的吐槽、分享、提问
const COL_BOTTLE_LOGS = 'bottle_logs'; // 捞瓶记录：每人每天限捞 3 次，计数以天为窗口存这里
const COL_COURSE_TYPES = 'course_types'; // 课程类型纠错：官网目录不带「课程性质」，猜错的由同学改，全校共享
const COL_CONFIG = 'app_config';   // 运行配置：订阅消息模板 ID 等小程序里就能改的设置
// ⚠️ 集合名不能以下划线开头（tcb/CreateTable 会报 InvalidParameter），所以叫 app_config 不叫 _config

// 订阅消息（一次性）：模板 ID 优先读 app_config 集合（审核员在「审核」页里直接填），
// 没配再退回环境变量 SUBMSG_REPLY / SUBMSG_CHAT。两处都没有就静默跳过，不影响主流程。
//   mp 后台 → 功能 → 订阅消息 → 公共模板库，选「评论回复提醒」「私信提醒」各一个，
//   模板 ID 形如 "AbCdEfGhIjKlMnOpQrStUvWxYz1234567890-abcdefg"
const ENV_SUBMSG = {
  reply: String(process.env.SUBMSG_REPLY || '').trim(),
  chat: String(process.env.SUBMSG_CHAT || '').trim()
};

// app_config 里的模板 ID 有 5 分钟缓存：不用每次发通知都查一遍库，
// 审核员改完配置最迟 5 分钟生效（重新部署云函数可立即生效）
let _cfgCache = { at: 0, value: null };
const CFG_CACHE_MS = 5 * 60 * 1000;

async function getSubMsgIds() {
  if (_cfgCache.value && Date.now() - _cfgCache.at < CFG_CACHE_MS) return _cfgCache.value;
  const res = await db.collection(COL_CONFIG).doc('submsg').get().catch(() => null);
  const d = res && res.data && !Array.isArray(res.data) ? res.data : {};
  const value = {
    reply: String(d.reply || '').trim() || ENV_SUBMSG.reply,
    chat: String(d.chat || '').trim() || ENV_SUBMSG.chat
  };
  _cfgCache = { at: Date.now(), value: value };
  return value;
}

// 下发订阅消息：模板没配 / 用户没授权 / 接口报错，一律不抛，只记日志。
// 通知是锦上添花，绝不能因为它把主流程（评论、私信）弄失败。
async function sendSubMsg(to, kind, payload) {
  if (!to) return false;
  const ids = await getSubMsgIds();
  const tpl = ids[kind];
  if (!tpl) return false;
  if (!cloud.openapi || !cloud.openapi.subscribeMessage) return false;
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: to,
      templateId: tpl,
      page: payload.page || 'pages/forum/list/list',
      data: payload.fields || {},
      miniprogramState: 'formal'
    });
    return true;
  } catch (e) {
    console.error('[submsg] send failed:', String((e && e.errMsg) || e).slice(0, 200));
    return false;
  }
}

// 想固定几个人当审核员，走环境变量：
//   云函数目录 → 配置 → 环境变量 → KEY: MODERATORS，值用英文逗号分隔多个 openid
// 这是上线后固定的做法：不用改代码、不用重新部署，改完等一两分钟就生效
const MODERATORS = String(process.env.MODERATORS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// 审核员名册里记录的就是点过按钮的人。名单留空时，谁能进来由这里决定。
//
// ⚠️ 默认关掉自助登记：审核员能删全校任意帖子 / 评价、置顶、清空校历、删别人的闲置，
// 而 setAdmin 不校验身份，任何同学一次云调用就能把自己登记进去。
// 开放它等于给全校所有人一把管理后台的钥匙。
// 确实需要自助登记（比如自己就是唯一的运营者）时，再改成 true 重新部署一次。
const SELF_ADMIN = false;

// 举报自动处置规则。
// ⚠️ 这份是「服务端权威值」，utils/config.js 的 MODERATION 只用于前端展示文案，
// 两边阈值要一起改，别只改一处。
// 「高敏」到底是拿什么判的 —— 三条依据，全都是客观可查的事实，没有一处靠语义识别：
//
//   ① 举报人选的**原因**落在 HIGH_RISK 里（涉及隐私 / 违规交易 / 广告骚扰）；
//   ② 举报人自己在补充说明里**写下了可证明的东西**（见 PROOF_PATTERN：链接、联系方式、
//      金额、时间地点、当事人、截图约定…）；
//   ③ 内容本身**命中了屏蔽词**（checkText）。
//
// 单靠 ① 就把门槛压到 2 票是危险的：这三类原因偏偏最主观，
// 而广告骚扰故意不设屏蔽词（'加微信' 一类的词会误伤正常咨询），
// 于是「两个人一起选广告骚扰」就能删掉任何一条帖子 —— 成本只有两次点击。
// 所以高敏走两档：**2 票 + 有人给出了证据 / 已存档的老帖 → 直接删；
// 光有口径没证据 → 下架等人工**。真被坑的人补一句说明是顺手的事，恶意举报的人凑不出事实。
const MOD_RULES = {
  HIGH_RISK: ['涉及隐私', '违规交易', '广告骚扰'], // 高敏原因
  CONTENT_THRESHOLD: 3,    // 同一条内容 24h 内累计这么多条举报 → 自动下架
  // 限时多人举报 → 自动删除（不等人工）。
  // 下架只是藏起来，删了才是真清掉；这两档是「少审核」的主力：
  // 5 个人在 24 小时内都说同一条不行，再让人一条条点确认，审核本身就成了摆设。
  // ⚠️ 删除不可逆，所以门槛明显比下架高一档，而且只认 24 小时内的举报。
  AUTO_DELETE_THRESHOLD: 5,   // 任意原因累计到这么多 → 直接删除
  HIGH_RISK_DELETE: 2,        // 高敏原因累计到这么多，且证据够 → 直接删除
  HIGH_RISK_HIDE: 2,          // 高敏原因到了这个数但没人给证据 → 先下架
  // 一个人指认也能删的最短路径：他选了高敏原因 + 内容自己命中屏蔽词 + 他写得出
  // 可查的线索，三条硬信号凑齐。三者都是客观事实，不依赖「还有没有第二个人」，
  // 所以冷启动期这条照常生效 —— 这是起步阶段唯一不靠人多的那条处置通道。
  // 之所以要「内容踩词」这一条垫底：只凭一句主观指控就删帖太危险，
  // 但内容已经白纸黑字命中屏蔽词时，就没人数的必要了。
  HIGH_RISK_DELETE_SOLE: 1,
  AUTHOR_THRESHOLD: 5,  // 同一作者 24h 内累计这么多条 → 其当天的帖自动暂停展示
  AUTHOR_WINDOW_H: 24,
  // 留言（信息墙上别人留的群号那类）单独一套阈值。
  // 跟帖子比一高一低的原因：留言就是一句短文本，攒起来的价值远不如一整条帖子，
  // 而且它挂在信息墙上，一条垃圾就顶掉一条有用的（帖子被刷还能往下翻，留言被顶就没了），
  // 所以删除门槛比帖子低；但也不能太低 —— 信息墙的全部价值就是这些留言，
  // 三条恶作剧举报就抹掉同学辛苦留的群号，比留着那条更伤。
  COMMENT_DELETE_THRESHOLD: 3,  // 任意原因累计这么多 → 直接删
  COMMENT_HIGH_RISK_DELETE: 2,  // 高敏原因累计这么多，且有人给证据 / 内容自己踩词 → 直接删

  // ==== 冷启动自适应 ==================================================
  // 「24 小时内 5 个人举报」这条规则写的时候是想当然的：它默认社区里已经有一群人。
  // 但新上线那阵子一个班都凑不出这么多个，规则再对也是摆设 ——
  // 同学点了举报，什么都没发生，以后就再也不点了。
  //
  // 这里拿「全站 24 小时内举报总数」当社区规模的代理指标：
  // 低于 COLD_REPORTS 就说明还在冷启动期，各档阈值按下限执行；
  // 等社区热起来，数字自然涨过这条线，阈值自己回到上面那套正式值，
  // 谁都不用手动去调。
  COLD_REPORTS: 8,            // 24h 内全站举报总数低于这个数 → 按冷启动阈值处置
  COLD_CONTENT: 2,            // 冷启动：任意原因累计这么多 → 下架（正式值 3）
  // 删除这一档只从 5 降到 3，不再往下 ——
  // 「直接删除」是这里最重的动作（同学看不到自己的贴了），
  // 冷启动再松到 2 人就等于「两个同学觉得不顺眼，帖子就没了」，
  // 冷启动期最缺的就是人，把内容搞没只会更冷。要松也不能松在最重那一档上。
  COLD_AUTO_DELETE: 3,        // 冷启动：任意原因累计这么多 → 直接删（正式值 5）
  COLD_HIGH_RISK_DELETE: 1,   // 冷启动：1 条高敏且有人给证据 / 内容踩词 → 直接删
  COLD_HIGH_RISK_HIDE: 1,     // 冷启动：1 条高敏举报但没人给证据 → 先下架
  COLD_COMMENT_DELETE: 2,     // 冷启动：留言累计这么多 → 直接删（正式值 3）

  // ==== 反滥用：从「一罚三，永久作废」改成「有窗口，能自己好起来」 ====
  // 旧规则是「被驳回满 3 次，这个人这辈子的举报都不算数」——
  // 两条毛病：
  //   ① 惩罚太重。最该被这一条误伤的，恰恰是最热心的那批人
  //      （他认真看过、写了说明，只是判断偏了一点），一棍子打死太凉薄；
  //   ② 永久生效，除了运营手动清库没有任何出路。
  // 新规则只在最近 ABUSER_WINDOW_D 天里数驳回次数，满 ABUSER_LIMIT 进观察期，
  // 观察期 OBSERVE_H 小时后自动解除（不用任何人动手），
  // 观察期内再熬满 OBSERVE_GRACE_H 没有新的驳回也能提前放出来；
  // reverse 通道更宽：只要有一条举报被审核员判「违规成立」，观察期立刻解除 ——
  // 一个举报得准的人，不该因为错过几次就一直背着。
  ABUSER_WINDOW_D: 7,         // 只数最近这么多天被驳回的举报
  ABUSER_LIMIT: 3,            // 最近这么多天被驳回满这么多次 → 进观察期
  OBSERVE_H: 48,              // 观察期时长（小时），到点自动解除
  OBSERVE_GRACE_H: 24,        // 观察期内连续这么久没新的驳回 → 提前恢复
  ABUSER_BADGE: '观察期'      // 观察期内在队列里显示的标签
};

// 「可证明的线索」长什么样：写得出具体东西，而不是一句「就是广告」。
// 判的是「有没有事实」，不是「说得对不对」—— 说得对不对交给审核员。
const PROOF_PATTERN = /(https?:\/\/|www\.|微信|vx|v信|qq|电话|手机号|扫码|二维码|\d{5,}|[¥￥]\s*\d|\d+\s*(元|块|折)|[01]\d|截图|证据|班级|宿舍|教室|楼|时间|地点|日期|号)/i;

// 这条举报有没有给出可查证的线索
function hasProof(report) {
  return PROOF_PATTERN.test(String((report && report.detail) || ''));
}

// 这批举报里有没有一条带证据
function anyProof(reports) {
  return (reports || []).some(hasProof);
}

/* ----------------------------------------------------------------
 * 「这是正常校园社交，还是商业广告」—— 举报处置里最要紧的一次判断
 *
 * 为什么会需要它：一个帖子里写着「加微信进群」，从字面看和广告一模一样。
 * 但「街舞社招新，加我微信进群」和「代写论文，加微信详聊」是两回事，
 * 前者是校园社区最该有的内容，后者该删。
 *
 * 判不出来语义，就判**它有没有校园属性**：是不是明确的校内组织、校内活动、
 * 同好圈子。有校园落点的是社交，没有落点、通篇只谈交易和联系方式的才是广告。
 * 判错的代价是不对称的：把社团帖当广告删了，等于亲手赶走最早的一批用户；
 * 漏放一条广告，审核员点一下就能删。所以这里宁可偏向「它是社交」。
 * ---------------------------------------------------------------- */
const SOCIAL_HINTS = /(社团|社招新|招新|纳新|同好|兴趣小组|俱乐部|协会|学生会|团学|志愿|义工|球队|队招|合唱|乐队|舞蹈|街舞|摄影|动漫|电竞|辩论|模联|编程|开源|读书会|英语角|跑团|健身|徒步|露营|汉服|cos|跑协|羽毛球|篮球|足球|乒乓球|网球|滑板|天文|书法|话剧|吉他|钢琴|考研|考公|保研|留学|实习|竞赛|建模|ACM|实验室|课题组|组队|搭子|拼车|拼单|二手|闲置|失物|招人|缺人|求组队)/i;

// 商业广告的硬特征：通篇在卖东西 / 拉客 / 承诺收益。
// 只要有这些，就算发在「社团同好」里也按广告算 —— 社团不会「包过」「日结」「返现」。
// ⚠️ 这张表要能认出「服务 + 收费」这种最常见的校园软广（代写/代课/代购），
//    只认「低价出售」这类电商话术是不够的
const AD_HINTS = /(代写|代做|代课|代考|代抢|代购|代打|论文代|作业代|包过|保过|刷单|刷课|返现|日结|兼职日结|高额回报|稳赚|稳赚不赔|贷款|办证|开票|内部渠道|内部消息|低价出售|批发出售|厂家直销|代理加盟|诚招代理|扫码领|免费领|限时特价|全网最低|加微信详聊|私聊报价|详聊报价|收费合理|价格优惠|有偿|收费|付费|跑腿费|客服咨询|加我详聊)/i;

function isSocialPost(content, hit) {
  const c = content || {};
  const board = String(c.board || '');
  const text = String(c.title || '') + ' ' + String(c.content || '');
  // ⓪ 有商业广告特征就一律不是校园社交 —— 哪怕发在「社团同好」板块。
  //    这一条必须排在最前面：把板块当免检通道的话，「代写论文，加微信详聊」
  //    发到社团同好里就删不掉了，等于给广告开了个后门
  if (AD_HINTS.test(text)) return false;
  // ① 发在社交属性的板块：这个板块本身就是为社团和同好群开的
  if (CONTACT_OK_BOARDS.indexOf(board) >= 0) return true;
  // ② 内容里有明确的校园落点（社团 / 同好 / 组队 / 找东西…）
  if (SOCIAL_HINTS.test(text)) return true;
  // ③ 命中的屏蔽词全是被豁免的那类（「加微信」），其余一个都没有：
  //    说明它顶多是在留联系方式，没有真的骂人或涉黄涉赌
  const hits = hit || [];
  if (hits.length && hits.every((w) => JOIN_WORDS_EXEMPT.indexOf(w) >= 0)) return true;
  return false;
}

// 屏蔽词（与前端 utils/moderation.js 保持一致，服务端为准，绕不过去）
const BLOCK_WORDS = [
  '傻逼', '煞笔', '沙比', '智障', '脑残', '废物', '滚蛋', '去死',
  '约炮', '一夜情', '裸聊', '成人', '赌场', '博彩', '私彩',
  '加微信', '加v信', '加微', '刷单', '兼职日结', '贷款',
  '内部消息', '包过', '代考', '作弊器'
];

// 「拉群 / 留联系方式」这一类词，正常社交也需要，只在特定板块放行。
//
// 为什么必须放行：社团招新和同好群帖的核心内容就是「加群」「加微信」——
// 「加微信」在 BLOCK_WORDS 里，照原来的规则这类帖子一条都发不出去，
// 或者发出来被当成广告举报掉。而它恰恰是校园社区冷启动最值钱的内容：
// 社团本来就自带一群人，让他们把群号贴在这儿，比自己去拉活有效得多。
//
// 放行的只是「怎么联系」，不是「别守规矩」：涉黄涉赌、代考刷单这些词
// 不在豁免名单里，骂人的词也不在，一律照旧拦截。
const JOIN_WORDS_EXEMPT = ['加微信', '加v信', '加微'];

// 允许留联系方式的板块。只有这些板块享受上面的豁免，
// 别的板块（课程评价、闲置、校园吐槽…）一视同仁 ——
// 在校园吐槽里发「加微信领资料」仍然是广告，该拦就拦
const CONTACT_OK_BOARDS = ['社团同好', '活动组队', '失物招领', '树洞'];

// 豁免只作用于「怎么加群」这几个词，其余屏蔽词照常生效
function checkTextInBoard(board, ...parts) {
  const exempt = CONTACT_OK_BOARDS.indexOf(String(board || '')) >= 0;
  if (!exempt) return checkText.apply(null, parts);
  const s = parts.map(normalizeText).join('');
  if (!s) return { ok: true };
  const hit = BLOCK_WORDS.filter((w) => {
    if (JOIN_WORDS_EXEMPT.indexOf(w) >= 0) return false;
    return s.indexOf(normalizeText(w)) >= 0;
  });
  if (hit.length) return { ok: false, hit: hit, msg: blockMsg(hit) };
  return { ok: true };
}

// 拦截提示：点名是哪个词。见 checkText 下面的说明
function blockMsg(hit) {
  const names = (hit || []).slice(0, 2).join('、');
  return names ? '内容里有「' + names + '」，换个说法试试' : '内容含不合适用词';
}

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

// 命中屏蔽词则拒绝写入，返回结果给前端决定怎么提示。
// 提示文案见 blockMsg：点名具体是哪个词，别只说「含不合适用词」
function checkText(...parts) {
  const s = parts.map(normalizeText).join('');
  if (!s) return { ok: true };
  const hit = BLOCK_WORDS.filter((w) => s.indexOf(normalizeText(w)) >= 0);
  if (hit.length) return { ok: false, hit: hit, msg: blockMsg(hit) };
  return { ok: true };
}

function now() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// 只暴露公开的展示字段（不含联系方式）
function publicProfile(u) {
  return {
    openid: u.openid || u._openid || '',
    nickName: u.nickName || '浙小商',
    avatarUrl: u.avatarUrl || '',
    college: u.college || '',
    motto: u.motto || ''
  };
}

// 展示字段 + 联系方式（仅用于「已互认的好友」）
function fullProfile(u) {
  return Object.assign(publicProfile(u), {
    contactType: u.contactType || '',
    contactValue: u.contactValue || ''
  });
}

async function me() {
  return cloud.getWXContext().OPENID || '';
}

/* ---------------- 个人资料 ---------------- */

// 首次进入时自动登记：openid 作为 _id，天然唯一且幂等
async function upsertProfile(openid, payload) {
  payload = payload || {};
  const data = {
    nickName: String(payload.nickName || '').trim().slice(0, 20) || '浙小商',
    avatarUrl: payload.avatarUrl || '',
    college: String(payload.college || '').trim().slice(0, 20),
    motto: String(payload.motto || '').trim().slice(0, 40),
    contactType: payload.contactType || '',     // wechat / phone / qq / ''
    contactValue: String(payload.contactValue || '').trim().slice(0, 40),
    updatedAt: now()
  };
  if (!data.contactValue) data.contactType = '';
  // 已存在就走增量更新：profile 里没提到的字段（比如内容处置产生的 limitUntil）要保留，
  // 直接 set 覆盖一次就会把它们抹掉
  const exist = await db.collection(COL_USERS).doc(openid).get().catch(() => null);
  if (exist && exist.data) {
    await db.collection(COL_USERS).doc(openid).update({ data }).catch(() => {});
  } else {
    await db.collection(COL_USERS).doc(openid).set({ data });
  }
  return { ok: true, profile: fullProfile(Object.assign({ openid }, data)) };
}

// 看别人的主页：只有双方已互认（双向 accepted）才给联系方式，否则只给公开字段
async function getProfile(openid, target) {
  target = String(target || '');
  if (!target || target === openid) return { profile: null };

  const rel = await db.collection(COL_CONTACTS)
    .where(db.command.or([
      { fromOpenid: openid, toOpenid: target, status: 'accepted' },
      { fromOpenid: target, toOpenid: openid, status: 'accepted' }
    ])).limit(1).get().catch(() => ({ data: [] }));

  const isFriend = rel.data && rel.data.length > 0;
  const res = await db.collection(COL_USERS).doc(target).get().catch(() => null);
  if (!res || !res.data) return { profile: null };

  const u = res.data;
  u.openid = u.openid || target;
  return {
    profile: isFriend ? fullProfile(u) : publicProfile(u),
    isFriend: isFriend
  };
}

// 同学广场：按昵称 / 学院搜人（只返回公开字段）
//
// 数据库只支持正则匹配（原样包含），「打错一个字就搜不到人」在同学广场上照样会发生，
// 找人的时候更致命 —— 于是先让库里按包含粗筛一轮省传输，再在内存里用同一套
// 精准 / 模糊内核复筛 + 排序：找得到的人里，名字完全对得上的排最前面。
async function search(openid, keyword, exact) {
  const kw = String(keyword || '').trim();
  if (!kw) return { list: [] };
  // 数据库的正则只能做「原样包含」，拿它当粗筛必须放得足够宽：
  // 关键词拆成单个字，「出现任意一个字就捞出来」。
  // 早先这里用的是完整关键词，结果同学把名字打错一个字时，库里一条都捞不出来 ——
  // 下面那套内存复筛（精准 / 模糊）根本轮不到执行，找人就像坏了
  const parts = kw.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const reg = db.RegExp({ regexp: parts, options: 'i' });
  const res = await db.collection(COL_USERS)
    .where(db.command.or([{ nickName: reg }, { college: reg }]))
    .limit(50).get().catch(() => ({ data: [] }));

  const scored = [];
  (res.data || []).forEach((u) => {
    const lv = searchCore.matchFields([u.nickName, u.college], kw);
    // 精准档只留原样命中，和前端课程 / 论坛 / 闲置的判定保持一致
    if (lv < 0 || (exact && lv > searchCore.MATCH_RANK.contain)) return;
    scored.push({ lv: lv, u: publicProfile(u) });
  });
  scored.sort((a, b) => a.lv - b.lv);
  return { list: scored.map((s) => s.u) };
}

/* ---------------- 联系请求（想认识） ---------------- */

async function listRequests(openid) {
  const res = await db.collection(COL_CONTACTS)
    .where({ toOpenid: openid, status: 'pending' })
    .orderBy('time', 'desc').limit(50).get().catch(() => ({ data: [] }));

  const out = [];
  for (const r of res.data) {
    const p = await db.collection(COL_USERS).doc(r.fromOpenid).get().catch(() => null);
    const u = (p && p.data) || {};
    out.push({
      id: r._id,
      fromOpenid: r.fromOpenid,
      message: r.message || '',
      time: r.time || '',
      nickName: u.nickName || '某个同学',
      avatarUrl: u.avatarUrl || '',
      college: u.college || ''
    });
  }
  return { list: out };
}

// 我主动发起、还在等对方处理的
async function listOutgoing(openid) {
  const res = await db.collection(COL_CONTACTS)
    .where({ fromOpenid: openid, status: 'pending' })
    .orderBy('time', 'desc').limit(50).get().catch(() => ({ data: [] }));

  const out = [];
  for (const r of res.data) {
    const p = await db.collection(COL_USERS).doc(r.toOpenid).get().catch(() => null);
    const u = (p && p.data) || {};
    out.push({
      id: r._id,
      toOpenid: r.toOpenid,
      message: r.message || '',
      time: r.time || '',
      nickName: u.nickName || '同学',
      avatarUrl: u.avatarUrl || ''
    });
  }
  return { list: out };
}

// 24 小时冷却：刚被拒绝的人不能立刻反复骚扰，避免「想认识」变成轰炸
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function addRequest(openid, payload) {
  payload = payload || {};
  const to = String(payload.toOpenid || '');
  if (!to) return { ok: false, msg: '没有指定同学' };
  if (to === openid) return { ok: false, msg: '不能给自己发请求' };

  // 对方把我拉黑了 —— 直接拒绝，前端连「已发出」都看不到
  const blocked = await db.collection(COL_BLOCKS)
    .where({ openid: to, target: openid })
    .limit(1).get().catch(() => ({ data: [] }));
  if (blocked.data && blocked.data.length) {
    return { ok: false, msg: '对方设置了消息限制' };
  }

  const exist = await db.collection(COL_CONTACTS)
    .where({ fromOpenid: openid, toOpenid: to })
    .limit(1).get().catch(() => ({ data: [] }));

  const prev = exist.data && exist.data[0];
  if (prev) {
    if (prev.status === 'pending') return { ok: false, msg: '已经发起过了，等对方回应' };
    if (prev.status === 'accepted') return { ok: false, msg: '你们已经是好友啦' };
    // 之前被拒绝过：24 小时内不让你重来
    const last = prev.replyAt || prev.time || '';
    const t = Date.parse(last.replace(/-/g, '/'));
    if (t && Date.now() - t < COOLDOWN_MS) {
      return { ok: false, msg: '对方可能还没准备好，过一天再试试' };
    }
    // 冷却结束，重新激活这条记录
    await db.collection(COL_CONTACTS).doc(prev._id)
      .update({ data: { status: 'pending', message: String(payload.message || '').slice(0, 50), time: now() } });
    return { ok: true };
  }

  await db.collection(COL_CONTACTS).add({
    data: {
      fromOpenid: openid,
      toOpenid: to,
      status: 'pending',
      message: String(payload.message || '').slice(0, 50),
      time: now()
    }
  });
  return { ok: true };
}

// 只有被请求的一方（toOpenid）能处理
async function respond(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '');
  const action = payload.action === 'accept' ? 'accept' : 'reject';
  if (!id) return { ok: false, msg: '参数缺失' };

  const rec = await db.collection(COL_CONTACTS).doc(id).get().catch(() => null);
  if (!rec || !rec.data || rec.data.toOpenid !== openid) {
    return { ok: false, msg: '无权处理这条请求' };
  }

  await db.collection(COL_CONTACTS).doc(id).update({
    data: { status: action === 'accept' ? 'accepted' : 'rejected', replyAt: now() }
  });

  if (action === 'accept') {
    // 回写一条反向记录：让双方都能看到对方的联系方式
    const back = await db.collection(COL_CONTACTS)
      .where({ fromOpenid: openid, toOpenid: rec.data.fromOpenid })
      .limit(1).get().catch(() => ({ data: [] }));
    if (!back.data || back.data.length === 0) {
      await db.collection(COL_CONTACTS).add({
        data: {
          fromOpenid: openid,
          toOpenid: rec.data.fromOpenid,
          status: 'accepted',
          message: '对方通过了你的好友请求',
          time: now()
        }
      });
    }
  }
  return { ok: true };
}

/* ---------------- 我的好友 ---------------- */

async function listFriends(openid) {
  const outMap = {};
  const out = [];

  const a = await db.collection(COL_CONTACTS)
    .where({ fromOpenid: openid, status: 'accepted' })
    .limit(100).get().catch(() => ({ data: [] }));
  a.data.forEach((r) => { outMap[r.toOpenid] = true; out.push(r.toOpenid); });

  const b = await db.collection(COL_CONTACTS)
    .where({ toOpenid: openid, status: 'accepted' })
    .limit(100).get().catch(() => ({ data: [] }));
  b.data.forEach((r) => { outMap[r.fromOpenid] = true; out.push(r.fromOpenid); });

  const list = [];
  for (const id of out) {
    if (!outMap[id]) continue;
    const p = await db.collection(COL_USERS).doc(id).get().catch(() => null);
    if (p && p.data) list.push(fullProfile(p.data));
  }
  return { list };
}

/* ---------------- 拉黑 ---------------- */

// 拉黑某人后：TA 对我的请求直接被拒，我的名片也不再对 TA 显示联系方式
async function blockUser(openid, payload) {
  const target = String((payload && payload.toOpenid) || '');
  if (!target || target === openid) return { ok: false, msg: '参数不对' };

  await db.collection(COL_BLOCKS).doc(openid + '_' + target).set({
    data: { openid: openid, target: target, time: now() }
  }).catch(() => {});
  return { ok: true };
}

async function unblockUser(openid, payload) {
  const target = String((payload && payload.toOpenid) || '');
  if (!target) return { ok: false, msg: '参数不对' };
  await db.collection(COL_BLOCKS).doc(openid + '_' + target).remove().catch(() => {});
  return { ok: true };
}

async function listBlocks(openid) {
  const res = await db.collection(COL_BLOCKS)
    .where({ openid: openid }).limit(100).get().catch(() => ({ data: [] }));
  const list = [];
  for (const b of (res.data || [])) {
    const p = await db.collection(COL_USERS).doc(b.target).get().catch(() => null);
    if (p && p.data) list.push(publicProfile(p.data));
  }
  return { list };
}

/* ---------------- 举报 ---------------- */

const REPORT_REASONS = ['广告骚扰', '不文明用语', '虚假信息', '涉及隐私', '违规交易', '其他'];

// 按业务字段 id 定位文档。
// 注意：云开发 add 时不会自动把业务字段 id 当成 _id，所以很多地方用 doc(id) 会打空。
// 统一走 where({id}) 更稳：查、改、删一条路。
function byId(col, id) {
  return db.collection(col).where({ id: String(id || '') });
}

// 按 id 取一条内容（帖子 / 评价共用）
async function fetchTarget(targetType, targetId) {
  if (!targetId) return null;
  const col = targetType === 'review' ? COL_REVIEWS : COL_POSTS;
  const res = await byId(col, targetId).limit(1).get().catch(() => ({ data: [] }));
  return (res.data && res.data[0]) || null;
}

// 内容下架 / 恢复：下架不是删除，内容还在库里，随时能恢复
async function setContentStatus(targetType, targetId, status, reason) {
  if (!targetId) return;
  const col = targetType === 'review' ? COL_REVIEWS : COL_POSTS;
  await byId(col, targetId).update({
    data: { status: status, hiddenReason: reason || '', hiddenAt: now() }
  }).catch(() => {});
}

// 审核确认违规后的真删除（下架可逆，删除不可逆，只在人工确认那一刀用）
async function removeContent(targetType, targetId) {
  if (!targetId) return;
  const col = targetType === 'review' ? COL_REVIEWS : COL_POSTS;
  await byId(col, targetId).remove().catch(() => {});
}

// 限时多人举报 → 内容从全校消失，但先不物理删除，只打 status: 'deleted'。
//
// 为什么不真删：别的同学手机上有本地缓存，云端那条一删，
// 他下次同步时本地那份还会被当成「云端没有、本地有」的孤儿重新挂回列表里，
// 结果就是「系统说删了，学校里还有人看得到」。标记状态则跟着同步一起下发，
// 谁都看不到；而且误判还能改回来，比物理删除安全。
async function markContentDeleted(targetType, targetId) {
  if (!targetId) return;
  const col = targetType === 'review' ? COL_REVIEWS : COL_POSTS;
  await byId(col, targetId).update({
    data: {
      status: 'deleted',
      hiddenReason: '24 小时内被多名同学举报，系统自动删除',
      hiddenAt: now()
    }
  }).catch(() => {});
}

// 举报落库时同时写一个时间戳字段：云开发里字符串时间没法直接比较大小，
// 做「24 小时内的举报数」统计必须靠数值字段。
// ⚠️ reports 集合没建时 add 会失败，这里必须把失败抛出去 —— 之前静默吞掉的话，
//    举报看起来「提交成功」实则一条没存，阈值永远算不出来，整个自动处置形同虚设。
async function addReportDoc(doc) {
  await db.collection(COL_REPORTS).add({ data: doc });
}

// 举报人的「反滥用」状态：是不是正在观察期。
//
// 旧版本这个名字叫 rejectedCount，数的是「历史被驳回的总数」，没有窗口、没有上限，
// 驳回满 3 次就永久作废。两个问题：惩罚太重（最热心的人最容易被误伤），
// 而且没有出路。现在换成按时间窗口判定，误报会过去，准报能抵消。
//
// 返回：
//   limited —— 是否正在观察期（观察期内举报照样记录、照样进人工队列，
//              只是不计入自动处置的票数，系统不会自己动手）
//   until   —— 观察期解除的时间戳；已经过去的返回 0
//   eased   —— 是提前放出来的（不是满刑期）
//   count   —— 窗口内被驳回的次数（仅用于展示）
async function abuseState(openid) {
  const res = await db.collection(COL_REPORTS)
    .where({ openid: openid }).limit(200).get().catch(() => ({ data: [] }));
  const all = (res && res.data) || [];

  // 时间戳兜底：老数据可能没有 at 字段，退回去解析 time 字符串
  const atOf = (r) => {
    const n = Number(r && r.at);
    if (n) return n;
    const t = Date.parse(String((r && r.time) || '').replace(/-/g, '/'));
    return t || 0;
  };
  const since = Date.now() - MOD_RULES.ABUSER_WINDOW_D * 86400 * 1000;

  // 出站通道：有一条举报被审核员判「违规成立」，说明这个人的判断是被认可的，
  // 观察期当场解除（不用等满刑期）
  const good = all.filter((r) => r.status === 'confirmed' && atOf(r) >= since);
  if (good.length) {
    return { count: 0, confirmed: good.length, limited: false, until: 0, eased: true };
  }

  // 入站通道：只看最近的驳回，更早的账一笔钩销。
  // 'reject'（单数）也认：resolveReports 以前把驳回写成了那个值，老数据里已经存着了
  const hit = all
    .filter((r) => (r.status === 'rejected' || r.status === 'reject') && atOf(r) >= since)
    .map(atOf);
  if (hit.length < MOD_RULES.ABUSER_LIMIT) {
    return { count: hit.length, confirmed: 0, limited: false, until: 0, eased: false };
  }

  const earliest = Math.min.apply(null, hit);
  const latest = Math.max.apply(null, hit);
  const until = earliest + MOD_RULES.OBSERVE_H * 3600 * 1000;
  // 观察期内只要又熬满 OBSERVE_GRACE_H 没有新的驳回，就提前放出来。
  // 最热心那批人常常一天连报好几条，全被驳回之后如果还要按满刑期关着，
  // 下一次他就不会再认真看了
  if (Date.now() - latest >= MOD_RULES.OBSERVE_GRACE_H * 3600 * 1000) {
    return { count: hit.length, confirmed: 0, limited: false, until: 0, eased: true };
  }
  return {
    count: hit.length, confirmed: 0,
    limited: Date.now() < until, until: until, eased: false
  };
}

// 全站 24 小时内的举报总数 —— 拿它当「社区现在有多热闹」的代理指标。
// 直接数用户数做不到（小程序拿不到全站活跃数，也不该去拿），但举报量是同一个信号：
// 没人来，就没人举报；人一多，举报自然就多。
// 用它来在冷启动期自动放宽阈值，省得运营去后台手动改一行数字然后忘掉。
async function communityReports() {
  const since = Date.now() - MOD_RULES.AUTHOR_WINDOW_H * 3600 * 1000;
  const res = await db.collection(COL_REPORTS)
    .where({ at: db.command.gte(since) }).count().catch(() => null);
  return (res && res.total) || 0;
}

// 某个被举报人 24 小时内的举报总数
async function recentReportsCount(target) {
  const since = Date.now() - MOD_RULES.AUTHOR_WINDOW_H * 3600 * 1000;
  const res = await db.collection(COL_REPORTS)
    .where({ target: target, at: db.command.gte(since) })
    .count().catch(() => null);
  return (res && res.total) || 0;
}

// 同一条内容 24 小时内的举报详情。
// 判「要不要直接删」得看具体原因：高敏原因（广告/隐私/违规交易）危害性明确，
// 两个人指出来就够了；一般原因（不文明用语之类）主观性强，得人数更多才敢删。
async function recentReports(targetId) {
  const since = Date.now() - MOD_RULES.AUTHOR_WINDOW_H * 3600 * 1000;
  const res = await db.collection(COL_REPORTS)
    .where({ targetId: String(targetId || ''), at: db.command.gte(since) })
    .limit(50).get().catch(() => ({ data: [] }));
  return res.data || [];
}

// 判定处置动作：
//   'delete'  —— 限时多人举报，直接删掉（不可逆，门槛最高）
//   'hide'    —— 先下架，留给人工确认
//   'throttle'—— 暂停作者当天的新帖
//   ''        —— 只记录，不动内容
// excludeOpenid —— 观察期里的那个人。他的票照样记在库里、照样进人工队列，
//   但这条内容判「要不要自动动手」时不算他那一票，交给审核员自己看
async function decideAction(targetType, targetId, target, reason, detail, excludeOpenid) {
  const content = await fetchTarget(targetType, targetId);
  if (!content) return { action: '', content: null, hit: [] };

  const text = String(content.title || '') + ' ' + String(content.content || '');
  // 命中判定也按板块：社团同好里的「加微信」是正常内容，不该记成违规证据
  const hit = checkTextInBoard(
    content.board, String(content.title || ''), String(content.content || '')
  ).hit || [];
  const highRisk = MOD_RULES.HIGH_RISK.indexOf(reason) >= 0;
  // 内容维度的举报数：这条内容自己被多少人举报。
  // 早先这里数的是「这个作者被举报的总数」—— 结果是作者发十条、九条清白，
  // 只因为另一条被举报过，这条就跟着达到阈值被删掉，属于误伤
  const reports = (await recentReports(targetId))
    .filter((r) => !excludeOpenid || String(r.openid || '') !== String(excludeOpenid));
  const total = reports.length;
  const risky = reports.filter((r) => MOD_RULES.HIGH_RISK.indexOf(r.reason) >= 0).length;
  // 高敏那一档额外要看的两件事：有没有人给出可查证的线索、内容本身有没有踩屏蔽词。
  // 因为「广告骚扰」这类原因故意不设屏蔽词（防误伤正常咨询），光靠口径挡不住恶意举报
  const proved = anyProof(reports);
  const blocked = hit.length > 0;
  // 已经下架过的内容：说明前面已经有人指认过且系统认了，
  // 这时候再来高敏举报，不必再要求重新举证（举证材料可能就在前几条里）
  const alreadyHidden = content.status === 'hidden' || content.status === 'deleted';

  // 这条内容本身像不像「正常的校园社交」：社团招新、同好群、组队、找东西。
  // 这类帖被举报「广告骚扰」是必然的 —— 它确实在拉人、确实留了联系方式，
  // 但它不是广告，是校园社区最该有的东西。冷启动阶段尤其不能把它当广告做掉：
  // 社团自带一群人，让他们把群贴在这儿，比什么运营手段都有效。
  // 所以这类内容单独提高门槛：改判成下架，永远不会被两条高敏举报直接删掉。
  const social = isSocialPost(content, hit);

  // 社区现在是冷是热：举报总量低的时候，凑不出正式阈值那样的人数，
  // 阈值就按下限走（COLD_*）。等举报多起来，这里自然翻回上面那套正式值。
  const cold = (await communityReports()) < MOD_RULES.COLD_REPORTS;

  let action = '';
  if (social) {
    // 正常的校园社交内容（社团招新 / 同好群 / 组队 / 找东西）：
    // 无论被举报什么原因，一律只按下架处理，**永远不会被自动删除**。
    // 要真删得等审核员点头 —— 把它当广告删掉，等于亲手赶走最早的一批用户。
    //
    // 阈值：冷启动时 2 人（COLD_CONTENT），平时 3 人。
    // 只是这个「藏」不会升级成「删」，哪怕 10 个人举报。
    if (total >= (cold ? MOD_RULES.COLD_CONTENT : MOD_RULES.CONTENT_THRESHOLD)) action = 'hide';
    else if (highRisk && blocked) action = 'hide';
    else action = '';
    return {
      action, content, hit, total, highRisk, cold,
      reports: reports.length, risky, proved, blocked, social,
      detail: detail || ''
    };
  }

  if (total >= (cold ? MOD_RULES.COLD_AUTO_DELETE : MOD_RULES.AUTO_DELETE_THRESHOLD)) {
    // 冷启动 2 人 / 平时 5 个人都说这条不行 —— 不用再等审核，直接删。
    // 人数本身就够说明问题了，不再额外要证据
    action = 'delete';
  } else if (risky >= (cold ? MOD_RULES.COLD_HIGH_RISK_DELETE : MOD_RULES.HIGH_RISK_DELETE)
      && (proved || blocked || alreadyHidden)) {
    // 冷启动 1 个 / 平时 2 个以上指认广告 / 隐私 / 违规交易，**并且**至少有一条
    // 拿得出可查的线索（或内容自己踩了屏蔽词、或这条本来就是下架状态）→ 直接删。
    // 加这个「并且」是为了堵一条路：光选个高敏原因凑人数就能删任何帖子
    action = 'delete';
  } else if (risky >= MOD_RULES.HIGH_RISK_DELETE_SOLE && highRisk && proved && blocked) {
    // 一个人就够了的路子：他选了高敏原因，内容自己命中了屏蔽词，他还写得出可查的线索。
    // 三条都是摆在明面上的事实，跟「还有没有第二个人」没关系 ——
    // 冷启动期全站就两三个活跃同学，这条是唯一不靠人数的自动处置通道。
    action = 'delete';
  } else if (risky >= (cold ? MOD_RULES.COLD_HIGH_RISK_HIDE : MOD_RULES.HIGH_RISK_HIDE)) {
    // 口径够了但没人给证据：先下架等人工看一眼，不直接删。
    // 真被坑的人补一句说明是顺手的事，恶意举报的人凑不出事实
    action = 'hide';
  } else if (total >= (cold ? MOD_RULES.COLD_CONTENT : MOD_RULES.CONTENT_THRESHOLD)) {
    // 冷启动 2 人 / 平时 3 个人以上都说不行，先按下架处理，留给审核确认
    action = 'hide';
  } else if (highRisk && blocked) {
    // 一个高敏举报 + 内容确实命中屏蔽词，证据已经够了
    action = 'hide';
  } else if (total >= MOD_RULES.AUTHOR_THRESHOLD) {
    action = 'throttle';
  }
  return {
    action, content, hit, total, highRisk, cold,
    reports: reports.length, risky, proved, blocked, social,
    detail: detail || ''
  };
}

// 举报：落库的同时当场决定处置动作，不等人工。
// 设计原则：绝大多数举报在这层就被消化掉，只有「系统拿不准」的那部分才进人工队列。
async function report(openid, payload) {
  payload = payload || {};
  const target = String(payload.targetOpenid || '');
  const targetId = String(payload.targetId || '');
  const targetType = payload.targetType === 'review' ? 'review' : 'post';
  const rawReason = String(payload.reason || '');
  const reason = REPORT_REASONS.indexOf(rawReason) >= 0 ? rawReason : '其他';
  const detail = String(payload.detail || '').slice(0, 100);

  if (!target) return { ok: false, msg: '没被举报的对象' };

  // ① 反滥用：正在观察期的同学（最近被驳回太多），举报照样记录、照样进人工队列，
  //    只是这一票不计入自动处置 —— 系统不自己动手，留给审核员看
  const ab = await abuseState(openid);

  // ② 查重：同一个人对同一条内容同一理由只算一次
  const dup = await db.collection(COL_REPORTS)
    .where({ openid: openid, target: target, targetId: targetId, reason: reason })
    .limit(1).get().catch(() => ({ data: [] }));
  if (dup.data && dup.data.length) {
    return { ok: true, msg: '你已经举报过了，我们会尽快处理' };
  }

  // ③ 先看内容当前状态：下架过的内容后续还要能继续收到举报（见下面 action 处的说明）
  await fetchTarget(targetType, targetId);

  await addReportDoc({
    openid: openid,
    target: target,
    targetId: targetId,
    targetType: targetType,
    reason: reason,
    detail: detail,
    status: 'pending', // pending → rejected（证据不足）/ confirmed（违规成立）
    time: now(),
    at: Date.now(),
    // 观察期里投的这一票：留痕、进队列，但下面判处置时不算它
    reviewOnly: !!ab.limited
  });

  const verdict = await decideAction(
    targetType, targetId, target, reason, detail,
    ab.limited ? openid : ''
  );
  // 已经下架过的内容，处置动作原样回给前端 —— 这一票不能吞。
  //
  // ⚠️ 这里以前写成「已经 hidden 就把动作清成空」，看着是「不重复下架」，
  // 实际坑不小：一条内容 3 票就被藏起来了，之后同学在「因举报暂停展示」那个页面
  // 继续补的第 4、5 票，全部只换回一句「举报已提交」，needReview 也是 false ——
  // 那几票投了跟没投一样，「24 小时内 5 人举报直接删除」依然收不到票。
  // 内容状态本身是幂等的（再写一遍 hidden 没坏处，还会把举报人数补正），
  // 要省的是那次多余的写库，不是这一次举报的上报。
  //
  // 「已经下架之后再被举报，仍然可能达到删除阈值」这条走得的是上面的 delete 分支，
  // 不受这里影响 —— decideAction 里 alreadyHidden 本来就是 delete 的加码条件之一。
  const action = verdict.action;

  let msg = '举报已提交，我们会尽快核实';
  if (action === 'delete') {
    await markContentDeleted(targetType, targetId);
    // 已经处置掉的举报从待办队列里撤出来：
    // 留着它们，审核员每天看到的还是同一批「系统已经删过了」的记录，
    // 真正需要人判断的那几条反而被淹掉了
    await markAutoResolved(targetId);
    // 「多人」是这条路径的正常样子，但冷启动期 2 人那条路也可能只有两票，
    // 文案别硬说「多名同学」
    msg = verdict.total > 1
      ? '这条内容因为被多名同学举报，已经自动删除'
      : '这条内容因为被举报，已经自动删除';
  } else if (action === 'hide') {
    await setContentStatus(targetType, targetId, 'hidden',
      alertHideReason(reason, verdict.total, '自动下架'));
    msg = '已暂停这条内容的展示，我们会尽快核实';
  } else if (action === 'throttle') {
    await throttleAuthor(target);
    msg = '该同学近期举报较多，其新发内容会先暂停展示，我们会尽快核实';
  }

  // 观察期里的举报：系统不自动处置，得审核员自己看一眼 —— 文案要说清楚，
  // 别让人以为「举报交上去就没动静了」
  if (ab.limited && !action) msg = '举报已收到，会由老师优先核实';

  // needReview 只 telling 前端「还有事要人工看」：删掉和下架都算已经处理掉了，
  // 不该再往审核队列里塞一条（否则审核员看到的都是重复项）
  return {
    ok: true,
    msg: msg,
    action: action,
    needReview: action === 'hide' || action === 'throttle' || !!ab.limited,
    reviewOnly: !!ab.limited
  };
}

function alertHideReason(reason, total, prefix) {
  return (prefix || '') + '：' + reason + (total > 1 ? '（' + total + ' 人举报）' : '');
}

// 自动处置后把相关举报挪出待办队列（status: auto = 系统已经处理掉了，不用人再看）
async function markAutoResolved(targetId) {
  const res = await db.collection(COL_REPORTS)
    .where({ targetId: String(targetId || ''), status: 'pending' })
    .limit(50).get().catch(() => ({ data: [] }));
  const rows = res.data || [];
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection(COL_REPORTS).where({ _id: r._id })
      .update({ data: { status: 'auto' } }).catch(() => {});
  }
  return rows.length;
}

// 作者级处置：把这位作者最近 24 小时内发的帖子全部暂停展示，审核确认后恢复
async function throttleAuthor(target) {
  const since = Date.now() - MOD_RULES.AUTHOR_WINDOW_H * 3600 * 1000;
  const res = await db.collection(COL_POSTS)
    .where({ authorOpenid: target }).limit(50).get().catch(() => ({ data: [] }));

  // 只动最近 24 小时内的帖子：老帖一起下架代价太大，也容易误伤
  const posts = (res.data || []).filter((p) => {
    const t = Date.parse(String(p.time || '').replace(/-/g, '/'));
    return t && Date.now() - t < MOD_RULES.AUTHOR_WINDOW_H * 3600 * 1000;
  });
  for (const p of posts) {
    if (p.status === 'hidden') continue;
    // eslint-disable-next-line no-await-in-loop
    await byId(COL_POSTS, p.id).update({
      data: { status: 'hidden', hiddenReason: '作者近期被多名同学举报，先暂停展示', hiddenAt: now() }
    }).catch(() => {});
  }
  // 限流标记写到资料上，页面能看出这位同学处于观察期
  await db.collection(COL_USERS).doc(target).update({
    data: { limitedUntil: Date.now() + MOD_RULES.AUTHOR_WINDOW_H * 3600 * 1000 }
  }).catch(() => {});
  return posts.length;
}

/* ---------------- 内容审核（仅白名单） ---------------- */

// 审核员判定：两处任一命中即可
//   ① 环境变量 MODERATORS 里写死的
//   ② 名册集合 admins 里有这个人（审核页里点「把我设为审核员」写的）
// 只看代码里写死的白名单，不查库
function isModeratorFast(openid) {
  return MODERATORS.indexOf(openid) >= 0;
}
// 完整判定：白名单之外，还要去名册库 admins 里查（审核页里点按钮登记的）
async function isModerator(openid) {
  if (isModeratorFast(openid)) return true;
  const res = await db.collection(COL_ADMINS).doc(openid).get().catch(() => null);
  // ⚠️ 必须确认拿到的是「单个文档对象」：某些 SDK 版本对不存在的文档不抛错而是返回
  //    空数组/空数据，直接 !!(res && res.data) 会把任何人都误判成审核员
  const d = res && res.data;
  return !!d && !Array.isArray(d) && typeof d === 'object';
}
// ⚠️ 返回值必须是「错误信息字符串」或空字符串。
//    这里曾经被写了两遍一模一样的定义（重复函数声明，后定义覆盖前定义），
//    功能上碰巧一致，但会让读过的人以为有一处被改过却没生效。现在只留这一份。
async function denyReason(openid) {
  if (isModeratorFast(openid)) return '';
  return (await isModerator(openid)) ? '' : '你不是审核员，无法进入内容审核';
}

// 「把我设为审核员」：名册用 openid 当 _id，伪造请求也只能给自己登记，改不了别人。
// ⚠️ 但代价是「任何人都能给自己登记」——所以默认由上面的 SELF_ADMIN = false 关着，
// 正式上线前请走 MODERATORS 环境变量，别把自助登记打开。
async function setAdmin(openid) {
  if (!SELF_ADMIN) return { ok: false, msg: '当前设置了禁止自助登记，请联系管理员' };
  await db.collection(COL_ADMINS).doc(openid).set({
    data: { openid: openid, at: Date.now() }
  }).catch(() => {});
  return { ok: true, isMod: true, msg: '你已经是审核员了' };
}

// 环境自检：告诉前端「哪些集合还没建」，好让页面直接把引导显示出来，
// 而不是让用户对着一堆报错猜
async function diag() {
    // 不查 likes 集合：点赞早就收口到服务端了，记录存在帖子里的 likedBy 数组里，
    // 客户端直连写 likes 能无限刷赞。留着会让，「我的自检」里多一条永远无害的假警报
    const need = [COL_USERS, COL_POSTS, COL_REVIEWS, COL_CONTACTS, COL_REPORTS,
      COL_ADMINS, COL_FAVS, COL_MARKET, COL_CHATS,
      COL_RESOURCES, COL_CALENDAR, COL_PLACES, COL_CONFIG, COL_MEMOS,
      COL_EVENTS, COL_EVENT_JOINS, COL_TEACHERS, COL_COURSE_REQS, COL_BLOCKS,
      COL_BOTTLES, COL_BOTTLE_LOGS, COL_COURSE_TYPES];
    // 并发探测：9 个集合串行查询在真机上要 3 秒以上，正好卡死云函数默认的 3 秒超时
    const probes = await Promise.all(need.map((name) =>
      // eslint-disable-next-line array-callback-return
      db.collection(name).limit(1).get().then((r) => (r && Array.isArray(r.data) ? null : name)).catch(() => name)
    ));
    // 能查出数据 = 集合存在；返回空数组也算存在；null 就是查得到
    const missing = probes.filter((n) => n);
    // 内容安全接口是否可用：真上架时这是硬要求，通没通得一眼看出来。
    // secCheck 内部调用失败会返回 { sec: 'error' }，不会抛出去。
    const sec = await secCheck('浙商大校园自检');
    // 控制台「测试」发起的调用没有微信侧的云调用上下文，openapi 的 access_token
    // 必然无效（-501001），sec 在那里恒为 error 属假警报。只有从小程序端 /
    // 定时触发器发起的调用才带得上鉴权。这里把提示带出去，省得再误判一次。
    const fromClient = Boolean(await me());
    return {
      ok: true,
      missing: missing,
      isMod: await isModerator(await me()),
      // 订阅消息有没有配模板 ID：没配就只是发不出通知，其他功能不受影响
      submsg: await getSubMsgIds(),
      sec: sec.sec || 'ok',
      secErr: sec.secErr || '',
      secNote: fromClient
        ? ''
        : '本次调用来自控制台测试，没有微信侧鉴权上下文，sec 在这里恒为 error 属假警报；请在小程序「我的 → 审核」页看真实结果'
    };
  }

// 待处理队列：把举报和它对应的内容拼在一起，审核页直接能看
async function getQueue(openid) {
  const err = await denyReason(openid);
  if (err) return { ok: false, msg: err };

  const res = await db.collection(COL_REPORTS)
    .where({ status: 'pending' })
    .orderBy('at', 'desc').limit(50).get().catch(() => ({ data: [] }));

  // 并发取回：原来每条举报串行做「查内容 + 查发布者」两次往返，
  // 队列里有十几条时累计超过云函数默认的 3 秒超时（真机上直接 Timeout）。
  const queue = res.data || [];
  const detail = await Promise.all(queue.map((r) => (async () => {
    const content = await fetchTarget(r.targetType, r.targetId);
    const u = await db.collection(COL_USERS).doc(r.target).get().catch(() => null);
    return {
      content: content,
      name: (u && u.data && u.data.nickName) || '某位同学'
    };
  })()));

  const list = [];
  queue.forEach((r, i) => {
    const content = detail[i].content;
    const name = detail[i].name;
    if (!content) {
    list.push({
      repId: r._id, targetId: r.targetId, targetType: r.targetType,
      reason: r.reason, detail: r.detail, time: r.time, targetNick: name,
      desc: '（内容已不存在）', contentStatus: 'gone',
      // 这条票来自正在观察期的同学：系统没拿它自动处置过，得审核员自己看
      reviewOnly: !!r.reviewOnly
    });
      return;
    }
    list.push({
      repId: r._id,
      targetId: r.targetId,
      targetType: r.targetType,
      reason: r.reason,
      detail: r.detail,
      time: r.time,
      targetNick: name,
      title: String(content.title || ''),
      desc: String(content.content || '').slice(0, 160),
      contentStatus: content.status || 'normal',
      // 补上板块和帖子类型：队列里只给标题的话，审核员看不出这条该按哪套规矩判。
      // 「信息墙」帖的正文是空的，按普通帖的印象去判会以为内容不全，
      // 不知道它的设计本来就是把信息收在评论区
      board: String(content.board || ''),
      kind: content.kind === 'topic' ? 'topic' : 'normal',
      // 这条票来自正在观察期的同学：系统没拿它自动处置过，得审核员自己看
      reviewOnly: !!r.reviewOnly
    });
  });

  return { ok: true, list: list, isMod: true };
}

// 批量裁决：
//   reject —— 证据不足，驳回；内容如果在自动阶段被下了架，这里一并恢复
//   confirm —— 违规成立，内容保持下架或直接删除
async function resolveReports(openid, payload) {
  const err = await denyReason(openid);
  if (err) return { ok: false, msg: err };
  payload = payload || {};
  const action = payload.action === 'confirm' ? 'confirm' : 'reject';
  let ids = payload.ids || [];
  if (!Array.isArray(ids)) ids = [ids];
  ids = ids.filter((x) => x);

  if (action === 'reject' && payload.all) {
    // 一键清空队列：最常用的一刀切操作
    const q = await db.collection(COL_REPORTS).where({ status: 'pending' }).limit(100).get().catch(() => ({ data: [] }));
    ids = (q.data || []).map((r) => r._id);
  }
  if (!ids.length) return { ok: true, msg: '队列是空的', handled: 0 };

  let handled = 0;
  for (const id of ids) {
    // 用 where({_id}) 定位而不是 doc(id).get()：doc().get() 对不存在文档的行为
    // 在不同 SDK 版本里不一致（抛错 / 返回空对象 / 返回空数组），where 一定返回数组
    // eslint-disable-next-line no-await-in-loop
    const hit = await db.collection(COL_REPORTS).where({ _id: id }).limit(1).get().catch(() => ({ data: [] }));
    const rec = hit.data && hit.data[0];
    if (!rec || rec.status !== 'pending') continue;

    // eslint-disable-next-line no-await-in-loop
    await db.collection(COL_REPORTS).where({ _id: id }).update({
      // ⚠️ 这里必须落成 status 的规范值 rejected / confirmed。
      //    以前写成 `status: action`，action 在驳回时是 'reject'（单数）——
      //    存进去的既不是 rejected 也不是 confirmed，反滥用那边的统计一个都数不到，
      //    「驳回满 3 次就不再计入」从上线起就是一段死代码。
      //    老数据里可能已经存着 'reject'，所以 abuseState 那边两种写法都认。
      data: {
        status: action === 'confirm' ? 'confirmed' : 'rejected',
        handledBy: openid, handledAt: now()
      }
    }).catch(() => {});

    if (action === 'confirm') {
      // 确认违规：内容保持下架的同时真删掉
      // eslint-disable-next-line no-await-in-loop
      await removeContent(rec.targetType, rec.targetId);
    } else if (rec.targetId) {
      // 驳回时顺手解除自动下架：既然判「证据不足」，就不该让内容继续沉底
      // eslint-disable-next-line no-await-in-loop
      const cur = await fetchTarget(rec.targetType, rec.targetId);
      if (cur && cur.status === 'hidden' && String(cur.hiddenReason || '').indexOf('自动下架') === 0) {
        // eslint-disable-next-line no-await-in-loop
        await setContentStatus(rec.targetType, rec.targetId, 'normal', '');
      }
    }
    handled += 1;
  }
  return { ok: true, msg: action === 'confirm' ? '已确认违规' : '已驳回，内容已恢复', handled: handled };
}

// 审核员手动恢复 / 下架单条内容，作者本人也能恢复自己被自动下架的
async function setStatus(openid, payload) {
  payload = payload || {};
  const targetId = String(payload.targetId || '');
  const targetType = payload.targetType === 'review' ? 'review' : 'post';
  // 'deleted' 也认：举报自动处置要在作者 / 审核员的手机上同步标成已删除
  const status = (payload.status === 'hidden' || payload.status === 'deleted') ? payload.status : 'normal';
  if (!targetId) return { ok: false, msg: '参数缺失' };

  const content = await fetchTarget(targetType, targetId);
  if (!content) return { ok: false, msg: '内容不存在' };

  const mine = String(content.openid || content._openid || content.authorOpenid || '') === openid;
  if (!(await isModerator(openid)) && !mine) return { ok: false, msg: '只能处理自己的内容' };

  await setContentStatus(targetType, targetId, status,
    status === 'hidden' ? '审核员手动下架' : (status === 'deleted' ? '被多名同学举报，已自动删除' : ''));
  return {
    ok: true,
    msg: status === 'hidden' ? '已下架' : (status === 'deleted' ? '已标记为删除' : '已恢复展示')
  };
}

// 内容删除 / 更新统一走云函数：客户端 SDK 在安全规则下只能改删「自己创建」的记录，
// 且不允许 where().remove() 批量删除。示例帖的 _openid 是空的，「仅创建者可写」权限下
// 前端一条都删不掉，本地删了云端还在，下次同步又回来——「删了重进还在」就是它。
function isContentOwner(content, openid) {
  return [content.openid, content._openid, content.authorOpenid]
    .some((v) => v && v === openid);
}

async function hasContentRight(openid, content) {
  if (isContentOwner(content, openid)) return true;
  return isModerator(openid);
}

// 删除一条内容（帖子或评价），云函数是管理员身份，能删任何记录
async function delContent(openid, payload) {
  payload = payload || {};
  const targetType = payload.targetType === 'review' ? 'review' : 'post';
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  const content = await fetchTarget(targetType, id);
  if (!content) return { ok: true }; // 已经不在了，视为成功
  if (!(await hasContentRight(openid, content))) return { ok: false, msg: '没有权限删除这条内容' };
  const col = targetType === 'review' ? COL_REVIEWS : COL_POSTS;
  await db.collection(col).where({ id: id }).remove().catch(() => {});
  return { ok: true };
}

// 更新一条内容的允许字段（点赞计数 / 评论 / 评价内容 / 状态）
async function patchContent(openid, payload) {
  payload = payload || {};
  const targetType = payload.targetType === 'review' ? 'review' : 'post';
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  const content = await fetchTarget(targetType, id);
  if (!content) return { ok: false, msg: '内容不存在' };
  if (!(await hasContentRight(openid, content))) return { ok: false, msg: '没有权限修改这条内容' };
  const allow = targetType === 'review'
    ? ['score', 'content', 'tags', 'anonymous', 'updatedAt', 'status', 'hiddenReason']
    : ['likes', 'comments', 'status', 'hiddenReason'];
  const data = {};
  const patch = payload.patch || {};
  allow.forEach((k) => { if (patch[k] !== undefined) data[k] = patch[k]; });
  if (!Object.keys(data).length) return { ok: true };
  const col = targetType === 'review' ? COL_REVIEWS : COL_POSTS;
  await db.collection(col).where({ id: id }).update({ data: data }).catch(() => {});
  return { ok: true };
}

/* ---------------- 内容写入（服务端权威校验） ---------------- */

// 微信官方内容安全接口。
// 屏蔽词是我们自己列的（社区自治），官方接口才是平台合规的底线 —— 真上架时审核会看这个。
// ⚠️ 接口没开通 / 调用失败时一律「放过」而不是「拦截」：
//    接口故障把正常内容全卡死，比漏掉一条的代价大得多。开通后在 diag 里能看到状态。
async function secCheck(text) {
  const s = String(text || '').trim();
  if (!s) return { ok: true };
  if (s.length > 2500) return { ok: false, msg: '内容太长了，拆成几条发吧' };
  if (!cloud.openapi || !cloud.openapi.security) return { ok: true, sec: 'unavailable' };
  try {
    const r = await cloud.openapi.security.msgSecCheck({ content: s });
    const sug = r && r.result && r.result.suggestion;
    if (sug === 'block') return { ok: false, msg: '内容可能包含违规信息，换个说法试试' };
    if (sug === 'review') return { ok: true, needReview: true };
    return { ok: true };
  } catch (e) {
    // 87093（敏感词库异常）/ 42001（token 过期）都不代表内容真的违规
    // 把报错带出来：diag 靠它区分「没权限」还是「接口抽风」，否则永远在猜
    const detail = String((e && (e.errMsg || e.errCode)) || (e && e.message) || e || '').slice(0, 200);
    console.error('[secCheck] msgSecCheck failed:', detail);
    return { ok: true, sec: 'error', secErr: detail };
  }
}

// 把数据库报错翻译成人话。
// 直接把 "-502005 database collection not exists" 抛给用户没人看得懂，
// 但把错误码带出去，前端就能提示「哪个集合还没建」，用户不用对着黑盒猜。
function dbErr(e) {
  const raw = String((e && (e.errMsg || e.message)) || e || '');
  const code = (raw.match(/-\d{6}/) || [''])[0];
  const tail = (raw.match(/-\d{6}\s*(.*)/) || [, ''])[1];
  return { code: code, msg: (tail || raw).slice(0, 160) };
}

// 所有 UGC 写入的统一关口：先过屏蔽词，再过官方接口。
// 前端那侧再怎么校验，绕过云函数直接写库也躲不过这一关。
async function guard(...parts) {
  const hit = checkText.apply(null, parts);
  if (!hit.ok) return hit;
  return secCheck(parts.join(' '));
}

// 发帖专用：按板块决定要不要放行「加群 / 留联系方式」那几个词。
// 官方内容安全接口（secCheck）照常过 —— 豁免的只是我们自己的词表，
// 涉黄涉赌那些官方接口自己会拦，不归这里管
async function guardInBoard(board, ...parts) {
  const hit = checkTextInBoard(board, ...parts);
  if (!hit.ok) return hit;
  return secCheck(parts.join(' '));
}

// 帖子类型：normal（默认）| topic（主题帖）。
// 主题帖只有标题、没有正文，具体信息全在评论区由同学自己补 ——
// 「浙工商同好群」这种贴用得着：标题写清楚要找什么，群号、二维码留给评论区。
//
// 为什么发这条帖子类型，而不是直接「正文留空就行」：
//   正文可空 ≠ 帖子可空。不加这一档，想发信息墙的人只能发个空正文的普通帖，
//   列表页看不出那是信息墙，同学点进去一脸茫然，评论区还不受任何约束。
//   有了类型，界面、排序、信息收集规则才能各自对上号。
function isTopicPost(p) {
  return String((p && p.kind) || '') === 'topic';
}

async function postAdd(openid, payload) {
  payload = payload || {};
  const p = payload.post || {};
  const title = String(p.title || '').trim();
  const content = String(p.content || '').trim();
  const topic = isTopicPost(p);
  if (!title) return { ok: false, msg: topic ? '给这个主题起个名字' : '写点什么再发吧' };
  if (title.length > 60) return { ok: false, msg: '标题最多 60 个字' };
  // 主题帖的定义就是「不带正文」：正文一旦填了，它就是个普通帖，
  // 拦下来不是刁难，是免得「信息墙」变成绕过正文审核的偏门
  if (topic && content) return { ok: false, msg: '主题帖不写正文，信息留给评论区' };
  if (!topic && !content) return { ok: false, msg: '写点什么再发吧' };
  if (content.length > 2000) return { ok: false, msg: '正文最多 2000 个字' };
  // 按板块校验：社团同好 / 活动组队这类地方，留群号联系方式是正常内容。
  // 主题帖照样过这道 —— 空正文不是免检牌，「求一个靠谱的代写」照样被拦
  const g = await guardInBoard(p.board, title, content);
  if (!g.ok) return { ok: false, msg: g.msg };
  const doc = {
    id: String(p.id || ('p' + Date.now() + Math.floor(Math.random() * 1000))),
    board: String(p.board || ''),
    title: title,
    content: content,
    kind: topic ? 'topic' : 'normal',
    // 作者身份一律以调用者为准，前端传什么都改不了
    author: String(p.author || '浙小商').slice(0, 20),
    authorOpenid: openid,
    openid: openid,
    time: p.time || now(),
    at: Number(p.at) || Date.now(),
    images: Array.isArray(p.images) ? p.images.slice(0, 9) : [],
    courseId: String(p.courseId || ''),
    courseName: String(p.courseName || ''),
    comments: [],
    likes: 0,
    likedBy: [],
    pinned: false,
    // 匿名只是「列表里不显示作者」，服务端照样认得出是谁写的，被举报能追到人
    anonymous: !!p.anonymous,
    status: 'normal'
  };
  // 写库成功/失败必须如实上报。以前这里 .catch(() => {}) 把一切吞掉照样返回 ok:true，
  // 前端就提示「发布成功」，内容却压根没进数据库 —— 用户看到的就是「写完好好的一转头没了」。
  const w = await db.collection(COL_POSTS).add({ data: doc }).catch((e) => ({ err: e }));
  if (w && w.err) {
    const d = dbErr(w.err);
    console.error('[postAdd] write failed:', d.code, d.msg);
    // saved:false 告诉前端「这是存储失败不是内容违规」，本地那份别删
    return { ok: false, saved: false, msg: '云端没存住', detail: (d.code + ' ' + d.msg).trim() };
  }
  return { ok: true, post: doc };
}

// 一条内容最多能收多少条留言。
// 主题帖的价值在于「信息收得全」，但不限量的话它会在一小时内被同一个人刷满，
// 真正的群号被淹没在最底下 —— 这不是审核问题，是可用性问题
const COMMENT_CAP = 200;
// 同一个人对同一条内容，两次留言之间至少隔这么久。
// 连点发送、脚本刷屏都在这道闸上
const COMMENT_GAP_MS = 60 * 1000;

// 评论也走云函数：① 服务端过审 ② 顺便给作者推订阅消息。
// 客户端直连 patch 评论数组既能绕过审核，也发不出通知。
async function postComment(openid, payload) {
  payload = payload || {};
  const postId = String(payload.postId || '');
  const content = String(payload.content || '').trim().slice(0, 300);
  if (!postId) return { ok: false, msg: '参数缺失' };
  if (!content) return { ok: false, msg: '说点什么再发吧' };
  const g = await guard(content);
  if (!g.ok) return { ok: false, msg: g.msg };

  const hit = await db.collection(COL_POSTS).where({ id: postId }).limit(1).get().catch(() => ({ data: [] }));
  const rec = hit.data && hit.data[0];
  if (!rec) return { ok: false, msg: '这条内容已经不存在了' };

  const comments = Array.isArray(rec.comments) ? rec.comments : [];
  // 信息墙的三道闸。普通帖的评论区不设防也过得去，
  // 但主题帖就是把别人的联系方式聚到一处 —— 它是全网最容易被拿来刷的地方，
  // 不设闸等于给贴广告的人发了一张不用审查的通行证。
  //
  // ① 总量：一条内容收满就收手，让下一个人另开一条，别让最后几条沉到底下
  if (comments.length >= COMMENT_CAP) {
    return { ok: false, msg: '这条主题已经收满 ' + COMMENT_CAP + ' 条了，换一条发吧' };
  }
  // ② 重复：同一个人对同一条内容只收一次同样的信息。
  //    留错群号、群满了再补一个，那是有用的；把同一个群号连发二十遍刷屏，不是
  const dup = comments.some((c) =>
    String(c.authorOpenid || c._openid || '') === openid &&
    String(c.content || '').trim() === content);
  if (dup) return { ok: false, msg: '这条信息你留过了，换一条吧' };
  // ③ 频率：一分钟一条。手抖点两下、脚本连发，都落在这儿
  const mine = comments.filter((c) => String(c.authorOpenid || c._openid || '') === openid);
  const last = mine[mine.length - 1];
  if (last && Date.now() - (Number(last.at) || 0) < COMMENT_GAP_MS) {
    return { ok: false, msg: '慢一点，一分钟以后再留下一条' };
  }

  const comment = {
    id: 'c' + Date.now() + Math.floor(Math.random() * 1000),
    author: String(payload.author || '浙小商').slice(0, 20),
    authorOpenid: openid,
    content: content,
    time: now(),
    at: Date.now()
  };
  const next = comments.concat([comment]);
  // 写不进去必须如实说：原来这里 .catch 掉了错误照样 return ok:true，
  // 同学看到的永远是「评论成功」，刷新才发现根本没留下来
  const cw = await db.collection(COL_POSTS).where({ id: postId })
    .update({ data: { comments: next } }).catch((e) => ({ err: e }));
  if (cw && cw.err) {
    const d = dbErr(cw.err);
    console.error('[postComment] write failed:', d.code, d.msg);
    return { ok: false, saved: false, msg: '没加上，再试一次', detail: (d.code + ' ' + d.msg).trim() };
  }

  // 自己评论自己不发通知
  const authorOid = String(rec.openid || rec.authorOpenid || rec._openid || '');
  if (authorOid && authorOid !== openid) {
    sendSubMsg(authorOid, 'reply', {
      page: 'pages/forum/detail/detail?id=' + postId,
      fields: {
        thing1: { value: (String(payload.author || '同学') + ' 回复了你').slice(0, 20) },
        thing2: { value: (String(rec.title || '你发布的帖子').slice(0, 20)) || '你发布的帖子' },
        thing3: { value: content.slice(0, 20) },
        time4: { value: now() }
      }
    });
  }
  return { ok: true, comment: comment, comments: next };
}

// 删掉一条留言。
//
// 这个口子是为「信息墙」开的，但它对普通帖也有效 —— 发完发现说错了想撤回来，
// 总比等审核员来处理强。
//
// 谁能删，按下面三档认，服务端这里是权威：
//   ① 留言的作者本人（我留错了，我来撤）；
//   ② 这条内容的作者（信息墙的主人，唯一有动力维护它的人）；
//   ③ 审核员（别人留了广告，帖主没空处理）。
// 认不出就只有一句提示 —— 以前「自己的帖子删不掉」的坑就是少这一层校验造成的。
async function commentRemove(openid, payload) {
  payload = payload || {};
  const postId = String(payload.postId || '');
  const commentId = String(payload.commentId || '');
  if (!postId || !commentId) return { ok: false, msg: '参数缺失' };

  const hit = await db.collection(COL_POSTS).where({ id: postId }).limit(1).get().catch(() => ({ data: [] }));
  const rec = hit.data && hit.data[0];
  if (!rec) return { ok: false, msg: '这条内容已经不存在了' };

  const comments = Array.isArray(rec.comments) ? rec.comments : [];
  const target = comments.find((c) => c.id === commentId);
  if (!target) return { ok: false, msg: '这条留言已经不在了' };

  const isAuthorOfPost = String(rec.openid || rec.authorOpenid || rec._openid || '') === openid;
  const isAuthorOfComment = String(target.authorOpenid || target._openid || '') === openid;
  const isMod = await isModerator(openid);
  if (!isAuthorOfComment && !isAuthorOfPost && !isMod) {
    return { ok: false, msg: '只有本人、帖主或审核员能删这条留言' };
  }

  const next = comments.filter((c) => c.id !== commentId);
  await db.collection(COL_POSTS).where({ id: postId })
    .update({ data: { comments: next } }).catch(() => {});
  return { ok: true, comments: next };
}

// 留言要不要直接删。跟帖子共用一套「人数 + 证据」的思路，只是门槛低一档 ——
// 留言没有「下架」这个中间态：要么留着，要么没了，所以这里只有删与不删。
async function decideCommentAction(post, comment, commentId, excludeOpenid) {
  const reports = (await recentReports(commentId))
    .filter((r) => !excludeOpenid || String(r.openid || '') !== String(excludeOpenid));
  const total = reports.length;
  const risky = reports.filter((r) => MOD_RULES.HIGH_RISK.indexOf(r.reason) >= 0).length;
  // 留言自己踩没踩屏蔽词：信息墙的正文是空的，能藏脏东西的地方只有留言本身，
  // 这条信号比「有没人写说明」更硬
  // ⚠️ 没命中时这个函数返回的是 { ok: true }，根本没有 hit 字段 ——
  //    直接 .hit.length 会让整个举报流程当场抛错（返回 undefined 给前端，
  //    同学点了举报什么都没发生），所以这里必须兜一下
  const blocked = (checkTextInBoard(
    post.board, '', String((comment && comment.content) || '')
  ).hit || []).length > 0;

  // 留言没有「下架」这个中间态（它长在帖子的 comments 里，只有删/不删两档），
  // 所以冷启动期只调低删除门槛，不另设下架档
  const cold = (await communityReports()) < MOD_RULES.COLD_REPORTS;
  const needDel = cold ? MOD_RULES.COLD_COMMENT_DELETE : MOD_RULES.COMMENT_DELETE_THRESHOLD;
  const needDelRisky = cold ? 1 : MOD_RULES.COMMENT_HIGH_RISK_DELETE;

  let del = false;
  if (total >= needDel) {
    // 冷启动 2 人 / 平时 3 个人都说这条不行 —— 不用再等人工，人数本身够说明问题
    del = true;
  } else if (risky >= needDelRisky && (anyProof(reports) || blocked)) {
    // 冷启动 1 个 / 平时 2 个人指认广告 / 隐私 / 违规交易，
    // 而且至少有一条拿得出可查的线索（或留言自己踩了屏蔽词）
    //
    // 留言踩词这一条比在帖子上更硬：留言就是信息墙的全部内容，
    // 它命中的只能是真违规用词，不像正文里可能只是顺带提了一句
    del = true;
  }
  return { del: del, total: total, risky: risky, blocked: blocked, cold: cold };
}

// 举报一条留言：凑够人数就自动删，不用运营同学亲手去点。
//
// 为什么要做这条：留言是信息墙的全部内容，却是最没人愿意管的那一块 ——
// 群会过期、有人留错群、有人塞广告，而运营是一个人，不可能天天盯着每条留言。
// 「多人举报 → 自动删除」把这块也收进自动处置，人工只留给真正的疑难。
async function commentReport(openid, payload) {
  payload = payload || {};
  const postId = String(payload.postId || '');
  const commentId = String(payload.commentId || '');
  const rawReason = String(payload.reason || '');
  const reason = REPORT_REASONS.indexOf(rawReason) >= 0 ? rawReason : '其他';
  const detail = String(payload.detail || '').slice(0, 200);
  if (!postId || !commentId) return { ok: false, msg: '没指名要举报哪条留言' };

  // ① 这条留言得真的存在 —— 对着一条已经不在的留言投票，票数永远进不了统计
  const rec = await byId(COL_POSTS, postId).limit(1).get().catch(() => ({ data: [] }));
  const post = rec.data && rec.data[0];
  if (!post) return { ok: false, msg: '这条内容已经不存在了' };
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const target = comments.find((c) => c.id === commentId);
  if (!target) return { ok: false, msg: '这条留言已经不在了' };

  // ② 反滥用：跟帖子那边同一个口径。观察期里的票照样记、照样进队列，
  //    只是不参与这条留言的自动删除判定
  const ab = await abuseState(openid);

  // ③ 查重：同一个人对同一条留言同一理由只算一次。
  //    有人看不顺眼想把它按下去，连点二十下没用；真要举报得换个人
  const dup = await db.collection(COL_REPORTS)
    .where({ openid: openid, targetId: commentId, targetType: 'comment', reason: reason })
    .limit(1).get().catch(() => ({ data: [] }));
  if (dup.data && dup.data.length) {
    return { ok: true, msg: '你已经举报过这条留言了' };
  }

  await addReportDoc({
    openid: openid,
    target: String(target.authorOpenid || target._openid || ''),
    targetId: commentId,
    postId: postId,
    targetType: 'comment',
    reason: reason,
    detail: detail,
    status: 'pending', // pending → rejected（证据不足）/ confirmed（违规成立）
    time: now(),
    at: Date.now(),
    reviewOnly: !!ab.limited
  });

  const verdict = await decideCommentAction(
    post, target, commentId, ab.limited ? openid : ''
  );
  if (verdict.del) {
    const next = comments.filter((c) => c.id !== commentId);
    await db.collection(COL_POSTS).where({ id: postId })
      .update({ data: { comments: next } }).catch(() => {});
    return {
      ok: true, removed: true, comments: next, total: verdict.total,
      reviewOnly: !!ab.limited,
      msg: verdict.total > 1
        ? '举报已提交，这条留言因为多人举报已经自动删掉'
        : '举报已提交，这条留言因为被举报已经自动删掉'
    };
  }
  return {
    ok: true, removed: false, total: verdict.total,
    reviewOnly: !!ab.limited,
    msg: ab.limited
      ? '举报已收到，会由老师优先核实'
      : '举报已提交，会被一起计入判定'
  };
}

async function reviewAdd(openid, payload) {
  payload = payload || {};
  const r = payload.review || {};
  const courseId = String(r.courseId || '');
  const content = String(r.content || '').trim();
  const score = Number(r.score) || 0;
  if (!courseId) return { ok: false, msg: '这条评价挂在哪个课程下？' };
  if (score < 1 || score > 5) return { ok: false, msg: '打个分吧，1 到 5 星' };
  if (content.length > 1000) return { ok: false, msg: '评价最多 1000 个字' };
  const g = await guard(content);
  if (!g.ok) return { ok: false, msg: g.msg };
  // 这里刻意不校验「课程在不在库里」：误伤的代价是同学给一门明明存在的课发不出评价，
  // 比几条孤儿评价严重得多。删课时 dropCourseDoc 已经把评价一起清了，够用
  const doc = {
    id: String(r.id || ('r' + Date.now() + Math.floor(Math.random() * 1000))),
    courseId: courseId,
    courseName: String(r.courseName || ''),
    score: score,
    content: content,
    tags: Array.isArray(r.tags) ? r.tags.slice(0, 8) : [],
    // 任课老师：评价可以只针对某一位老师。同学填的名字不会自动变成「官方认定」，
    // 名录里查得到只是打一个 verified:true 的标记，方便别人一眼看出这人真是浙工商的。
    teacher: String(r.teacher || '').trim().slice(0, 20),
    teacherVerified: false,
    // 给这位老师的分，和上面给课程的分是两档。留 0 = 没单独给老师打分，
    // 聚合老师均分时跳过，不把「没表态」的人算成「差评」。
    teacherScore: Math.max(0, Math.min(5, Math.round(Number(r.teacherScore) || 0))),
    // 匿名只是「前端不显示作者」，服务端照样认得出是谁写的，方便事后追责
    anonymous: !!r.anonymous,
    openid: openid,
    author: String(r.author || '浙小商').slice(0, 20),
    time: r.time || now(),
    at: Number(r.at) || Date.now(),
    status: 'normal',
    helpful: 0
  };
  // 同 postAdd：写不进去绝不能报成功，否则前端撤掉本地、用户以为发过了
  const w = await db.collection(COL_REVIEWS).add({ data: doc }).catch((e) => ({ err: e }));
  if (w && w.err) {
    const d = dbErr(w.err);
    console.error('[reviewAdd] write failed:', d.code, d.msg);
    return { ok: false, saved: false, msg: '云端没存住', detail: (d.code + ' ' + d.msg).trim() };
  }
  // 写了老师名就顺手校一次名录：命中就打个标记，列表里显示「✓ 官方名录」。
  // 不查就不打，同学自己加的老师照样能用，只是没有那个勾。
  if (doc.teacher) {
    const hit = await db.collection(COL_TEACHERS)
      .where({ name: doc.teacher }).limit(1).get().catch(() => ({ data: [] }));
    if (hit.data && hit.data.length) {
      await db.collection(COL_REVIEWS).where({ id: doc.id }).update({
        data: { teacherVerified: true }
      }).catch(() => {});
      doc.teacherVerified = true;
    }
  }
  return { ok: true, review: doc };
}

// 认出「一门课在云端是哪条记录」。为什么不能只认 id：
//   ① 现在这条：courseAdd 会把客户端给的 id 一起存下来，前端那个 id 就是云端这个 id；
//   ② 老数据： courseAdd 早先没存 id，云端只有自动生成的 _id，
//              而前端手里那个 id 是它自己生成的字符串，两边对不上；
//   ③ 只认得课名（老客户端、或从分享链接进去）。
// 认不出课 = 删不掉课，误加的那门课就永久挂在那里，正是要修的那件事。
// 所以按 id / _id / 课名依次兜底，但同名多条时必须停下交给人来决定，
// 不能闭眼删掉其中一个 —— 那可能删掉的是别人正经加的课。
async function findCourseDoc(courseId, name) {
  const id = String(courseId || '').trim();
  const nm = String(name || '').trim();
  const conds = [];
  if (id) conds.push({ id: id });
  if (nm) conds.push({ name: nm });
  if (!conds.length) return { notFound: true };

  const res = await db.collection(COL_COURSES)
    .where(db.command.or(conds)).limit(20).get().catch(() => ({ data: [] }));
  const all = (res && res.data) || [];

  const byId = all.filter((c) => id && (String(c.id) === id || String(c._id) === id));
  if (byId.length === 1) return { doc: byId[0] };

  const byName = all.filter((c) => String(c.name) === nm);
  if (byName.length === 1) return { doc: byName[0] };
  if (byName.length > 1) {
    // 同名好几分：同学自己加的那条优先（它有 openid），仍然分不清就拒绝
    const userMade = byName.filter((c) => !c.builtin && (c.openid || c._openid));
    if (userMade.length === 1) return { doc: userMade[0] };
    return { ambiguous: true };
  }
  return { notFound: true };
}

async function courseAdd(openid, payload) {
  payload = payload || {};
  const c = payload.course || {};
  const name = String(c.name || '').trim();
  if (!name) return { ok: false, msg: '课程名得写一下' };
  if (name.length > 60) return { ok: false, msg: '课程名最多 60 个字' };
  const g = await guard(name, String(c.teacher || ''), String(c.term || ''));
  if (!g.ok) return { ok: false, msg: g.msg };
  // 客户端那个 id 必须一起存：云端这条和本地那份说的是同一门课，
  // 只留一份不给 id，后面按 id 就永远查不到它，误加的课也跟着永远删不掉
  const doc = {
    id: String(c.id || '').trim().slice(0, 40),
    name: name,
    teacher: String(c.teacher || '').slice(0, 30),
    credit: Number(c.credit) || 0,
    college: String(c.college || '').slice(0, 30),
    term: String(c.term || '').slice(0, 30),
    description: String(c.description || '').slice(0, 200),
    // 课程类型：同学手挑的优先（过一遍名册认不认得出），没挑才按课名推断 ——
    // 官方课目录里几乎全是专业课，光靠课名推不出「体育课 / 思政课」，
    // 让加课的人自己说一句是最靠谱的那份数据
    ctype: require('./course-type.js').pickCourseType(c.ctype, name),
    builtin: false,
    openid: openid,
    at: Date.now()
  };
  // 同学共建课程同样不能「写失败还报成功」，否则全校都看不到这门课
  const w = await db.collection(COL_COURSES).add({ data: doc }).catch((e) => ({ err: e }));
  if (w && w.err) {
    const d = dbErr(w.err);
    console.error('[courseAdd] write failed:', d.code, d.msg);
    return { ok: false, saved: false, msg: '云端没存住', detail: (d.code + ' ' + d.msg).trim() };
  }
  return { ok: true, course: doc };
}

// 删除同学自己误加的课程。
// 两条硬规矩：
//   ① 只能删自己加的那门（比对 openid），别人的课删不掉；
//   ② 官方课程（builtin / 没有 openid 的）一律删不了 —— 那是全校共用的课程库。
// 认课交给 findCourseDoc：id 对不上的老数据（云端只有 _id）也得能删，
// 不然误加的课云端留着、下次同步又冒出来，就是「删了重进还在」。
async function courseRemove(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '').trim();
  const name = String(payload.name || '').trim();
  if (!id && !name) return { ok: false, msg: '参数缺失' };

  const f = await findCourseDoc(id, name);
  if (f.notFound) {
    // 云端没有不代表删不掉：可能只在本地加过。前端据此照常清掉本地那份。
    return { ok: true, removed: 0, notFound: true };
  }
  if (f.ambiguous) return { ok: false, msg: '同名课程有好几条，删不掉这门，请联系管理员处理' };
  const course = f.doc;
  if (course.builtin) return { ok: false, msg: '官方课程不能删除' };

  const owner = String(course.openid || course._openid || '');
  if (!owner || owner !== openid) return { ok: false, msg: '只能删除自己添加的课程' };

  // 永远按云端主键 _id 删：按「本地那份 id」删会误伤别的记录
  const w = await db.collection(COL_COURSES).where({ _id: course._id })
    .remove().catch((e) => ({ err: e }));
  if (w && w.err) {
    const d = dbErr(w.err);
    console.error('[courseRemove] remove failed:', d.code, d.msg);
    return { ok: false, msg: '云端没删掉', detail: (d.code + ' ' + d.msg).trim() };
  }
  return { ok: true, removed: 1 };
}

/* ---------------- 误加课程的「申请删除」 ---------------- */

// 为什么需要这个：加课程的人一旦毕业 / 换号 / 只是懒得管，这门误加的课就永远挂在库里，
// 谁都删不掉（删课只认加课人的 openid）。所以再开一条路：
// 其他同学也能提交删除申请，同一个人只能投一次，凑够票数自动清掉。
const COURSE_REQ_VOTES = 3;          // 几个人同意就自动删（除加课人本人一票即算）
const COURSE_REQ_DAYS = 14;          // 申请超过这个天数没人再附和，自动作废，不留一堆僵尸申请

// 删课时顺手收拾干净：挂在这门课下的评价 + 它的申请记录一起走。
// 评价不一起删会留在库里变成孤儿（courseId 指向一门已经不存在的课），
// 哪天 id 复用就串到别人课下去了。
async function dropCourseDoc(key, course) {
  const docId = String((course && course._id) || '');
  if (!docId) return;
  const idField = String((course && course.id) || '');
  // 评价里记的 courseId 是前端那个 id，可能跟云端主键对不上，两种都要扫一遍
  if (idField) await db.collection(COL_REVIEWS).where({ courseId: idField }).remove().catch(() => {});
  await db.collection(COL_REVIEWS).where({ courseId: docId }).remove().catch(() => {});
  if (key) await db.collection(COL_COURSE_REQS).where({ id: courseReqId(key) }).remove().catch(() => {});
}

// 把一门课从云端彻底拿走：课程本身 + 挂在它下面的评价 + 它的申请记录。
// 漏掉评价会留下无主数据，漏掉申请记录会让下次又重新开始凑票。
async function dropCourseCloud(course) {
  const docId = String((course && course._id) || '');
  if (!docId) return { ok: true };
  const del = await db.collection(COL_COURSES).where({ _id: docId })
    .remove().catch((e) => ({ err: e }));
  if (del && del.err) {
    const d = dbErr(del.err);
    return { ok: false, msg: '云端没删掉', detail: (d.code + ' ' + d.msg).trim() };
  }
  await dropCourseDoc(String((course && course.id) || '') || docId, course);
  return { ok: true };
}

// 申请的主键：一门课一条记录，避免同一门课攒出十几条申请
function courseReqId(courseId) {
  return 'cr' + String(courseId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
}

// 顺手清掉过期的申请：每次读写前扫一遍，比单独挂定时任务省事
async function pruneCourseReqs(rows) {
  const now = Date.now();
  const dead = (rows || []).filter((r) => r.at && (now - Number(r.at)) > COURSE_REQ_DAYS * 86400000);
  for (let i = 0; i < dead.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection(COL_COURSE_REQS).where({ id: dead[i].id }).remove().catch(() => {});
  }
  const deadIds = dead.map((r) => r.id);
  return (rows || []).filter((r) => deadIds.indexOf(r.id) < 0);
}

// 投票 + 达票自动删。返回里的 removed 告诉前端「这门课已经没了，把本地那份也清掉」
async function courseReqVote(openid, payload) {
  payload = payload || {};
  const courseId = String(payload.courseId || '').trim();
  const name = String(payload.name || '').trim();
  const reason = String(payload.reason || '').trim().slice(0, 100);
  if (!courseId && !name) return { ok: false, msg: '参数缺失' };

  const f = await findCourseDoc(courseId, name);
  if (f.notFound) {
    // 云端本来就没有（可能只在本地加过）：告诉前端照常清本地那份
    return { ok: true, removed: 1, notFound: true, msg: '这门课云端本来就没有，已清理' };
  }
  if (f.ambiguous) return { ok: false, msg: '同名课程有好几条，删不掉这门，请联系管理员处理' };
  const course = f.doc;
  if (course.builtin) return { ok: false, msg: '官方课程不能删除' };

  // 申请记录按云端主键认课：前端那个 id 在老数据里对不上云端主键，
  // 用它当主键会让同一门课攒出好几条互不相认的申请，票永远凑不齐
  const key = String(course.id || course._id || '');
  const owner = String(course.openid || course._openid || '');
  // 加课人自己点一下就删，不用凑票 —— 他要删，没理由拦
  if (owner && owner === openid) {
    const d = await dropCourseCloud(course);
    if (!d.ok) return { ok: false, saved: false, msg: d.msg, detail: d.detail };
    return { ok: true, removed: 1, owner: true };
  }

  const rid = courseReqId(key);
  const q = await db.collection(COL_COURSE_REQS).where({ id: rid }).limit(1).get().catch(() => ({ data: [] }));
  const rec = (q.data || [])[0];
  const voters = rec && Array.isArray(rec.voters) ? rec.voters.slice() : [];
  if (voters.indexOf(openid) >= 0) {
    return { ok: true, already: true, votes: voters.length, need: COURSE_REQ_VOTES };
  }
  // 审核员一票即可：这条通道本来就是给「管理员收尾」用的
  const mod = await isModerator(openid);

  // 攒票用 push 追加，不整份读出来再整份写：两个同学同时点投票时，
  // 后写的那份会盖掉先写的，voters 停在 1 条，永远凑不满 3 票，
  // 误加的课程就靠这条通道删不掉（这段代码的初衷）
  if (!rec) {
    const nd = {
      id: rid, courseId: key, courseName: String(course.name || '').slice(0, 40),
      voters: [openid], reasons: reason ? [reason.slice(0, 60)] : [],
      at: Date.now(), lastAt: Date.now(), status: 'open'
    };
    const aw = await db.collection(COL_COURSE_REQS).add({ data: nd }).catch((e) => ({ err: e }));
    if (aw && aw.err) {
      const d = dbErr(aw.err);
      console.error('[courseReqVote] add failed:', d.code, d.msg);
      return { ok: false, saved: false, msg: '申请没记上，再试一次', detail: (d.code + ' ' + d.msg).trim() };
    }
    const enough = mod || 1 >= COURSE_REQ_VOTES;
    if (enough) return finishCourseReq(course, rid, 1, mod);
    return { ok: true, votes: 1, need: COURSE_REQ_VOTES, byMod: mod };
  }

  // 认业务主键 id 而不是 doc()：doc() 得靠 _id 找，而这条记录是 add 出来的，
  // 两边对不上就会写出一条「同课两份」的孪生记录，票数各算各的永远凑不齐
  const uw = await db.collection(COL_COURSE_REQS).where({ id: rid }).update({
    data: {
      voters: db.command.push(openid),
      reasons: reason ? db.command.push(reason.slice(0, 60)) : db.command.push([]),
      lastAt: Date.now()
    }
  }).catch((e) => ({ err: e }));
  if (uw && uw.err) {
    const d = dbErr(uw.err);
    console.error('[courseReqVote] write failed:', d.code, d.msg);
    return { ok: false, saved: false, msg: '投票没记上，再试一次', detail: (d.code + ' ' + d.msg).trim() };
  }
  // 票数以库里那份为准：客户端怎么刷都刷不出第二票
  const fq = await db.collection(COL_COURSE_REQS).where({ id: rid }).limit(1).get().catch(() => ({ data: [] }));
  const fqr = fq && fq.data ? fq.data[0] : null;
  const count = fqr && Array.isArray(fqr.voters) ? fqr.voters.length : 0;
  const enough = mod || count >= COURSE_REQ_VOTES;
  if (enough) return finishCourseReq(course, rid, count, mod);
  return { ok: true, votes: count, need: COURSE_REQ_VOTES, byMod: mod };
}

// 票凑够了，这门课从云端拿走：课程本身 + 挂着的评价 + 申请记录一起收拾干净。
// 评价不删会变成孤儿（courseId 指向一门已经不存在的课），留着不如一起删掉
async function finishCourseReq(course, rid, count, mod) {
  const d = await dropCourseCloud(course);
  if (!d.ok) return { ok: false, saved: false, msg: d.msg, detail: d.detail };
  await db.collection(COL_COURSE_REQS).where({ id: rid }).remove().catch(() => {});
  return { ok: true, removed: 1, votes: count, byMod: !!mod };
}

// 这门课上有没有人正在申请删除：详情页要看，好把「申请删除」的按钮状态显示对
async function courseReqInfo(openid, payload) {
  payload = payload || {};
  const courseId = String(payload.courseId || '').trim();
  const name = String(payload.name || '').trim();
  if (!courseId && !name) return { ok: false, msg: '参数缺失' };
  // 先用云端真实的课 id：前端那个 id 对不上老数据时，得靠课名兜一层，
  // 否则按钮上永远显示「0/3」，同学会以为申请根本没提交上去
  let key = courseId;
  const f = await findCourseDoc(courseId, name);
  if (f.doc && !f.doc.builtin) key = String(f.doc.id || f.doc._id || courseId);
  const q = await db.collection(COL_COURSE_REQS)
    .where({ id: courseReqId(key) }).limit(1).get().catch(() => ({ data: [] }));
  let rec = (q.data || [])[0];
  if (rec && rec.at && (Date.now() - Number(rec.at)) > COURSE_REQ_DAYS * 86400000) rec = null;
  const voters = (rec && Array.isArray(rec.voters)) ? rec.voters : [];
  return {
    ok: true,
    votes: voters.length,
    need: COURSE_REQ_VOTES,
    mine: voters.indexOf(openid) >= 0,
    courseName: (rec && rec.courseName) || '',
    lastReason: (rec && rec.reasons && rec.reasons[rec.reasons.length - 1]) || ''
  };
}

/* ================= 课程类型纠错 =================
 * 官网课程目录不带「课程性质」，类型是按课名猜的，猜错难免
 * （「实验心理学」因为带「心理」被当成通识课，其实是专业课）。
 * 猜错了让同学自己改：course_types 集合按课程 id 存一条 { id, ctype, openid, at }，
 * 全校共享 —— 类型筛选要让人信得过，纠错就不能只是本机的事。
 * 类型取值过一遍名册（pickCourseType），前端传什么都不至于写进脏值。
 */
async function courseTypeSet(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '').trim().slice(0, 40);
  if (!id) return { ok: false, msg: '课程 id 丢了，改不了' };
  const ctype = require('./course-type.js').pickCourseType(payload.ctype, '');
  const at = Date.now();
  const hit = await db.collection(COL_COURSE_TYPES).where({ id: id }).limit(1).get()
    .catch(() => ({ data: [] }));
  const rec = (hit.data || [])[0];
  if (rec) {
    const w = await db.collection(COL_COURSE_TYPES).doc(rec._id)
      .update({ data: { ctype: ctype, openid: openid, at: at } }).catch((e) => ({ err: e }));
    if (w && w.err) {
      const d = dbErr(w.err);
      console.error('[courseTypeSet] update failed:', d.code, d.msg);
      return { ok: false, saved: false, msg: '云端没存住', detail: (d.code + ' ' + d.msg).trim() };
    }
  } else {
    const w = await db.collection(COL_COURSE_TYPES).add({
      data: { id: id, ctype: ctype, openid: openid, at: at }
    }).catch((e) => ({ err: e }));
    if (w && w.err) {
      const d = dbErr(w.err);
      console.error('[courseTypeSet] write failed:', d.code, d.msg);
      return { ok: false, saved: false, msg: '云端没存住', detail: (d.code + ' ' + d.msg).trim() };
    }
  }
  // 同学自建课的正本在 courses 集合里也带着 ctype：顺手改掉，
  // 不然同一个类型在两处各说各话
  await db.collection(COL_COURSES).where({ id: id })
    .update({ data: { ctype: ctype } }).catch(() => {});
  return { ok: true, ctype: ctype };
}

// 全量下发纠错表。纠错条数很小（只会有几十条），一次拉完比按需查省事
async function courseTypeList() {
  const res = await db.collection(COL_COURSE_TYPES).limit(1000).get()
    .catch(() => ({ data: [] }));
  const fixes = {};
  (res.data || []).forEach((d) => {
    if (d && d.id && d.ctype) fixes[d.id] = d.ctype;
  });
  return { ok: true, fixes: fixes };
}

// 赞 / 踩：同一个帖子一个人只能占一个位置，赞和踩互斥。
// 计数一律以 xxxBy 数组长度为准，重复点只会抵消一次，刷不出多余的赞。
// 老数据里 likes 只是一个数字、没有「谁点的」，第一次踩到时顺势转成数组，
// 不为兼容多留一条分支。
//
// ⚠️ 关键点：取消「赞」时也要把之前点过的「踩」一起撤掉。
// 只加不减的话，一个人先赞后踩，计数会同时多出一个赞和一个踩，谁也没说清他到底怎么想的。
const VOTE_KINDS = { like: { by: 'likedBy', count: 'likes' }, dislike: { by: 'dislikedBy', count: 'dislikes' } };

function voteArrays(p) {
  return {
    likedBy: Array.isArray(p.likedBy) ? p.likedBy.slice() : [],
    dislikedBy: Array.isArray(p.dislikedBy) ? p.dislikedBy.slice() : []
  };
}

// 就地改 p 上的两份名单，并返回「我点完之后」的状态。
// ⚠️ 必须改到 p 自己身上：早先只改了一份副本、返回里又拿旧数组去写库，
//    结果库里 likedBy 始终为空、likes 却一直在涨 —— 界面显示有人赞，实际没人。
function applyVote(p, openid, kind) {
  const arr = voteArrays(p);
  const cur = arr.likedBy.indexOf(openid) >= 0 ? 'like'
    : (arr.dislikedBy.indexOf(openid) >= 0 ? 'dislike' : '');
  // 再点一次同一个 → 撤回来（取消）；点到另一边 → 换边（顺带把原来那边的自己撤掉）
  const next = (cur === kind) ? '' : kind;

  ['likedBy', 'dislikedBy'].forEach((key) => {
    const i = arr[key].indexOf(openid);
    if (i >= 0) arr[key].splice(i, 1);
  });
  if (next === 'like') arr.likedBy.push(openid);
  else if (next === 'dislike') arr.dislikedBy.push(openid);

  // 这里只管名单，不动 likes / dislikes 这两个计数。
  // 计数统一走 db.command.inc 在下面那次更新里原子加减 —— 两处都改就会重复计
  p.likedBy = arr.likedBy;
  p.dislikedBy = arr.dislikedBy;

  return {
    liked: next === 'like',
    disliked: next === 'dislike',
    likedBy: arr.likedBy,
    dislikedBy: arr.dislikedBy
  };
}

async function likeToggle(openid, payload) {
  payload = payload || {};
  const postId = String(payload.postId || '');
  if (!postId) return { ok: false, msg: '参数缺失' };
  // 默认点赞；传 kind 表示点踩。认 'down'/'dislike' 两种写法，免得前端改一半就报错
  const kind = payload.kind === 'dislike' || payload.kind === 'down' ? 'dislike' : 'like';
  const res = await db.collection(COL_POSTS).where({ id: postId }).limit(1).get().catch(() => null);
  const p = res && res.data && res.data[0];
  if (!p) return { ok: true, liked: false, disliked: false, likes: 0, dislikes: 0 };

  // 「我原来在哪一边」必须在 applyVote 之前取：那一函数会原地改 p 的数组，
  // 等它跑完再看，自己早就被写进名单里了，换边判断会整个反掉
  const hadL0 = (p.likedBy || []).indexOf(openid) >= 0;
  const hadD0 = (p.dislikedBy || []).indexOf(openid) >= 0;
  const v = applyVote(p, openid, kind);

  // 写回不能整份覆写：原来是把 likedBy / dislikedBy 读出来、改完、再整份写回去，
  // 两个人同时点赞时后写的那份会盖掉先写的 —— 界面上就是「点了赞数字没变」。
  // 改成 push / pull + inc，加减各自原子做，谁后写都不会吞掉对方
  const before = hadL0 ? 'like' : (hadD0 ? 'dislike' : '');
  const after = v.liked ? 'like' : (v.disliked ? 'dislike' : '');
  const data = {};
  if (before === 'like') {
    data.likedBy = db.command.pull(openid);
    data.likes = db.command.inc(-1);
  } else if (before === 'dislike') {
    data.dislikedBy = db.command.pull(openid);
    data.dislikes = db.command.inc(-1);
  }
  if (after === 'like') {
    data.likedBy = db.command.push(openid);
    data.likes = db.command.inc(1);
  } else if (after === 'dislike') {
    data.dislikedBy = db.command.push(openid);
    data.dislikes = db.command.inc(1);
  }

  if (Object.keys(data).length) {
    const vw = await db.collection(COL_POSTS).where({ id: postId })
      .update({ data: data }).catch((e) => ({ err: e }));
    if (vw && vw.err) {
      console.error('[likeToggle] write failed:', dbErr(vw.err).code, dbErr(vw.err).msg);
      return { ok: false, saved: false, msg: '没点上，再试一次' };
    }
  }

  // 回读一份最新计数再给前端：客户端拿的是服务端权威值，
  // 免得并发下把刚被别人加过的数字覆盖回去
  const fresh = await db.collection(COL_POSTS).where({ id: postId }).limit(1).get().catch(() => null);
  const f = fresh && fresh.data && fresh.data[0];
  return {
    ok: true,
    liked: v.liked,
    disliked: v.disliked,
    likes: Number(f && f.likes) || 0,
    dislikes: Number(f && f.dislikes) || 0
  };
}

/* ---------------- 置顶（仅审核员） ---------------- */

// 置顶帖：全校同时最多 3 条，超过就提示先取消一条。
// pinned 帖子在前端列表里永远排在最上面，带「置顶」徽标。
const PIN_MAX = 3;

async function postPin(openid, payload) {
  payload = payload || {};
  if (!(await isModerator(openid))) return { ok: false, msg: '只有审核员能置顶帖子' };
  const postId = String(payload.postId || '');
  const pin = payload.pin !== false;
  if (!postId) return { ok: false, msg: '参数缺失' };

  const hit = await db.collection(COL_POSTS).where({ id: postId }).limit(1).get().catch(() => ({ data: [] }));
  const rec = hit.data && hit.data[0];
  if (!rec) return { ok: false, msg: '帖子不存在' };

  if (pin) {
    // 「还剩几个名额」要看「除了它自己以外的置顶条数」。
    // 光拿 pinned 不等于 true 去卡，只排除了这条自己，另外 3 条照样匹配，第 4 条就被放进去了
    const others = await db.collection(COL_POSTS)
      .where({ pinned: true, id: db.command.neq(postId) })
      .count().catch(() => ({ total: 0 }));
    const used = Number(others && others.total) || 0;
    if (!rec.pinned && used >= PIN_MAX) {
      return { ok: false, msg: '最多同时置顶 ' + PIN_MAX + ' 条，先取消一条吧' };
    }
    const uw = await db.collection(COL_POSTS).where({ id: postId })
      .update({ data: { pinned: true, pinnedAt: Date.now() } }).catch((e) => ({ err: e }));
    if (uw && uw.err) {
      const d = dbErr(uw.err);
      console.error('[postPin] write failed:', d.code, d.msg);
      return { ok: false, saved: false, msg: '置顶没成功，再试一次', detail: (d.code + ' ' + d.msg).trim() };
    }
    // 写完再数一次确认没破上限：两个人同时点的话，先写完的那个可能刚把名额占满
    const after2 = await db.collection(COL_POSTS)
      .where({ pinned: true, id: db.command.neq(postId) })
      .count().catch(() => ({ total: 0 }));
    const used2 = Number(after2 && after2.total) || 0;
    if (!rec.pinned && used2 >= PIN_MAX) {
      return { ok: false, saved: false, msg: '刚被别人占满了，先取消一条吧' };
    }
    return { ok: true, pinned: true, msg: '已置顶' };
  }
  const uw2 = await db.collection(COL_POSTS).where({ id: postId })
    .update({ data: { pinned: false, pinnedAt: 0 } }).catch((e) => ({ err: e }));
  if (uw2 && uw2.err) {
    const d = dbErr(uw2.err);
    console.error('[postPin] unpin failed:', d.code, d.msg);
    return { ok: false, saved: false, msg: '取消置顶没成功，再试一次', detail: (d.code + ' ' + d.msg).trim() };
  }
  return { ok: true, pinned: false, msg: '已取消置顶' };
}

/* ---------------- 运行配置（仅审核员） ---------------- */

// 读：任何登录用户都可以拿（前端要用它判断「通知开了没有」），模板 ID 本身不算秘密
async function cfgGet(openid) {
  const ids = await getSubMsgIds();
  // 置顶列表也顺手带出来，管理页一次拉全
  const pinned = await db.collection(COL_POSTS).where({ pinned: true }).limit(10).get().catch(() => ({ data: [] }));
  return {
    ok: true,
    submsg: ids,
    fromEnv: { reply: !!ENV_SUBMSG.reply, chat: !!ENV_SUBMSG.chat },
    pinnedList: (pinned.data || []).map((p) => ({ id: p.id, title: p.title, board: p.board }))
  };
}

// 写：只有审核员能改。存 app_config 集合的 submsg 文档，两处空值都以环境变量兜底
async function cfgSave(openid, payload) {
  payload = payload || {};
  if (!(await isModerator(openid))) return { ok: false, msg: '只有审核员能改通知设置' };
  const s = payload.submsg || {};
  const data = {
    reply: String(s.reply || '').trim().slice(0, 64),
    chat: String(s.chat || '').trim().slice(0, 64),
    updatedAt: now()
  };
  await db.collection(COL_CONFIG).doc('submsg').set({ data }).catch(() => {});
  _cfgCache = { at: 0, value: null }; // 改完立刻失效缓存，下次发送读新值
  return { ok: true, msg: '已保存，最迟 5 分钟内生效（重新部署云函数立即生效）' };
}

/* ---------------- 收藏（私有数据） ---------------- */

// 收藏整体存一条文档：一条文档 = 一个人的收藏，读写都是一次操作，
// 拆成「一条收藏一个文档」反而要按 openid 查一堆再合并。
async function saveFavorites(openid, payload) {
  const list = Array.isArray(payload && payload.list)
    ? payload.list.slice(0, 200).map((f) => ({
      type: String((f && f.type) || ''),
      id: String((f && f.id) || ''),
      title: String((f && f.title) || '').slice(0, 60),
      at: Number(f && f.at) || 0
    })).filter((f) => f.type && f.id)
    : [];
  await db.collection(COL_FAVS).doc(openid).set({
    data: { openid: openid, list: list, at: Date.now() }
  }).catch(() => {});
  return { ok: true, list: list };
}

async function getFavorites(openid) {
  const res = await db.collection(COL_FAVS).doc(openid).get().catch(() => null);
  const d = res && res.data;
  const list = d && Array.isArray(d.list) ? d.list : [];
  return { ok: true, list: list };
}

/* ---------------- 失物招领 / 二手交易 ---------------- */

const MARKET_TYPES = ['lost', 'found', 'sell'];
const MARKET_PAGE = 30;

// 列表展示用的补全：云端写库会补 _openid，这里统一成 openid，
// 前端「是不是我发的 / 点作者去私聊」都靠它
function decorateMarket(m, me) {
  const openid = m.openid || m._openid || '';
  return Object.assign({}, m, {
    openid: openid,
    isMine: !!me && openid === me,
    priceText: m.type === 'sell' ? (m.price ? '¥' + m.price : '议') : ''
  });
}

async function marketAdd(openid, payload) {
  payload = payload || {};
  const it = payload.item || {};
  const type = MARKET_TYPES.indexOf(it.type) >= 0 ? it.type : 'lost';
  const doc = {
    id: String(it.id || ('m' + Date.now() + Math.floor(Math.random() * 1000))),
    type: type,
    title: String(it.title || '').slice(0, 40),
    desc: String(it.desc || '').slice(0, 500),
    contact: String(it.contact || '').slice(0, 40),
    contactType: it.contactType || 'phone',
    // 只有二手才需要价格，找东西的地方标价格很怪
    price: type === 'sell' ? String(it.price || '').slice(0, 20) : '',
    location: String(it.location || '').slice(0, 40),
    // 教材专区：category=book 时按 courseName 匹配教材，开学季最好用
    category: ['book', 'digital', 'life', 'other'].indexOf(it.category) >= 0 ? it.category : 'other',
    courseName: String(it.courseName || '').slice(0, 30),
    images: Array.isArray(it.images) ? it.images.slice(0, 6) : [],
    author: String(it.author || '').slice(0, 20),
    // 作者身份一律以调用者为准：前端传什么都改不了，防冒名
    openid: openid,
    time: it.time || now(),
    at: Number(it.at) || Date.now(),
    status: 'open',
    done: false
  };
    if (!doc.title) return { ok: false, msg: '写个标题吧，别人才知道发生了什么' };
    // 失物招领是最容易被拿来做广告的地方，标题 / 描述 / 地点必须过审。
    // contact 不参与校验：找东西本来就要留联系方式，
    // 而「加微信」在我们的屏蔽词表里——一起校验会把正常的失物帖挡死。
    const g = await guard(doc.title, doc.desc, doc.location);
    if (!g.ok) return { ok: false, msg: g.msg };
    await db.collection(COL_MARKET).add({ data: doc });
  return { ok: true, item: decorateMarket(doc, openid) };
}

async function marketList(openid, payload) {
  payload = payload || {};
  const page = Math.max(1, Number(payload.page) || 1);
  const res = await db.collection(COL_MARKET)
    .orderBy('at', 'desc').skip((page - 1) * MARKET_PAGE).limit(MARKET_PAGE)
    .get().catch(() => null);
  const list = (res && res.data) || [];
  return { ok: true, list: list.map((m) => decorateMarket(m, openid)), page: page };
}

async function marketDone(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  const hit = await db.collection(COL_MARKET).where({ id: id }).limit(1).get().catch(() => ({ data: [] }));
  const rec = hit.data && hit.data[0];
  if (!rec) return { ok: true };
  const owner = String(rec.openid || rec._openid || '') === openid;
  if (!owner && !(await isModerator(openid))) return { ok: false, msg: '只能处理自己发布的内容' };

  const done = payload.done !== false;
  await db.collection(COL_MARKET).where({ id: id }).update({
    data: { status: done ? 'done' : 'open', done: done }
  }).catch(() => {});
  return { ok: true };
}

async function marketRemove(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  const hit = await db.collection(COL_MARKET).where({ id: id }).limit(1).get().catch(() => ({ data: [] }));
  const rec = hit.data && hit.data[0];
  if (!rec) return { ok: true };
  const owner = String(rec.openid || rec._openid || '') === openid;
  if (!owner && !(await isModerator(openid))) return { ok: false, msg: '没有权限删除这条' };
  await db.collection(COL_MARKET).where({ id: id }).remove().catch(() => {});
  return { ok: true };
}

/* ---------------- 私信 ---------------- */

// 会话唯一键：谁跟谁聊只算一条，跟谁先开口无关（a_b 排序后拼）
function chatKey(a, b) {
  return [a, b].sort().join('_');
}

// 每句话只留最近 200 条：聊天记录无限涨会把文档撑大，读写都变慢
const CHAT_KEEP = 200;

// 已读水位按「我在这段对话里的角色」分开记（readAtA / readAtB）。
// 一条会话只有一份文档、两个人在里面，若共用一个 readAt，
// 甲发消息时会把它顶成“已读”，乙那边就永远亮不起未读红点。
const readField = (rec, openid) => (rec.a === openid ? 'readAtA' : 'readAtB');
function myReadAt(rec, openid) {
  const v = rec.a === openid ? rec.readAtA : rec.readAtB;
  // 老会话只有共用的 readAt，且 denote 的是“发消息那位”的水位，直接拿来用
  if (v === undefined || v === null) return Number(rec.readAt || 0);
  return Number(v) || 0;
}

async function chatSend(openid, payload) {
  payload = payload || {};
  const to = String(payload.to || '');
  const text = String(payload.text || '').trim().slice(0, 300);
  if (!to) return { ok: false, msg: '没有指定对象' };
  if (to === openid) return { ok: false, msg: '不能给自己发消息' };
  if (!text) return { ok: false, msg: '内容不能为空' };

    // 服务端再过一遍审核：前端绕过云函数直接写库也躲不过这里。
    // 私信是监管重点，屏蔽词之外还要过一遍官方内容安全接口。
    const g = await guard(text);
    if (!g.ok) return { ok: false, msg: g.msg };

  // 对方把我拉黑了，连消息都发不出去。
  // 拉黑记录的方向是「我→TA」（openid 拉黑 target），所以要查的是「TA 有没有拉黑我」，
  // 写成 {openid: openid, target: to} 就变成「我是不是先拉黑了对方」，方向正好反了。
  const blk = await db.collection(COL_BLOCKS)
    .where({ openid: to, target: openid }).limit(1).get().catch(() => ({ data: [] }));
  if (blk.data && blk.data.length) return { ok: false, msg: '对方设置了消息限制' };

  const key = chatKey(openid, to);
  const msg = {
    id: 'msg' + Date.now() + Math.floor(Math.random() * 1000),
    from: openid,
    text: text,
    time: now(),
    at: Date.now()
  };

  const exist = await db.collection(COL_CHATS).where({ key: key }).limit(1).get().catch(() => ({ data: [] }));
  const rec = exist.data && exist.data[0];
  if (rec) {
    // 别整份读出来、改完、再整份写回去：两人同时发（或一端连发两句）时，
    // 后写的那份会盖掉先写的 —— 对方刷新就少一条消息。
    // push 的 slice 顺手做掉老消息的截断，效果跟原来一样，但加减是原子的
    // 我刚发过，说明这段对话「从我这边看」已经读过了 —— 只推进我那一侧的水位
    const patch = {};
    patch[readField(rec, openid)] = msg.at;
    const cw = await db.collection(COL_CHATS).where({ key: key }).update({
      data: Object.assign({
        messages: db.command.push({ each: [msg], slice: -CHAT_KEEP }),
        updatedAt: Date.now(),
        lastAt: msg.at,
        lastText: text
      }, patch)
    }).catch((e) => ({ err: e }));
    if (cw && cw.err) {
      const d = dbErr(cw.err);
      console.error('[chatSend] write failed:', d.code, d.msg);
      return { ok: false, saved: false, msg: '消息没发出去，再试一次', detail: (d.code + ' ' + d.msg).trim() };
    }
  } else {
    const aw = await db.collection(COL_CHATS).add({
      data: {
        key: key, a: openid, b: to,
        messages: [msg], updatedAt: Date.now(),
        lastAt: msg.at, lastText: text,
        readAtA: msg.at, readAtB: 0
      }
    }).catch((e) => ({ err: e }));
    if (aw && aw.err) {
      const d = dbErr(aw.err);
      console.error('[chatSend] add failed:', d.code, d.msg);
      return { ok: false, saved: false, msg: '消息没发出去，再试一次', detail: (d.code + ' ' + d.msg).trim() };
    }
  }

  // 给接收方推订阅消息：私信是最需要「有人找你」提醒的场景。
  // 拿昵称要查一次库，放在消息写库之后，失败也不影响消息本身。
  const meRes = await db.collection(COL_USERS).doc(openid).get().catch(() => null);
  const nick = (meRes && meRes.data && meRes.data.nickName) || '同学';
  sendSubMsg(to, 'chat', {
    page: 'pages/user/chat/chat?peer=' + openid,
    fields: {
      thing1: { value: (nick + ' 给你发了一条私信').slice(0, 20) },
      thing2: { value: text.slice(0, 20) },
      time3: { value: now() }
    }
  });
  return { ok: true, msg: msg };
}

// 会话列表：对方资料 + 最后一句 + 未读标记
async function chatList(openid) {
  const res = await db.collection(COL_CHATS)
    .where(db.command.or([{ a: openid }, { b: openid }]))
    .orderBy('updatedAt', 'desc').limit(50).get().catch(() => ({ data: [] }));

  const out = [];
  for (const r of (res.data || [])) {
    const peer = r.a === openid ? r.b : r.a;
    const p = await db.collection(COL_USERS).doc(peer).get().catch(() => null);
    const u = (p && p.data) || {};
    const msgs = r.messages || [];
    const last = msgs[msgs.length - 1] || {};
    const lastFrom = String(last.from || (r.a === openid ? r.a : r.b) || '');
    const unread = last.from && last.from !== openid
      && myReadAt(r, openid) < Number(last.at || 0) ? 1 : 0;
    out.push({
      peer: peer,
      nickName: u.nickName || '某个同学',
      avatarUrl: u.avatarUrl || '',
      college: u.college || '',
      lastText: r.lastText || last.text || '',
      lastTime: r.lastAt || r.updatedAt || '',
      unread: unread,
      updatedAt: r.updatedAt || 0
    });
  }
  return { ok: true, list: out };
}

// 聊天记录：打开会话即已读，不用额外点「标为已读」
async function chatHistory(openid, payload) {
  payload = payload || {};
  const peer = String(payload.peer || '');
  if (!peer || peer === openid) return { ok: false, msg: '参数不对' };

  const key = chatKey(openid, peer);
  const res = await db.collection(COL_CHATS).where({ key: key }).limit(1).get().catch(() => ({ data: [] }));
  const rec = res.data && res.data[0];
  const messages = (rec && rec.messages) ? rec.messages : [];
  if (rec && messages.length) {
    const lastAt = messages[messages.length - 1].at || 0;
    if (myReadAt(rec, openid) < Number(lastAt)) {
      // 只推进「我」这一侧的水位，不影响对方那侧的未读
      const patch = {};
      patch[readField(rec, openid)] = lastAt;
      await db.collection(COL_CHATS).where({ key: key })
        .update({ data: patch }).catch(() => {});
    }
  }
  // 只取最近的 CHAT_KEEP 条，长会话别一次塞满前端内存
  const slice = messages.slice(-CHAT_KEEP).map((m) => Object.assign({}, m, { mine: m.from === openid }));

  const p = await db.collection(COL_USERS).doc(peer).get().catch(() => null);
  const u = (p && p.data) || {};
  return {
    ok: true,
    messages: slice,
    peer: {
      openid: peer,
      nickName: u.nickName || '某个同学',
      avatarUrl: u.avatarUrl || '',
      college: u.college || '',
      // 只有互认好友才给联系方式：私信里可以直接复制，不必再切出去问
      contactType: u.contactType || '',
      contactValue: u.contactValue || ''
    }
  };
}

/* ---------------- 冷启动种子 ---------------- */

// 新用户进来时云端往往是空的。库里一条帖子都没有时，把示例内容写进去，
// 让第一个人之后进来就有东西看；已经有人发过真帖子就完全不动。
async function ensureSeed(payload) {
  const data = payload || {};
  const posts = Array.isArray(data.posts) ? data.posts : [];
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  if (!posts.length) return { ok: false, msg: '没有种子数据' };

  const exist = await db.collection('posts').limit(1).get().catch(() => ({ data: [] }));
  if (exist.data && exist.data.length) return { ok: true, seeded: false };

  const postIds = {};
  const revIds = {};
  reviews.forEach((r) => { revIds[r.id] = true; });

  for (const p of posts) {
    if (postIds[p.id]) continue;
    postIds[p.id] = true;
    // eslint-disable-next-line no-await-in-loop
    await db.collection('posts').add({
      data: {
        id: p.id,
        board: p.board,
        title: p.title,
        content: p.content,
        author: p.author,
        time: p.time,
        likes: p.likes || 0,
        liked: false,
        images: p.images || [],
        courseId: p.courseId || '',
        courseName: p.courseName || '',
        comments: p.comments || [],
        seed: true
      }
    }).catch(() => {});
  }

  for (const r of reviews) {
    if (revIds[r.id]) continue;
    revIds[r.id] = true;
    // eslint-disable-next-line no-await-in-loop
    await db.collection('reviews').add({
      data: {
        id: r.id,
        courseId: r.courseId,
        nickName: r.nickName,
        anonymous: !!r.anonymous,
        score: r.score,
        content: r.content,
        time: r.time,
        tags: r.tags || [],
        openid: '',
        seed: true
      }
    }).catch(() => {});
  }

  return { ok: true, seeded: true };
}

/* ---------------- 学习资料共享 ---------------- */

// 文件本体存在云存储，这里只存元数据。
// 下载一律走云函数换临时链接：云存储权限设成「仅创建者可读写」时，
// 别人拿 fileID 也打不开，必须服务端签发临时 URL。
const RESOURCE_CATS = ['笔记', '真题', '讲义', '其他'];

function decorateResource(r, me) {
  const openid = r.openid || r._openid || '';
  const thanks = Array.isArray(r.thanks) ? r.thanks : [];
  return Object.assign({}, r, {
    openid: openid,
    isMine: !!me && openid === me,
    thanks: thanks,
    thanksCount: thanks.length,
    thanked: !!me && thanks.indexOf(me) >= 0,
    sizeText: r.size ? (Number(r.size) > 1048576
      ? (Number(r.size) / 1048576).toFixed(1) + ' MB'
      : Math.max(1, Math.round(Number(r.size) / 1024)) + ' KB') : ''
  });
}

async function resourceAdd(openid, payload) {
  payload = payload || {};
  const r = payload.resource || {};
  const title = String(r.title || '').trim().slice(0, 40);
  const fileID = String(r.fileID || '').trim();
  if (!title) return { ok: false, msg: '给资料起个名字吧' };
  if (!fileID) return { ok: false, msg: '文件没上传成功，重新选一次' };
  const g = await guard(title, String(r.desc || ''), String(r.courseName || ''));
  if (!g.ok) return { ok: false, msg: g.msg };

  const doc = {
    id: String(r.id || ('res' + Date.now() + Math.floor(Math.random() * 1000))),
    title: title,
    desc: String(r.desc || '').slice(0, 200),
    fileID: fileID,
    fileName: String(r.fileName || '').slice(0, 60),
    size: Number(r.size) || 0,
    category: RESOURCE_CATS.indexOf(r.category) >= 0 ? r.category : '其他',
    courseName: String(r.courseName || '').slice(0, 30),
    author: String(r.author || '浙小商').slice(0, 20),
    openid: openid,
    time: now(),
    at: Date.now(),
    thanks: [],
    status: 'normal'
  };
  await db.collection(COL_RESOURCES).add({ data: doc });
  return { ok: true, resource: decorateResource(doc, openid) };
}

async function resourceList(openid, payload) {
  payload = payload || {};
  const category = String(payload.category || '');
  const courseName = String(payload.courseName || '').trim();
  const res = await db.collection(COL_RESOURCES)
    .orderBy('at', 'desc').limit(60).get().catch(() => null);
  let list = ((res && res.data) || []).filter((r) => (r.status || 'normal') === 'normal');
  if (category && category !== '全部') list = list.filter((r) => (r.category || '其他') === category);
  if (courseName) {
    const kw = courseName.toLowerCase();
    list = list.filter((r) => String(r.courseName || '').toLowerCase().indexOf(kw) >= 0
      || String(r.title || '').toLowerCase().indexOf(kw) >= 0);
  }
  return { ok: true, list: list.map((r) => decorateResource(r, openid)) };
}

// 换临时下载链接：云存储权限收紧也照样能下载，且不暴露永久地址
async function resourceUrl(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  const hit = await db.collection(COL_RESOURCES).where({ id: id }).limit(1).get().catch(() => ({ data: [] }));
  const rec = hit.data && hit.data[0];
  if (!rec) return { ok: false, msg: '资料不存在' };
  try {
    const r = await cloud.getTempFileURL({ fileList: [rec.fileID] });
    const f = r && r.fileList && r.fileList[0];
    if (!f || !f.tempFileURL) return { ok: false, msg: '文件链接获取失败' };
    return { ok: true, url: f.tempFileURL, fileName: rec.fileName || rec.title };
  } catch (e) {
    return { ok: false, msg: '文件链接获取失败' };
  }
}

async function resourceThanks(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  const hit = await db.collection(COL_RESOURCES).where({ id: id }).limit(1).get().catch(() => ({ data: [] }));
  const rec = hit.data && hit.data[0];
  if (!rec) return { ok: true };
  const thanks = Array.isArray(rec.thanks) ? rec.thanks : [];
  const on = thanks.indexOf(openid) < 0;
  // 别整份读出来再整份写回去：多个人同时点「感谢」，后写的那份会把先写的那份盖掉。
  // 用 pull / push 各自原子做，谁后写都不吞人
  const data = {};
  if (on) {
    data.thanks = db.command.push(openid);
    data.thanksCount = db.command.inc(1);
  } else {
    data.thanks = db.command.pull(openid);
    data.thanksCount = db.command.inc(-1);
  }
  const tw = await db.collection(COL_RESOURCES).where({ id: id })
    .update({ data: data }).catch((e) => ({ err: e }));
  if (tw && tw.err) {
    const d = dbErr(tw.err);
    console.error('[resourceThanks] write failed:', d.code, d.msg);
    return { ok: false, saved: false, msg: '没能记上，再试一次', detail: (d.code + ' ' + d.msg).trim() };
  }
  // 回读一份最新的当返回值：老数据可能压根没有 thanksCount 这个字段，
  // 直接在 undefined 上 inc(-1) 会算出 -1 并永远卡在负数。名单数组才是权威值
  const fresh = await db.collection(COL_RESOURCES).where({ id: id }).limit(1).get().catch(() => null);
  const fr = fresh && fresh.data && fresh.data[0];
  const arr = (fr && fr.thanks) || [];
  const raw = fr ? fr.thanksCount : null;
  const count = (typeof raw === 'number' && raw >= 0) ? raw : arr.length;
  // 字段缺失或已经算成负数，顺手修回来，免得下次接着错
  if (typeof raw !== 'number' || raw < 0) {
    await db.collection(COL_RESOURCES).where({ id: id })
      .update({ data: { thanksCount: arr.length } }).catch(() => {});
  }
  return { ok: true, thanked: on, thanksCount: count };
}

async function resourceRemove(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  const hit = await db.collection(COL_RESOURCES).where({ id: id }).limit(1).get().catch(() => ({ data: [] }));
  const rec = hit.data && hit.data[0];
  if (!rec) return { ok: true };
  const owner = String(rec.openid || rec._openid || '') === openid;
  if (!owner && !(await isModerator(openid))) return { ok: false, msg: '只能删除自己上传的资料' };
  await db.collection(COL_RESOURCES).where({ id: id }).remove().catch(() => {});
  return { ok: true };
}

/* ---------------- 校历 ---------------- */

// 官方校历（2026-09-26 从教务处《关于2026-2027学年第一学期本科教学相关工作的通知》抄录）：
//   9月14日(周一)正式上课；共18周=教学16周+复习考试2周；期中考试拟第8-10周；
//   中秋 9/25-9/27；国庆 10/1-10/7；四六级口语 11/21-22、笔试 12/12；
//   1月18日(周一)起放寒假（即期末考试周为 1/4-1/17）。
//   考研初试与春季开学日期官方暂未公布，标了「预计」，审核员可在校历页里改。
const DEFAULT_CALENDAR = [
  { id: 'cal-midterm', name: '期中考试周（第8-10周）', date: '2026-11-02', type: 'exam', note: '教务拟定，以学院通知为准' },
  { id: 'cal-cet-spoken', name: '四六级口语考试', date: '2026-11-21', type: 'exam', note: '11月21-22日，两天' },
  { id: 'cal-cet', name: '四六级笔试', date: '2026-12-12', type: 'exam', note: '考前一周打印准考证' },
  { id: 'cal-kaoyan', name: '考研初试', date: '2026-12-26', type: 'exam', note: '预计12月26-27日，以研招网为准' },
  { id: 'cal-final', name: '期末考试周', date: '2027-01-04', type: 'exam', note: '第17-18周，停课复习' },
  { id: 'cal-winter', name: '寒假开始', date: '2027-01-18', type: 'term', note: '1月18日（周一）起放寒假' },
  { id: 'cal-spring', name: '春季学期开学', date: '2027-03-01', type: 'term', note: '预计，以学校校历为准' }
];

// 官方校历的「指纹」：教务处出新通知后改这里，calendarReset 一键刷新全校数据
const CALENDAR_VER = '2026-2027-1-official';

async function calendarList() {
  const res = await db.collection(COL_CALENDAR).orderBy('date', 'asc').limit(50).get().catch(() => null);
  let list = (res && res.data) || null;
  // 第一次进来库是空的：把预置节点写进去再返回，省得校历永远空白
  if (!list || !list.length) {
    for (const item of DEFAULT_CALENDAR) {
      // eslint-disable-next-line no-await-in-loop
      await db.collection(COL_CALENDAR).where({ id: item.id }).limit(1).get()
        .then((r) => {
          if (!(r && r.data && r.data.length)) {
            return db.collection(COL_CALENDAR).add({ data: Object.assign({}, item, { at: Date.now() }) });
          }
          return null;
        })
        .catch(() => {});
    }
    list = DEFAULT_CALENDAR.slice();
  }
  return { ok: true, list: list };
}

async function calendarSave(openid, payload) {
  payload = payload || {};
  if (!(await isModerator(openid))) return { ok: false, msg: '只有审核员能改校历' };
  const item = payload.item || {};
  const name = String(item.name || '').trim().slice(0, 30);
  const date = String(item.date || '').trim().slice(0, 10);
  if (!name || !date) return { ok: false, msg: '名称和日期都要填' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, msg: '日期格式写成 2026-12-12 这样' };
  const data = {
    id: String(item.id || ('cal' + Date.now())),
    name: name,
    date: date,
    type: String(item.type || 'other').slice(0, 10),
    note: String(item.note || '').slice(0, 60),
    at: Date.now()
  };
  const exist = await db.collection(COL_CALENDAR).where({ id: data.id }).limit(1).get().catch(() => ({ data: [] }));
  if (exist.data && exist.data.length) {
    await db.collection(COL_CALENDAR).where({ id: data.id }).update({ data: data }).catch(() => {});
  } else {
    await db.collection(COL_CALENDAR).add({ data: data }).catch(() => {});
  }
  return { ok: true, item: data };
}

async function calendarRemove(openid, payload) {
  payload = payload || {};
  if (!(await isModerator(openid))) return { ok: false, msg: '只有审核员能改校历' };
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  await db.collection(COL_CALENDAR).where({ id: id }).remove().catch(() => {});
  return { ok: true };
}

// 一键导入官方校历：清掉旧节点、灌入 DEFAULT_CALENDAR（数据来源见上方注释）。
// 给审核员的按钮用 —— 老库里存着旧版预置日期时，跑一次就能整体升级成官方版。
async function calendarReset(openid) {
  if (!(await isModerator(openid))) return { ok: false, msg: '只有审核员能导入校历' };
  await db.collection(COL_CALENDAR).where({}).remove().catch(() => {});
  for (const item of DEFAULT_CALENDAR) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection(COL_CALENDAR).add({
      data: Object.assign({}, item, { ver: CALENDAR_VER, at: Date.now() })
    }).catch(() => {});
  }
  return { ok: true, msg: '已导入教务处官方校历 ' + DEFAULT_CALENDAR.length + ' 条', list: DEFAULT_CALENDAR };
}

/* ---------------- 校园地点 ---------------- */

// 经纬度由前端 wx.chooseLocation 在地图上点出来，不手写——手写坐标百分百有偏差，
// 而 openLocation 一旦坐标错了，导航会把同学带到隔壁学校去。
// 预置地点例外：名称来自学校官网（三个食堂、校医院、生活区等），
// 坐标来自公开地图数据（OpenStreetMap，已转 GCJ-02，教学楼定位可精确到楼）。
// 权限「所有用户可读」，审核员/同学后续仍可在地图上重新选点校准。
const PLACE_CATS = ['教学楼', '食堂', '宿舍', '快递', '运动', '其他'];

const DEFAULT_PLACES = [
  { id: 'pl-lib', name: '图书馆', category: '教学楼', desc: '自习室 8:00-22:30，图书馆广场中央是「勤」时钟花坛', latitude: 30.30997, longitude: 120.38964, official: true },
  { id: 'pl-tA', name: 'A 教学楼', category: '教学楼', desc: '', latitude: 30.30938, longitude: 120.39164, official: true },
  { id: 'pl-tB', name: 'B 教学楼', category: '教学楼', desc: '', latitude: 30.30983, longitude: 120.39221, official: true },
  { id: 'pl-tC', name: 'C 教学楼', category: '教学楼', desc: '', latitude: 30.31029, longitude: 120.39186, official: true },
  { id: 'pl-tD', name: 'D 教学楼', category: '教学楼', desc: '', latitude: 30.30957, longitude: 120.39406, official: true },
  { id: 'pl-tE', name: 'E 教学楼', category: '教学楼', desc: '', latitude: 30.31001, longitude: 120.39474, official: true },
  { id: 'pl-tF', name: 'F 教学楼', category: '教学楼', desc: '', latitude: 30.31034, longitude: 120.39564, official: true },
  { id: 'pl-xy', name: '行云苑食堂', category: '食堂', desc: '钱江湾生活区', latitude: 30.31193, longitude: 120.38791, official: true },
  { id: 'pl-ls', name: '流水苑食堂', category: '食堂', desc: '钱江湾生活区，三层，一楼有麦当劳', latitude: 30.31216, longitude: 120.39355, official: true },
  { id: 'pl-qf', name: '清风苑食堂', category: '食堂', desc: '金沙港生活区', latitude: 30.31191, longitude: 120.38126, official: true },
  { id: 'pl-gym', name: '体育中心', category: '运动', desc: '游泳馆 / 羽毛球馆 / 乒乓球馆 / 健身房都在这里', latitude: 30.30734, longitude: 120.38328, official: true },
  { id: 'pl-act', name: '学生活动中心', category: '其他', desc: '社团活动大多在这里', latitude: 30.30965, longitude: 120.38717, official: true },
  { id: 'pl-hosp', name: '校医院', category: '其他', desc: '钱江湾生活区 1 号综合楼，有急诊', latitude: 30.31173, longitude: 120.39224, official: true },
  { id: 'pl-qjw', name: '钱江湾生活区', category: '宿舍', desc: '生活区里有食堂和生活服务部', latitude: 30.31193, longitude: 120.39247, official: true },
  { id: 'pl-jsg', name: '金沙港生活区', category: '宿舍', desc: '离文海南路地铁站更近', latitude: 30.31274, longitude: 120.38043, official: true },
  { id: 'pl-south', name: '南大门（飞翔门）', category: '其他', desc: '访客与快递多走这个门', latitude: 30.30707, longitude: 120.38835, official: true },
  { id: 'pl-north', name: '北大门', category: '其他', desc: '', latitude: 30.31044, longitude: 120.38757, official: true },
  { id: 'pl-metro', name: '地铁 8 号线 · 工商大学云滨站', category: '其他', desc: 'A/C 口出站即达，1 号线可在文海南路换乘 8 号线', latitude: 30.31097, longitude: 120.39307, official: true }
];

// 库为空时把官方地点灌进去（和校历同款逻辑：只灌一次，之后不覆盖同学的手工修改）
async function seedPlaces() {
  for (const item of DEFAULT_PLACES) {
    // eslint-disable-next-line no-await-in-loop
    const hit = await db.collection(COL_PLACES).where({ id: item.id }).limit(1).get().catch(() => null);
    if (hit && hit.data && hit.data.length) continue;
    // eslint-disable-next-line no-await-in-loop
    await db.collection(COL_PLACES).add({
      data: Object.assign({}, item, { openid: '', at: Date.now(), source: 'official' })
    }).catch(() => {});
  }
}

async function placeList(openid, payload) {
  payload = payload || {};
  const category = String(payload.category || '');
  let res = await db.collection(COL_PLACES).orderBy('at', 'desc').limit(100).get().catch(() => null);
  let list = (res && res.data) || [];
  // 第一次进来库是空的：把官方地点灌进去再返回，同学打开就有全校地图可用
  if (!list.length) {
    await seedPlaces();
    res = await db.collection(COL_PLACES).orderBy('at', 'desc').limit(100).get().catch(() => null);
    list = (res && res.data) || [];
  }
  if (category && category !== '全部') list = list.filter((p) => (p.category || '其他') === category);
  return {
    ok: true,
    list: list.map((p) => Object.assign({}, p, {
      isMine: String(p.openid || p._openid || '') === openid
    }))
  };
}

async function placeAdd(openid, payload) {
  payload = payload || {};
  const p = payload.place || {};
  const name = String(p.name || '').trim().slice(0, 30);
  const lat = Number(p.latitude);
  const lng = Number(p.longitude);
  if (!name) return { ok: false, msg: '地点名字得写一下' };
  if (!isFinite(lat) || !isFinite(lng) || !lat || !lng) return { ok: false, msg: '请在地图上选一下位置' };
  const g = await guard(name, String(p.desc || ''));
  if (!g.ok) return { ok: false, msg: g.msg };

  const doc = {
    id: String(p.id || ('pl' + Date.now() + Math.floor(Math.random() * 1000))),
    name: name,
    category: PLACE_CATS.indexOf(p.category) >= 0 ? p.category : '其他',
    desc: String(p.desc || '').slice(0, 80),
    address: String(p.address || '').slice(0, 60),
    latitude: lat,
    longitude: lng,
    openid: openid,
    at: Date.now()
  };
  await db.collection(COL_PLACES).add({ data: doc });
  return { ok: true, place: doc };
}

async function placeRemove(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  const hit = await db.collection(COL_PLACES).where({ id: id }).limit(1).get().catch(() => ({ data: [] }));
  const rec = hit.data && hit.data[0];
  if (!rec) return { ok: true };
  const owner = String(rec.openid || rec._openid || '') === openid;
  if (!owner && !(await isModerator(openid))) return { ok: false, msg: '只能删除自己添加的地点' };
  await db.collection(COL_PLACES).where({ id: id }).remove().catch(() => {});
  return { ok: true };
}

/* ---------------- 校园活动 ---------------- */

// 活动是一条 events 文档，报名单独放 event_joins，一人一条。
// 为什么不把报名塞进 events 的 joined 数组：一个热门讲座几百号人，数组只增不减，
// 每次打开列表都要把整份名单读一遍，越用越慢；取消报名还得在数组里翻着删。
// 计数（joinedCount）留在活动文档上，报名 / 取消时加减，列表页一次查询就能带上人数。
const EVENT_TYPES = ['lecture', 'contest', 'team', 'other'];
// 列表页多给一点：同步来的官网活动按日期排在最前，30 条很容易一屏放不下
const EVENT_PAGE = 50;

// 报名记录的 id 必须是「我 + 活动」唯一键：既然唯一，重复点报名就查得到、不去加计数，
// 也就不会出现「刷新一次报名数涨一次」这种事。
function joinId(openid, eventId) {
  return openid + '__' + eventId;
}

function decorateEvent(e, me, joinedIds) {
  const openid = e.openid || e._openid || '';
  const cap = Number(e.capacity) || 0;
  const count = Number(e.joinedCount) || 0;
  const joined = !!(me && joinedIds && joinedIds.indexOf(String(e.id)) >= 0);
  return Object.assign({}, e, {
    openid: openid,
    isMine: !!me && openid === me,
    joined: joined,
    count: count,
    full: cap > 0 && count >= cap,
    canJoin: !joined && (cap === 0 || count < cap)
  });
}

async function eventAdd(openid, payload) {
  payload = payload || {};
  const it = payload.event || {};
  const title = String(it.title || '').trim();
  const desc = String(it.desc || '').trim();
  const location = String(it.location || '').trim();
  if (!title) return { ok: false, msg: '给活动起个名字吧' };
  if (title.length > 40) return { ok: false, msg: '标题最多 40 个字' };
  if (desc.length > 500) return { ok: false, msg: '活动详情最多 500 个字' };
  // 屏蔽词 / 官方内容安全：标题、详情、地点都要过。
  // 联系方式不参与校验 —— 活动本来就要留联系方式，而「加微信」在我们的词表里，
  // 一起校验会把正常的讲座通知挡死（失物招领那边也是同样的处理）。
  const g = await guard(title, desc, location);
  if (!g.ok) return { ok: false, msg: g.msg };

  const doc = {
    id: String(it.id || ('ev' + Date.now() + Math.floor(Math.random() * 1000))),
    type: EVENT_TYPES.indexOf(it.type) >= 0 ? it.type : 'other',
    title: title,
    desc: desc,
    location: location.slice(0, 40),
    start: String(it.start || '').slice(0, 20),
    // 0 = 不限人数。真限制人数时要给出上限，别让同学报完名发现进不去
    capacity: Math.max(0, Math.min(500, Math.round(Number(it.capacity) || 0))),
    joinedCount: 0,
    contact: String(it.contact || '').slice(0, 40),
    contactType: it.contactType || 'wechat',
    author: String(it.author || '浙小商').slice(0, 20),
    authorOpenid: openid,
    openid: openid,
    time: now(),
    at: Number(it.at) || Date.now(),
    status: 'open'
  };
  // 写库成功/失败必须如实上报，跟 postAdd 一个道理：
  //  swallowed 成 ok:true 的话，前端弹「发布成功」，活动却压根没到云端。
  const w = await db.collection(COL_EVENTS).add({ data: doc }).catch((e) => ({ err: e }));
  if (w && w.err) {
    const d = dbErr(w.err);
    console.error('[eventAdd] write failed:', d.code, d.msg);
    return { ok: false, saved: false, msg: '云端没存住', detail: (d.code + ' ' + d.msg).trim() };
  }
  return { ok: true, event: decorateEvent(doc, openid, []) };
}

async function eventList(openid, payload) {
  payload = payload || {};
  const page = Math.max(1, Number(payload.page) || 1);
  const res = await db.collection(COL_EVENTS)
    .orderBy('at', 'desc').skip((page - 1) * EVENT_PAGE).limit(EVENT_PAGE)
    .get().catch(() => null);
  const list = (res && res.data) || [];
  // 我报过名的活动：一次查我自己的报名记录就够，
  // 比给每条活动各查一次「有没有我」省得多（列表 30 条会直接把查询次数用光）
  const mine = await db.collection(COL_EVENT_JOINS)
    .where({ openid: openid }).limit(300).get().catch(() => ({ data: [] }));
  const joinedIds = ((mine && mine.data) || []).map((r) => String(r.eventId || ''));
  return { ok: true, list: list.map((e) => decorateEvent(e, openid, joinedIds)), page: page };
}

async function eventJoin(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  const hit = await db.collection(COL_EVENTS).where({ id: id }).limit(1).get().catch(() => ({ data: [] }));
  const ev = hit.data && hit.data[0];
  if (!ev) return { ok: false, msg: '这个活动找不到了' };
  if (ev.status === 'closed') return { ok: false, msg: '这个活动已经结束了' };

  // 过了开赛时间就不再收报名。原来只在 status === 'closed' 时拦，
  // 而全仓库没有任何一处会把活动标成 closed（那段判断等于死的），
  // 结果就是宋日都过去的讲座同学照样能报。按日期拦更可靠 —— 时间写在明面上，不靠谁维护。
  const startAt = String(ev.start || '').trim();
  if (startAt && startAt < memoDateStr()) {
    return { ok: false, msg: '这个活动已经开始了，报不了名了' };
  }

  // 已经报过要先于「满员」判断返回：我自己就是填满名额的那个人，
  // 这时报「人数满了，下次早点来」同学只会一脸问号 —— 我明明报上了。
  const jid = joinId(openid, id);
  const dup = await db.collection(COL_EVENT_JOINS).where({ id: jid }).limit(1).get().catch(() => ({ data: [] }));
  if (dup.data && dup.data.length) return { ok: true, joined: true, already: true };

  const cap = Number(ev.capacity) || 0;
  // 原来拿「刚才读到的那份快照」判满员，两个同学同时报、只剩最后一个名额时
  // 两边都读到 cap-1，都判成没满，一起报进去 —— 热门讲座会超卖。
  // 现在名额判断下沉到下面那次 inc 的 where 里，由服务端原子判定：
  // 同一批请求里只有一个人能匹配到「人数还没满」，其余的 updated === 0
  const w = await db.collection(COL_EVENT_JOINS).add({
    data: { id: jid, eventId: id, openid: openid, author: String(ev.author || '').slice(0, 20), at: Date.now() }
  }).catch((e) => ({ err: e }));
  if (w && w.err) {
    const d = dbErr(w.err);
    console.error('[eventJoin] write failed:', d.code, d.msg);
    // saved:false = 存储失败（不是违规），前端别把本地记录清掉
    return { ok: false, saved: false, msg: '报名没存住，再试一次', detail: (d.code + ' ' + d.msg).trim() };
  }

  // 报名记录先落地，再抢名额；没抢到就把这条记录撤掉，别留下一条没用的报名
  const uw = await db.collection(COL_EVENTS).where(
    cap > 0
      ? { id: id, joinedCount: db.command.lt(cap) }
      : { id: id }
  ).update({ data: { joinedCount: db.command.inc(1) } }).catch((e) => ({ err: e }));

  if (uw && uw.err) {
    const d = dbErr(uw.err);
    console.error('[eventJoin] count failed:', d.code, d.msg);
    await db.collection(COL_EVENT_JOINS).where({ id: jid }).remove().catch(() => {});
    return { ok: false, saved: false, msg: '报名没存住，再试一次', detail: (d.code + ' ' + d.msg).trim() };
  }
  if (cap > 0 && uw && uw.stats && Number(uw.stats.updated) === 0) {
    await db.collection(COL_EVENT_JOINS).where({ id: jid }).remove().catch(() => {});
    return { ok: false, msg: '人数满了，下次早点来' };
  }
  return { ok: true, joined: true };
}

async function eventCancel(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  const jid = joinId(openid, id);
  const w = await db.collection(COL_EVENT_JOINS).where({ id: jid }).remove().catch((e) => ({ err: e }));
  if (w && w.err) {
    const d = dbErr(w.err);
    console.error('[eventCancel] remove failed:', d.code, d.msg);
    return { ok: false, saved: false, msg: '取消失败，再试一次', detail: (d.code + ' ' + d.msg).trim() };
  }
  // 记录其实不存在时（重复点取消、名单丢过一次）remove 不报错、只回 removed:0。
  // 照旧减计数会让人数变成 -1，之后「满员」判断全是错的，还会让人以为自己真报上了
  const removed = w && w.stats ? Number(w.stats.removed) : NaN;
  if (!(removed > 0)) {
    return { ok: true, joined: false, already: true, msg: '这条报名记录已经不在了，不用取消' };
  }
  // 减计数也要如实：加减不对称的话，人数会越点越离谱
  const dw = await db.collection(COL_EVENTS).where({ id: id }).update({
    data: { joinedCount: db.command.inc(-1) }
  }).catch((e) => ({ err: e }));
  if (dw && dw.err) {
    const d = dbErr(dw.err);
    console.error('[eventCancel] dec failed:', d.code, d.msg);
    return { ok: false, saved: false, msg: '人数没改过来，再试一次', detail: (d.code + ' ' + d.msg).trim() };
  }
  return { ok: true, joined: false };
}

async function eventRemove(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  const hit = await db.collection(COL_EVENTS).where({ id: id }).limit(1).get().catch(() => ({ data: [] }));
  const rec = hit.data && hit.data[0];
  if (!rec) return { ok: true };
  const owner = String(rec.openid || rec._openid || '') === openid;
  if (!owner && !(await isModerator(openid))) return { ok: false, msg: '只能删除自己发布的活动' };
  // 报名记录先陪葬：活动都没了，报名的人留着一条记录只会看到「活动已失效」
  await db.collection(COL_EVENT_JOINS).where({ eventId: id }).remove().catch(() => {});
  await db.collection(COL_EVENTS).where({ id: id }).remove().catch(() => {});
  return { ok: true };
}

/* ---------------- 官网数据同步 ---------------- */
//
// 为什么放在云函数里同步，而不是前端直接抓：
//   前端调 https 抓校内网站会被跨域挡住，还得配域名白名单；
//   云函数在服务端出网，没有任何限制，还能被定时触发器定时叫醒。
//
// 抓下来的东西只做两件事：
//   ① 公告条目 → 官方活动（标 official:true，带 sourceUrl，点标题能跳回官网原文）
//   ② 学院师资页 → 教师名录，同学写评价选老师时用它自动补全
// 同步是幂等的：按 sourceUrl / 姓名去重，官网改了就更新，重复跑不会产生重复数据。
//
// 频率：config.json 里挂了定时触发器（每天一次）。抓失败不写日志噪声，
// 返回明确的 ok:false，前端「更新」按钮能把原因说出来。
const WEB_SOURCES = [
  { key: 'youth', site: '校团委', url: 'https://youth.zjgsu.edu.cn/main.htm' },
  { key: 'tgb', site: '体育工作部', url: 'http://tgb.zjgsu.edu.cn/List-54.html' },
  { key: 'xsc', site: '学生处', url: 'https://xsc.zjgsu.edu.cn/1826/list.htm' },
  { key: 'news', site: '学校主页', url: 'http://www.zjgsu.edu.cn/' },
  // 就业指导中心：校招 / 双选会 / 宣讲会都在这儿发。抓不到时静默跳过，不影响其他源
  { key: 'job', site: '就业指导中心', url: 'https://job.zjgsu.edu.cn/list-27-1.html' }
];

// 各学院官网的师资页。学校没有统一的教师库，只能一处一处抓；
// 页面改版抓不到时静默跳过，同学仍可用 teacherAdd 自己补。
const TEACHER_SOURCES = [
  { key: 'scie', site: '计算机科学与技术学院', url: 'https://scie.zjgsu.edu.cn/index.php/zh-hans/%E5%85%A8%E4%BD%93%E6%95%99%E5%B8%88', from: '一、专任教师' },
  { key: 'spxy', site: '食品与生物工程学院', url: 'https://spxy.zjgsu.edu.cn/?zrjs=', from: '博士生导师（硕士生导师）' },
  { key: 'sme', site: '管理工程与电子商务学院', url: 'https://sme.zjgsu.edu.cn/276/list.htm', from: '专任教师' }
];

const WEB_TIMEOUT = 8000;

// 云函数出网抓页面。跟着跳转走，学校站不少栏目是 301 到 https 的。
function webGet(rawUrl, depth) {
  const d = depth || 0;
  return new Promise((resolve) => {
    if (d > 4) return resolve('');
    const mod = String(rawUrl).indexOf('https') === 0 ? require('https') : require('http');
    let req;
    try {
      req = mod.get(rawUrl, { timeout: WEB_TIMEOUT, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        const loc = res.headers['location'];
        if (res.statusCode >= 300 && loc && res.statusCode < 400) {
          res.resume();
          let next = loc;
          try { next = new URL(loc, rawUrl).href; } catch (e) {}
          return resolve(webGet(next, d + 1));
        }
        if (res.statusCode !== 200) { res.resume(); return resolve(''); }
        let buf = '';
        res.on('data', (c) => { buf += c; if (buf.length > 1500000) res.destroy(); });
        res.on('end', () => resolve(buf));
      });
      req.on('error', () => resolve(''));
      req.on('timeout', () => { try { req.destroy(); } catch (e) {} resolve(''); });
    } catch (e) {
      resolve('');
    }
  });
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&amp;/g, ' ')
    .replace(/[ \t\r\n]+/g, ' ');
}

function toAbs(href, base) {
  try { return new URL(href, base).href; } catch (e) { return ''; }
}

function pickDate(text) {
  const m = String(text || '').match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!m) return '';
  // 补零必须用 slice，'0' + '09' 会得到 '009'，日期就成了 2026-009-11
  const p = (n) => ('0' + String(n)).slice(-2);
  return m[1] + '-' + p(m[2]) + '-' + p(m[3]);
}

// 公告列表页的解析器。几个站的写法都不一样，但共同点是「一个链接 + 一个日期」，
// 所以这里按「链接 → 找同一段里的日期」来做，比给每个站各写一套稳。
const BAD_TITLE = ['更多', '首页', '导航', 'English', '上一页', '下一页', '登录', '下载', '网站声明', '版权'];

function parseAnnounce(html, base) {
  const out = [];
  const seen = {};
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,240}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const title = htmlToText(m[2]).trim();
    if (title.length < 6 || title.length > 60) continue;
    if (BAD_TITLE.some((b) => title.indexOf(b) >= 0)) continue;
    if (/^javascript:/i.test(m[1])) continue;
    const url = toAbs(m[1], base);
    if (!url) continue;
    const win = html.slice(Math.max(0, m.index - 260), m.index + 300);
    let day = pickDate(win);
    // 有些站把日期写在标题括号里
    const tail = title.match(/[（(](20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})[)）]\s*$/);
    if (!day && tail) day = tail[1];
    if (!day) day = pickDate(title);
    if (!day || seen[url]) continue;
    seen[url] = 1;
    out.push({
      title: title
        .replace(/[（(]20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}[)）]\s*$/, '')
        .trim()
        .slice(0, 40),
      url: url,
      date: day
    });
  }
  return out;
}

// 粗略判断活动类型：同学看到的是「讲座 / 比赛 / 组队 / 其他」，
// 自动归类只是为了列表里图标好看一点，猜错了同学也能改。
function guessEventType(title) {
  const t = String(title || '');
  // 校招 / 双选会 / 招聘优先判：就业中心的宣讲会、招聘会本质是「去跟企业见面」，
  // 归到讲座（🎟️）最贴近同学的认知，也和普通讲座一样点开就能看原文
  if (/校招|招聘会|双选会|就业|宣讲会|招聘/.test(t)) return 'lecture';
  if (/讲座|报告|论坛|宣讲|交流|校友|开学典礼|毕业典礼|仪式/.test(t)) return 'lecture';
  if (/运动|体育|篮球|足球|排球|田径|马拉松|越野|跑步|联赛|锦标赛|运动会|八段锦|游泳|羽毛球|乒乓/.test(t)) return 'contest';
  if (/比赛|竞赛|大赛|选拔|评选|征文|辩论/.test(t)) return 'contest';
  if (/社团|百团|音乐节|文化节|艺术|晚会|演出|展览|招新/.test(t)) return 'other';
  return 'other';
}

async function syncOfficialEvents() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // 只采集最近 7 天的官网消息：校园通知是「看一眼就知道现在要干什么」的东西，
  // 两个月前的值班安排挂在列表里只会把新消息顶下去（此前 120 天窗口攒了几十条旧通知）。
  // 7 天前的老条目已在库里的不再删除 —— 展示端（campus 页）会按同一窗口过滤。
  const minTs = today.getTime() - 7 * 86400000;
  const maxTs = today.getTime() + 90 * 86400000;
  let added = 0, updated = 0, skipped = 0;

  const pages = await Promise.all(WEB_SOURCES.map((s) => webGet(s.url).then((body) => ({ src: s, body: body }))));
  for (const p of pages) {
    if (!p.body) { skipped += 1; continue; }
    const items = parseAnnounce(p.body, p.src.url);
    for (const it of items) {
      const ts = new Date(String(it.date).replace(/-/g, '/') + ' 00:00:00').getTime();
      if (!ts || ts < minTs || ts > maxTs) continue;
      const exist = await db.collection(COL_EVENTS)
        .where({ sourceUrl: it.url }).limit(1).get().catch(() => ({ data: [] }));
      const rec = exist.data && exist.data[0];
      const data = {
        title: it.title,
        date: it.date,
        type: guessEventType(it.title),
        official: true,
        source: p.src.site,
        sourceUrl: it.url,
        at: ts,
        syncedAt: Date.now()
      };
      if (rec) {
        // 只覆盖这些字段：同学报名、作者等都是这个活动自己的，别被同步冲掉
        await db.collection(COL_EVENTS).where({ id: rec.id }).update({ data: data }).catch(() => {});
        updated += 1;
      } else {
        await db.collection(COL_EVENTS).add({
          data: Object.assign({}, data, {
            id: 'web' + String(it.url).replace(/[^a-zA-Z0-9]/g, '').slice(-24) + Date.now(),
            desc: '本条由「' + p.src.site + '」官网同步，点标题看原文',
            location: '',
            start: it.date,
            capacity: 0,
            joinedCount: 0,
            contact: '',
            author: p.src.site,
            authorOpenid: '',
            openid: '',
            time: now(),
            status: 'open'
          })
        }).catch(() => {});
        added += 1;
      }
    }
  }
  // 四个栏目全抓不到才叫失败：那多半是官网挂了 / 出网被墙 / 云函数版本太老。
  // 只挂一两个站点不算失败 —— 同学照旧能拿到另外那几个栏目的活动。
  const alive = WEB_SOURCES.length - skipped;
  const out = {
    ok: alive > 0,
    added: added,
    updated: updated,
    skipped: skipped,
    alive: alive,
    total: WEB_SOURCES.length
  };
  if (!out.ok) out.msg = '学校官网暂时打不开，稍后再试。已配置每天自动同步，明天再看。';
  return out;
}

// 谁都能触发一次（小程序里就是那个「更新」按钮）。
// 同步是只读 + 幂等的：只按 sourceUrl 增删官网条目，不动同学发布 / 报名的任何数据。
async function eventSyncFromWeb(openid, payload) {
  return syncOfficialEvents();
}

/* ================= 校园盲盒 / 漂流瓶 =================
 *
 * 规则（全部在服务端执行，前端只是展示）：
 *   - 扔：匿名，选「吐槽 / 分享 / 提问」其中一类，写一段话。每天最多扔 5 条防刷屏；
 *   - 捞：每天限 3 次（按 openid + 日期计数，改手机 / 重装都躲不开）；
 *   - 捞到的瓶子随机来自别的同学，30 天内的才可能被捞到（更老的算「沉海了」）；
 *   - 捞到时只能看到类型和内容 —— 院系这些「是谁」的信息全都锁着；
 *   - 回复之后解锁：回复的人能看到瓶子作者的院系，作者也能看到回复人的院系。
 *     「回复才解锁」是这个功能的规矩：想让别人愿意捞、愿意回，就得让认真回复的人先交出一点自己。
 *
 * 作者院系从 users 集合实时读：资料改了就跟着新，不存瓶子快照。
 */
const BOTTLE_KINDS = ['吐槽', '分享', '提问'];
const BOTTLE_LIFE_MS = 30 * 86400000;    // 瓶子 30 天后沉底，不再被捞到
const BOTTLE_DAILY_FETCH = 3;            // 每人每天限捞次数
const BOTTLE_DAILY_THROW = 5;            // 每人每天限扔条数（防刷屏，不写进 UI 也生效）

function bottleDayKey() {
  const d = new Date();
  const p = (n) => ('0' + String(n)).slice(-2);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// 某人的院系（users 集合实时读，没填就「未填写」）
async function bottleCollegeOf(openid) {
  if (!openid) return '';
  const r = await db.collection(COL_USERS).where({ openid: openid }).limit(1).get()
    .catch(() => ({ data: [] }));
  const u = r.data && r.data[0];
  return String((u && u.college) || '').trim();
}

// 扔瓶子：bottleThrow { kind, content }
async function bottleThrow(openid, payload) {
  payload = payload || {};
  const kind = BOTTLE_KINDS.indexOf(String(payload.kind || '')) >= 0 ? payload.kind : '吐槽';
  const content = String(payload.content || '').trim().slice(0, 500);
  if (!content) return { ok: false, msg: '写点什么再扔吧' };
  const g = await guard(content);
  if (!g.ok) return { ok: false, msg: g.msg };

  // 每日限扔：以天为窗口数这个人扔的条数
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const mine = await db.collection(COL_BOTTLES).where({
    openid: openid,
    thrownAt: db.command.gte(dayStart.getTime())
  }).count().catch(() => ({ total: 0 }));
  if ((mine.total || 0) >= BOTTLE_DAILY_THROW) {
    return { ok: false, msg: '今天扔得够多了，明天再来给同学们一点惊喜' };
  }

  const college = await bottleCollegeOf(openid);
  const doc = {
    id: 'b' + Date.now() + Math.floor(Math.random() * 1000),
    kind: kind,
    content: content,
    // 作者身份只锁在服务端：捞到的人永远拿不到 openid，解锁的只有院系
    openid: openid,
    // 院系是「回复后解锁」的那部分信息：存快照但只在回复成功后下发
    ownerCollege: college,
    thrownAt: Date.now(),
    replies: []
  };
  const w = await db.collection(COL_BOTTLES).add({ data: doc }).catch((e) => ({ err: e }));
  if (w && w.err) {
    const d = dbErr(w.err);
    console.error('[bottleThrow] write failed:', d.code, d.msg);
    return { ok: false, saved: false, msg: '云端没存住', detail: (d.code + ' ' + d.msg).trim() };
  }
  return { ok: true, id: doc.id };
}

// 捞瓶子：bottleFetch {} —— 每天限 3 次，随机一条 30 天内别人扔的
async function bottleFetch(openid) {
  const key = openid + '|' + bottleDayKey();
  const logRes = await db.collection(COL_BOTTLE_LOGS).where({ key: key }).limit(1).get()
    .catch(() => ({ data: [] }));
  const log = logRes.data && logRes.data[0];
  const used = (log && Number(log.count)) || 0;
  if (used >= BOTTLE_DAILY_FETCH) {
    return { ok: false, msg: '今天 ' + BOTTLE_DAILY_FETCH + ' 次机会用完了，明天再来捞', left: 0 };
  }

  // 30 天内的才捞得到；自己扔的不算；已经回复过的也尽量不再给（等作者看到回复）
  const minAt = Date.now() - BOTTLE_LIFE_MS;
  const res = await db.collection(COL_BOTTLES).where({
    openid: db.command.neq(openid),
    thrownAt: db.command.gte(minAt)
  }).limit(100).get().catch(() => ({ data: [] }));
  const pool = (res.data || []).filter((b) => !(b.replies || []).some((x) => x.openid === openid));
  if (!pool.length) {
    return { ok: false, dry: true, msg: '海里暂时没有漂流瓶，扔一个再回来捞吧', left: BOTTLE_DAILY_FETCH - used };
  }

  const picked = pool[Math.floor(Math.random() * pool.length)];
  // 捞一次记一次（inc 并发安全）；记完再返回，保证次数以服务端为准
  if (log) {
    await db.collection(COL_BOTTLE_LOGS).where({ key: key })
      .update({ data: { count: db.command.inc(1), at: Date.now() } }).catch(() => {});
  } else {
    await db.collection(COL_BOTTLE_LOGS).add({
      data: { key: key, openid: openid, day: bottleDayKey(), count: 1, at: Date.now() }
    }).catch(() => {});
  }
  return {
    ok: true,
    bottle: {
      id: picked.id,
      kind: picked.kind || '吐槽',
      content: picked.content || '',
      thrownAt: picked.thrownAt || 0,
      // 捞到时锁着院系：回复成功才解锁（见 bottleReply）
      ownerCollege: '',
      locked: true
    },
    left: BOTTLE_DAILY_FETCH - used - 1
  };
}

// 回复捞到的瓶子：bottleReply { id, content } —— 回复成功即解锁对方院系
async function bottleReply(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '');
  const content = String(payload.content || '').trim().slice(0, 300);
  if (!id) return { ok: false, msg: '瓶子不见了，重新捞一个吧' };
  if (!content) return { ok: false, msg: '回复写点什么吧' };
  const g = await guard(content);
  if (!g.ok) return { ok: false, msg: g.msg };

  const hit = await db.collection(COL_BOTTLES).where({ id: id }).limit(1).get()
    .catch(() => ({ data: [] }));
  const bottle = hit.data && hit.data[0];
  if (!bottle) return { ok: false, msg: '这只瓶子已经沉海了' };
  if (bottle.openid === openid) return { ok: false, msg: '这是你自己扔的瓶子' };

  const replyerCollege = await bottleCollegeOf(openid);
  const reply = {
    id: 'br' + Date.now() + Math.floor(Math.random() * 1000),
    content: content,
    openid: openid,
    college: replyerCollege, // 作者侧解锁用：作者能在「我的瓶子」里看到回复人的院系
    at: Date.now()
  };
  // each 写法明确「把数组里的每一项逐个追加」：直接 push([reply]) 在不同 SDK 版本上
  // 有被当成「追加一个数组元素」的风险，聊天消息那边也是这么写的，保持一致
  const w = await db.collection(COL_BOTTLES).where({ id: id })
    .update({ data: { replies: db.command.push({ each: [reply] }) } }).catch((e) => ({ err: e }));
  if (w && w.err) {
    const d = dbErr(w.err);
    console.error('[bottleReply] write failed:', d.code, d.msg);
    return { ok: false, saved: false, msg: '云端没存住', detail: (d.code + ' ' + d.msg).trim() };
  }
  // 解锁：回复的人此刻拿到瓶子作者的院系
  return { ok: true, ownerCollege: String(bottle.ownerCollege || '未填写'), replies: (bottle.replies || []).length + 1 };
}

// 我的瓶子：bottleMine {} —— 我扔的（含收到的回复 + 回复人院系）与今日剩余次数
async function bottleMine(openid) {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const res = await db.collection(COL_BOTTLES).where({
    openid: openid,
    thrownAt: db.command.gte(dayStart.getTime() - BOTTLE_LIFE_MS)
  }).limit(20).get().catch(() => ({ data: [] }));

  // 作者侧解锁：回复人的院系是回复那一刻对方交出来的，直接下发
  const mine = (res.data || []).map((b) => ({
    id: b.id,
    kind: b.kind || '吐槽',
    content: b.content || '',
    thrownAt: b.thrownAt || 0,
    replies: (b.replies || []).map((r) => ({
      id: r.id,
      content: r.content || '',
      at: r.at || 0,
      college: String(r.college || '未填写')
    }))
  })).sort((a, b) => b.thrownAt - a.thrownAt);

  const logRes = await db.collection(COL_BOTTLE_LOGS).where({ key: openid + '|' + bottleDayKey() }).limit(1).get()
    .catch(() => ({ data: [] }));
  const used = (logRes.data && logRes.data[0] && Number(logRes.data[0].count)) || 0;
  return { ok: true, mine: mine, fetchedToday: used, left: Math.max(0, BOTTLE_DAILY_FETCH - used) };
}

// 从师资页正文里抽人名。规则很粗：2-4 个汉字、不在黑名单里。
// 宁可漏几个，也别把「计算机科学与技术系」「主任」这类词塞进名录，
// 那会让同学在选老师时看到一串假老师。
const NAME_STOP = ['系', '主任', '副主任', '导师', '老师', '学院', '大学', '学校', '中心', '办公室',
  '建设', '发展', '项目', '研究', '教学', '课程', '学生', '教师', '管理', '工程', '技术', '科学',
  '委员会', '工作', '专业', '方向', '重点', '团队', '计划', '申报', '博导', '硕导', '职称', '高级',
  '级', '组', '员', '公告', '通知', '师资', '队伍', '队伍', '博士', '硕士', '本科', '研究生'];

function parseTeacherNames(html, fromMark) {
  const text = htmlToText(html);
  const from = fromMark ? text.indexOf(fromMark) : -1;
  const seg = from >= 0 ? text.slice(from, from + 3200) : text.slice(0, 3200);
  const cleaned = seg.replace(/[^一-龥\s]/g, ' ');
  const names = [];
  const seen = {};
  cleaned.split(/\s+/).forEach((w) => {
    const w2 = w.trim();
    if (w2.length < 2 || w2.length > 4) return;
    if (!/^[一-龥]{2,4}$/.test(w2)) return;
    if (NAME_STOP.some((s) => w2.indexOf(s) >= 0)) return;
    if (seen[w2]) return;
    seen[w2] = 1;
    names.push(w2);
    if (names.length >= 200) return;
  });
  return names;
}

async function syncOfficialTeachers() {
  let added = 0, updated = 0;
  const pages = await Promise.all(TEACHER_SOURCES.map((s) => webGet(s.url).then((body) => ({ src: s, body: body }))));
  for (const p of pages) {
    if (!p.body) continue;
    const names = parseTeacherNames(p.body, p.src.from);
    for (const name of names) {
      const exist = await db.collection(COL_TEACHERS)
        .where({ name: name, college: p.src.site }).limit(1).get().catch(() => ({ data: [] }));
      const rec = exist.data && exist.data[0];
      if (rec) { updated += 1; continue; }
      const w = await db.collection(COL_TEACHERS).add({
        data: {
          id: 't' + p.src.key + name + Date.now(),
          name: name,
          college: p.src.site,
          official: true,
          sourceUrl: p.src.url,
          at: Date.now()
        }
      }).catch(() => ({ err: true }));
      if (!w || !w.err) added += 1;
    }
  }
  return { ok: true, added: added, updated: updated };
}

async function teacherSyncFromWeb(openid) {
  return syncOfficialTeachers();
}

/* ---------------- 教师名录 ---------------- */

// 同学自己补一个老师：官网名录覆盖不到的学院、新入职的老师都靠这一步。
// 写入时带上 openid，别人不能改也不能删。
async function teacherAdd(openid, payload) {
  payload = payload || {};
  const name = String(payload.name || '').trim();
  const college = String(payload.college || '').trim().slice(0, 30);
  if (!name) return { ok: false, msg: '老师名字得写一下' };
  if (!/^[一-龥·]{2,6}$/.test(name)) return { ok: false, msg: '名字看起来不太对，填个中文名' };
  const hit = await db.collection(COL_TEACHERS)
    .where({ name: name, college: college || '' }).limit(1).get().catch(() => ({ data: [] }));
  if (hit.data && hit.data.length) return { ok: true, id: hit.data[0].id, already: true };
  const doc = {
    id: 'tu' + Date.now() + Math.floor(Math.random() * 1000),
    name: name,
    college: college,
    official: false,
    openid: openid,
    at: Date.now()
  };
  const w = await db.collection(COL_TEACHERS).add({ data: doc }).catch((e) => ({ err: e }));
  if (w && w.err) {
    const d = dbErr(w.err);
    console.error('[teacherAdd] write failed:', d.code, d.msg);
    return { ok: false, saved: false, msg: '云端没存住', detail: (d.code + ' ' + d.msg).trim() };
  }
  return { ok: true, teacher: doc };
}

async function teacherList(openid, payload) {
  payload = payload || {};
  const kw = String(payload.keyword || '').trim();
  const college = String(payload.college || '').trim();
  const where = {};
  // 模糊搜索走不了正则（云数据库不支持），只能先按精确条件筛再在内存里过滤
  if (college) where.college = college;
  if (!kw) {
    // 名录就几百条，一次性全给：下拉补全要的是「输一个字就能筛出人」，分页没意义
    const res = await db.collection(COL_TEACHERS).limit(2000).get().catch(() => null);
    let list = (res && res.data) || [];
    if (college) list = list.filter((t) => t.college === college);
    return { ok: true, list: list.map((t) => Object.assign({}, t, { isMine: !!openid && (t.openid === openid) })) };
  }
  const res2 = await db.collection(COL_TEACHERS).limit(500).get().catch(() => null);
  let list = (res2 && res2.data) || [];
  if (college) list = list.filter((t) => t.college === college);
  // 名字匹配 + 学院也匹配：同学输入「王 计算机」这种尽量能搜到
  list = list.filter((t) => {
    const hay = (t.name || '') + ' ' + (t.college || '');
    return hay.indexOf(kw) >= 0;
  }).slice(0, 20);
  return { ok: true, list: list.map((t) => Object.assign({}, t, { isMine: !!openid && (t.openid === openid) })) };
}

async function teacherRemove(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  const hit = await db.collection(COL_TEACHERS).where({ id: id }).limit(1).get().catch(() => ({ data: [] }));
  const rec = hit.data && hit.data[0];
  if (!rec) return { ok: true };
  if (rec.official === true) return { ok: false, msg: '官方名录里的老师不能删' };
  if (rec.openid !== openid) return { ok: false, msg: '只能删除自己添加的老师' };
  await db.collection(COL_TEACHERS).where({ id: id }).remove().catch(() => {});
  return { ok: true };
}

/* ---------------- 备忘录（只自己可见） ---------------- */

// 备忘录记的是「我自己想留下的事」，跟论坛正好相反：
// 这里没有任何人（包括审核员）应该看到别人的记录，所以读写一律带 openid 过滤，
// 在服务端强制——前端藏不藏都一样，绕过云函数直接写库也只会写到自己名下。
const MEMO_TEXT_MAX = 2000; // 单条正文上限，超长的基本是复制粘贴误操作
const MEMO_MAX = 800;       // 单用户条数上限，防止有人把集合撑爆

function memoDateStr(d) {
  const t = d || new Date();
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
}

async function memoList(openid) {
  if (!openid) return { ok: true, list: [] };
  const res = await db.collection(COL_MEMOS)
    .where({ openid: openid })
    .orderBy('at', 'desc')
    .limit(300)
    .get().catch(() => null);
  return { ok: true, list: (res && res.data) || [] };
}

async function memoSave(openid, payload) {
  // 兼容两种喂法：memoSave(openid, { item }) 和直接把一条记录当参数丢进来
  payload = (payload && payload.item) || payload || {};
  const text = String(payload.text || '').trim().slice(0, MEMO_TEXT_MAX);
  if (!text) return { ok: false, msg: '还没写内容' };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.date || '')) ? payload.date : memoDateStr();
  const mood = String(payload.mood || '').slice(0, 10);
  // id 带随机后缀：只用 Date.now() 的话，同一毫秒里写两条会撞 id，
  // 后一条会被当成「编辑前一条」，用户看到的就是「我明明写了两条只剩一条」
  const id = String(payload.id || ('memo' + Date.now() + Math.floor(Math.random() * 1000)));

  // 归属校验：带 id 过来时，那一条必须是我自己的
  const hit = await db.collection(COL_MEMOS).where({ id: id }).limit(1).get().catch(() => ({ data: [] }));
  const old = (hit && hit.data && hit.data[0]) || null;
  if (old && String(old.openid || old._openid || '') !== openid) {
    return { ok: false, msg: '这条不是你的，改不了' };
  }
  const data = {
    id: id,
    openid: openid,
    text: text,
    date: date,
    mood: mood,
    at: Date.now()
  };
  // 只有新增才判总量：编辑自己那条不该被上限拦住
  if (!old) {
    const cnt = await db.collection(COL_MEMOS).where({ openid: openid }).count().catch(() => null);
    if (cnt && cnt.total >= MEMO_MAX) return { ok: false, msg: '备忘录最多 ' + MEMO_MAX + ' 条' };
  }
  // 写不进去要如实报：备忘只有云端一份，报成功却没落库 = 用户明明天天记、刷新就没了
  const w = old
    ? await db.collection(COL_MEMOS).where({ id: id }).update({ data: data }).catch((e) => ({ err: e }))
    : await db.collection(COL_MEMOS).add({ data: data }).catch((e) => ({ err: e }));
  if (w && w.err) {
    const d = dbErr(w.err);
    console.error('[memoSave] write failed:', d.code, d.msg);
    return { ok: false, saved: false, msg: '云端没存住', detail: (d.code + ' ' + d.msg).trim() };
  }
  return { ok: true, item: data };
}

async function memoRemove(openid, payload) {
  payload = payload || {};
  const id = String(payload.id || '');
  if (!id) return { ok: false, msg: '参数缺失' };
  // where 里带上 openid：就算猜到别人的 id 也删不掉
  await db.collection(COL_MEMOS).where({ id: id, openid: openid }).remove().catch(() => {});
  return { ok: true };
}

/* ---------------- 入口 ---------------- */

// 定时触发器专用入口：抓官网活动 + 学院师资。
// 两条同步都是只读 + 幂等的，跟「谁触发的」无关，所以不需要 openid。
// 抓不完不让整个函数抛错 —— 触发失败会连着失败告警会淹没真问题，如实回 ok:false 就够了
async function runTimerSync() {
  let events = null;
  let teachers = null;
  const errs = [];
  try {
    events = await syncOfficialEvents();
  } catch (e) {
    errs.push('events: ' + ((e && e.message) || String(e)));
  }
  try {
    teachers = await syncOfficialTeachers();
  } catch (e) {
    errs.push('teachers: ' + ((e && e.message) || String(e)));
  }
  console.info('[dailyWebSync] events=', JSON.stringify(events && { added: events.added, updated: events.updated, alive: events.alive }),
    ' teachers=', JSON.stringify(teachers && { added: teachers.added, updated: teachers.updated }),
    ' errors=', JSON.stringify(errs));
  return {
    ok: errs.length === 0,
    trigger: 'dailyWebSync',
    events: events,
    teachers: teachers,
    msg: errs.join('; ')
  };
}

exports.main = async (event) => {
  const openid = await me();
  const action = String((event && event.action) || '');

  // 定时触发器（config.json 的 dailyWebSync）叫醒云函数时，微信传来的 event 里
  // 没有 action 这个字段，直接落到 default 只会得到一句「未知操作」——
  // 官网活动 / 教师名录就永远只能靠人手点「更新」，所谓的每天自动同步从来没跑起来过
  if (!action || event && event.Type === 'Timer') {
    return runTimerSync();
  }


  // 诊断类动作不需要用户身份：云开发控制台的「测试」不携带 openid，
  // 如果放在下面的统一校验之后，diag/whoami 在控制台里永远跑不了
  if (action === 'diag') {
    return diag();
  }
  if (action === 'whoami') {
    return { ok: true, openid: openid || '', note: openid ? '' : '控制台测试无用户身份，openid 为空属正常' };
  }

  if (!openid) return { ok: false, msg: '无法识别用户身份' };

  try {
    switch (action) {
      case 'upsertProfile':
        return upsertProfile(openid, event);
      case 'getProfile':
        return getProfile(openid, String(event.openid || ''));
      case 'search':
        return search(openid, event.keyword, event.exact);
      case 'addRequest':
        return addRequest(openid, event);
      case 'respond':
        return respond(openid, event);
      case 'listRequests':
        return listRequests(openid);
      case 'listOutgoing':
        return listOutgoing(openid);
      case 'listFriends':
        return listFriends(openid);
      case 'block':
        return blockUser(openid, event);
      case 'unblock':
        return unblockUser(openid, event);
      case 'listBlocks':
        return listBlocks(openid);
      case 'report':
        return report(openid, event);
      case 'getQueue':
        return getQueue(openid);
      case 'resolveReports':
        return resolveReports(openid, event);
      case 'setStatus':
        return setStatus(openid, event);
      case 'delContent':
        return delContent(openid, event);
      case 'patchContent':
        return patchContent(openid, event);
      case 'whoami':
        return { ok: true, openid: openid, isMod: await isModerator(openid) };
      case 'setAdmin':
        return setAdmin(openid);
      case 'saveFavorites':
        return saveFavorites(openid, event);
      case 'getFavorites':
        return getFavorites(openid);
        case 'postAdd':
          return postAdd(openid, event);
        case 'reviewAdd':
          return reviewAdd(openid, event);
        case 'courseAdd':
          return courseAdd(openid, event);
        case 'courseRemove':
          return courseRemove(openid, event);
        case 'likeToggle':
          return likeToggle(openid, event);
      case 'postPin':
        return postPin(openid, event);
      case 'cfgGet':
        return cfgGet(openid);
      case 'cfgSave':
        return cfgSave(openid, event);
      case 'calendarReset':
        return calendarReset(openid);
        case 'marketAdd':
          return marketAdd(openid, event);
      case 'marketList':
        return marketList(openid, event);
      case 'marketDone':
        return marketDone(openid, event);
      case 'marketRemove':
        return marketRemove(openid, event);
      case 'chatSend':
        return chatSend(openid, event);
      case 'chatList':
        return chatList(openid);
      case 'chatHistory':
        return chatHistory(openid, event);
      case 'postComment':
        return postComment(openid, event);
      case 'commentRemove':
        return commentRemove(openid, event);
      case 'commentReport':
        return commentReport(openid, event);
      case 'resourceAdd':
        return resourceAdd(openid, event);
      case 'resourceList':
        return resourceList(openid, event);
      case 'resourceUrl':
        return resourceUrl(openid, event);
      case 'resourceThanks':
        return resourceThanks(openid, event);
      case 'resourceRemove':
        return resourceRemove(openid, event);
      case 'calendarList':
        return calendarList();
      case 'calendarSave':
        return calendarSave(openid, event);
      case 'calendarRemove':
        return calendarRemove(openid, event);
      case 'placeList':
        return placeList(openid, event);
      case 'placeAdd':
        return placeAdd(openid, event);
      case 'placeRemove':
        return placeRemove(openid, event);
      // 校园活动
      case 'eventAdd':
        return eventAdd(openid, event);
      case 'eventList':
        return eventList(openid, event);
      case 'eventJoin':
        return eventJoin(openid, event);
      case 'eventCancel':
        return eventCancel(openid, event);
      case 'eventRemove':
        return eventRemove(openid, event);
      // 官网数据同步
      case 'eventSyncFromWeb':
        return eventSyncFromWeb(openid, event);
      case 'teacherSyncFromWeb':
        return teacherSyncFromWeb(openid);
      // 校园盲盒 / 漂流瓶：扔、捞（每日 3 次）、回复解锁院系、我的瓶子
      case 'bottleThrow':
        return bottleThrow(openid, event);
      case 'bottleFetch':
        return bottleFetch(openid);
      case 'bottleReply':
        return bottleReply(openid, event);
      case 'bottleMine':
        return bottleMine(openid);
      case 'courseTypeSet':
        return courseTypeSet(openid, event);
      case 'courseTypeList':
        return courseTypeList();
      case 'teacherAdd':
        return teacherAdd(openid, event);
      case 'teacherList':
        return teacherList(openid, event);
      case 'teacherRemove':
        return teacherRemove(openid, event);
      // 误加课程的收尾通道：加课人不管了的时候，别人也能把它清掉
      case 'courseReqVote':
        return courseReqVote(openid, event);
      case 'courseReqInfo':
        return courseReqInfo(openid, event);
      case 'memoList':
        return memoList(openid);
      case 'memoSave':
        return memoSave(openid, event);
      case 'memoRemove':
        return memoRemove(openid, event);
      case 'diag':
        return diag();
      case 'checkText':
        // 服务端权威校验：前端绕过云函数直接写库也躲不过这一步
        return checkText(event.title || '', event.content || '');
      case 'ensureSeed':
        return ensureSeed(event);
      default:
        return { ok: false, msg: '未知操作：' + action };
    }
  } catch (e) {
    return { ok: false, msg: (e && e.message) || '服务端出错' };
  }
};

// 把处置阈值也导出去：前端 utils/config.js 的 MODERATION 是照这份写的展示文案，
// 两边一旦分叉，页面上写的和云上实际干的事就对不上了
module.exports.MOD_RULES = MOD_RULES;
