// utils/config.js —— 云开发开关配置
// 已启用云端共享：评价/帖子/评论/点赞/同学自建课程 均存到微信云开发，所有用户可见。
// 环境 ID 来自用户微信公众平台「开发 → 开发设置」。
//
// 云端需要的集合（云开发控制台 → 数据库 → 新建集合），一个都不能少：
//   users       —— 个人资料（openid 作 _id，昵称/头像/学院/联系方式）
//   contacts    —— 「想认识」请求与好友关系（status: pending / accepted / rejected）
//   blocks      —— 拉黑名单
//   reports     —— 举报记录
//   posts       —— 论坛帖子（含 courseId / courseName / authorOpenid）
//   reviews     —— 课程评价
//   courses     —— 同学共建课程（官方 903 门课在前端 seed 里，这里只存同学新加的课）
//   admins      —— 审核员名册
//   favorites   —— 收藏（_id = openid，一个人一条）
//   market      —— 失物招领 / 二手交易
//   chats       —— 私信会话
//   resources   —— 学习资料元数据（文件本体在云存储）
//   calendar    —— 校历节点
//   places      —— 校园地点
//   memos       —— 备忘录（个人数据）
//   events      —— 校园活动
//   event_joins —— 活动报名
//   teachers    —— 教师名录
//   course_reqs —— 删除课程的申请
//   app_config  —— 运行配置（订阅消息模板 ID 等）
//
// 注意：早期版本的「点赞记录」likes 集合已经不用了 —— 赞踩收口到 posts 的
// likedBy / dislikedBy 两个数组里。谁要是照着老文档去建 likes，建了也没人写。
// 权限统一设为「所有用户可读，仅创建者可写」。
// users 和 contacts 里的联系方式只在云函数里做过滤后再返回，前端拿不到别人的原始数据。
module.exports = {
  USE_CLOUD: true,
  CLOUD_ENV: 'cloud1-d7gt0m02190b0d801',
  // 示例内容开关：false = 不再灌入/展示 16 条示例帖和 14 条示例评价。
  // 关掉后：新环境不再灌种子；本地缓存与云端拉回的示例帖在展示层自动过滤。
  // 课程库（903 门课）不受影响，始终保留。
  KEEP_SEED_CONTENTS: false,

  // 订阅消息模板 ID（留空则不弹授权、也不发通知，其他功能照常）。
  // 从 mp 后台「订阅消息 → 公共模板库」选用后把 ID 粘进来：
  //   reply —— 有人回复 / 评论我的帖子
  //   chat  —— 收到新的私信
  // 前端只负责「要授权」，真正下发在云函数（云函数那侧也要配 SUBMSG_REPLY / SUBMSG_CHAT）。
  SUBMSG: {
    reply: '',
    chat: ''
  },

  // 审核员白名单（前端展示用：决定「我的」页显不显示内容审核 / 复制身份 ID / 环境自检）。
  // ⚠️ 真正的门禁在云函数环境变量 MODERATORS 里，两边要一起维护 ——
  //    这份只管「入口显不显示」，改了这里的名单并不给谁开权限。
  // 留空时这三个入口对所有人隐藏；填 openid 后，名单里的人在「我的」页能看到这些入口。
  MODERATORS: ['onXs_3QKa6Png2RtMcCfR1PTSKdA'],

  // 举报自动处置阈值（前端只用于展示说明文案，真正生效的是云函数里那份）
  MODERATION: {
    HIGH_RISK: ['涉及隐私', '违规交易', '广告骚扰'], // 高敏原因：单人命中即可能下架
    CONTENT_THRESHOLD: 3,   // 同一条内容 24h 内累计这么多条举报 → 自动下架
    // 限时多人举报 → 直接删除。前端只是展示用，真正生效的是云函数 cloudfunctions/user 里那份，
    // 改的时候两边一起改，只改一边会让页面说明和实际行为对不上
    AUTO_DELETE_THRESHOLD: 5, // 任意原因 24h 内累计这么多条 → 直接删除
    // 高敏原因（广告骚扰 / 涉及隐私 / 违规交易）走两档：
    // 凑够人数且**有人给出可查证的线索**才直接删；只有口径没证据的先下架等人工。
    // 这样堵住了「两个人合起来选个高敏原因就能删任何帖子」的路
    HIGH_RISK_DELETE: 2,      // 高敏原因累计这么多 + 有证据 → 直接删除
    HIGH_RISK_DELETE_SOLE: 1, // 只要 1 条，但「内容踩了屏蔽词 + 举报人写了可查线索」→ 直接删除
    HIGH_RISK_HIDE: 2,        // 高敏原因累计这么多但没证据 → 先下架
    AUTHOR_THRESHOLD: 5,    // 同一作者 24h 内累计这么多条举报 → 其新帖自动暂停展示
    AUTHOR_WINDOW_H: 24,    // 上面的计数窗口（小时）

    // 冷启动期（全站 24h 举报总数低于 COLD_REPORTS）自动放宽的一档阈值，
    // 社区热起来后会自己涨回上面的正式值，不用谁去手动改
    COLD_REPORTS: 8,
    COLD_CONTENT: 2,          // 冷启动：这么多条 → 自动下架
    COLD_AUTO_DELETE: 3,      // 冷启动：这么多条 → 直接删除（正式值 5，不再往下松：删除是最重的动作）
    COLD_HIGH_RISK_DELETE: 1, // 冷启动：1 条高敏 + 有证据 → 直接删除
    COLD_HIGH_RISK_HIDE: 1,   // 冷启动：1 条高敏但没证据 → 先下架
    COLD_COMMENT_DELETE: 2,   // 冷启动：留言这么多条 → 直接删除

    // 反滥用：从「驳回满 3 次永久作废」改成有窗口、能自己好起来的观察期。
    // 观察期内举报照样受理，只是不参与自动处置，全部转人工；
    // 熬过 OBSERVE_H 自动解除，或观察期内再熬满 OBSERVE_GRACE_H 没新的驳回也能提前恢复
    ABUSER_WINDOW_D: 7,       // 只数最近这么多天被驳回的举报
    ABUSER_LIMIT: 3,          // 最近这么多天被驳回满这么多次 → 进观察期
    OBSERVE_H: 48,            // 观察期时长（小时），到点自动解除
    OBSERVE_GRACE_H: 24,      // 观察期内连续这么久没有新的驳回 → 提前恢复
    ABUSER_BADGE: '观察期'    // 观察期内在审核队列里显示的标签
  }
};
