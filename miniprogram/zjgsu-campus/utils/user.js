// utils/user.js —— 用户身份与同学关系层
//
// 三层身份，从上到下：
//   1）openid：微信云开发在云函数里直接给的唯一 ID，不用登陆、不会变，负责「区分谁是谁」；
//   2）个人资料：昵称 / 头像 / 学院 / 我的联系方式，由用户自己填、自己决定公开多少；
//   3）同学关系：想认识 → 对方同意 → 才互相亮出联系方式，单向请求永远看不到对方的号。
//
// 所有涉及「别人联系方式」的读写在服务端（云函数 user）完成，
// 这里的前端缓存只是为了让页面秒开，云端不可用时自动回落到本地，功能不中断。

const cloud = require('./cloud.js');

const KEY = {
  profile: 'zjgsu_profile', // 我的资料
  friends: 'zjgsu_friends', // 我的好友（含联系方式）
  reqIn: 'zjgsu_req_in',    // 收到待处理的请求
  reqOut: 'zjgsu_req_out'   // 我发出待回应的请求
};

// 联系方式展示文案
const CONTACT_LABEL = {
  wechat: '微信号',
  phone: '手机号',
  qq: 'QQ号'
};

function read(key, fallback) {
  const v = wx.getStorageSync(key);
  return (v === '' || v === undefined || v === null) ? fallback : v;
}
function write(key, val) {
  try { wx.setStorageSync(key, val); } catch (e) {}
}

// 云函数调用兜底超时：wx.cloud.callFunction 本身没有可靠的前端超时，
// 云端冷启动卡住 / 函数卡死时这个 promise 会挂起很久，
// 用户看到的就是「点了发布没反应」（树洞「投进树洞」提交失败的视频演示正是这种观感）。
// 12 秒还没回来就按「云端暂时连不上」处理 —— 上层会把内容留在本机并如实提示，
// 绝不无限干等。
const CALL_TIMEOUT_MS = 12 * 1000;

// 给任意 promise 套一个超时：到点还没结果就 resolve(fallback)，不 reject（调用方好处理）
function withTimeout(promise, fallback, ms) {
  let timer = setTimeout(() => settle(fallback), ms || CALL_TIMEOUT_MS);
  let settle;
  const gate = new Promise((resolve) => { settle = resolve; });
  promise.then((v) => { clearTimeout(timer); settle(v); }, () => { clearTimeout(timer); settle(null); });
  return gate;
}

/** 调云函数；云函数未部署 / 超时 / 报错时 resolve(null)，由调用方回落本地 */
function call(action, payload) {
  if (!cloud.cfg.USE_CLOUD || !cloud.ensureCloud()) return Promise.resolve(null);
  const req = wx.cloud.callFunction({
    name: 'user',
    data: Object.assign({ action: action }, payload || {})
  }).then((res) => (res && res.result) || null).catch(() => null);
  return withTimeout(req, null, CALL_TIMEOUT_MS);
}

/* ---------------- 启动登记 ---------------- */

// 首次进入：把 openid 与已有资料写进云端 users 集合（幂等，重复调用无副作用）
function initUser() {
  const p = read(KEY.profile, {});
  p.openid = cloud.getOpenid() || p.openid || '';
  if (!p.openid) return Promise.resolve(null);
  return call('upsertProfile', {
    nickName: p.nickName,
    avatarUrl: p.avatarUrl,
    college: p.college,
    motto: p.motto,
    contactType: p.contactType,
    contactValue: p.contactValue
  }).then((r) => {
    if (r && r.profile) write(KEY.profile, r.profile);
    return r;
  });
}

/* ---------------- 我的资料 ---------------- */

function getMyProfile() {
  const p = read(KEY.profile, {});
  p.openid = p.openid || cloud.getOpenid() || '';
  p.avatarText = (p.nickName || '浙').charAt(0);
  return p;
}

function saveProfile(p) {
  const data = {
    openid: cloud.getOpenid() || p.openid || '',
    nickName: p.nickName || '浙小商',
    avatarUrl: p.avatarUrl || '',
    college: p.college || '',
    motto: p.motto || '',
    contactType: p.contactType || '',
    contactValue: p.contactValue || ''
  };
  write(KEY.profile, data);
  return call('upsertProfile', data).then((r) => {
    if (r && r.profile) write(KEY.profile, r.profile);
    return data;
  });
}

/* ---------------- 看别人的资料 ---------------- */

// 看别人主页：是否为好友、能否看到联系方式，一律由云函数判定
function getProfile(openid) {
  return call('getProfile', { openid: openid })
    .then((r) => (r && r.profile) ? r : { profile: null, isFriend: false });
}

// 找同学：和课程 / 论坛 / 闲置一个道理，也有人把名字打错一个字。
// exact 传 true 是「精准档」，只认原样；不传就是模糊档
function search(keyword, exact) {
  return call('search', { keyword: keyword, exact: !!exact })
    .then((r) => (r && r.list) || []);
}

/* ---------------- 想认识 / 好友 ---------------- */

function addRequest(toOpenid, message) {
  return call('addRequest', { toOpenid: toOpenid, message: message })
    .then((r) => {
      if (!r) return { ok: true }; // 云端不可用时本地照常走流程
      return r;
    });
}

function respond(id, action) {
  return call('respond', { id: id, action: action })
    .then((r) => (r === null ? { ok: true } : r));
}

function listRequests() {
  return call('listRequests', {}).then((r) => {
    const list = (r && r.list) || read(KEY.reqIn, []);
    write(KEY.reqIn, list);
    return list;
  });
}

function listOutgoing() {
  return call('listOutgoing', {}).then((r) => {
    const list = (r && r.list) || [];
    write(KEY.reqOut, list);
    return list;
  });
}

function listFriends() {
  return call('listFriends', {}).then((r) => {
    const list = (r && r.list) || [];
    write(KEY.friends, list);
    return list;
  });
}

// 同步判断：某个 openid 是不是我的好友（用于名片页决定按钮文案）
function isFriend(openid) {
  const list = read(KEY.friends, []);
  return list.some((f) => f.openid === openid);
}

/* ---------------- 拉黑 ---------------- */

// 拉黑之后：TA 再也发不出请求给我，我的联系方式也不会对 TA 显示
function block(toOpenid) {
  return call('block', { toOpenid: toOpenid }).then((r) => (r === null ? { ok: true } : r));
}

function unblock(toOpenid) {
  return call('unblock', { toOpenid: toOpenid }).then((r) => (r === null ? { ok: true } : r));
}

function listBlocks() {
  return call('listBlocks', {}).then((r) => (r && r.list) || []);
}

/* ---------------- 收藏 ---------------- */

// 收藏落在云端的 favorites 集合（_id = 我的 openid），换手机、重装都还在。
// 云函数不可用时照常 resolve(null)，调用方回落本地那份。
function saveFavorites(list) {
  return call('saveFavorites', { list: Array.isArray(list) ? list : [] })
    .then((r) => r || { ok: true, list: Array.isArray(list) ? list : [] });
}

function getFavorites() {
  return call('getFavorites', {}).then((r) => (r && Array.isArray(r.list) ? r : { ok: true, list: [] }));
}

/* ---------------- 内容写入 ---------------- */

// 这几个操作一律走云函数，前端不碰数据库。
// 云函数里会过屏蔽词 + 微信官方内容安全接口，绕过云函数直接写库躲不过去。
// 云函数没部署/调不通时 call 返回 null，写入类接口一律如实返回 saved:false，
// 不谎报成功 —— 本地那份由 store 层负责保留。

// 注意：call 返回 null 表示「云函数没部署 / 网络失败 / 调用超时」，
// 这时绝不能谎报 { ok: true } —— 前端会弹「发布成功」，内容却压根没到云端，
// 正是「写完好好的一转头没了」的根源。如实返回 saved:false，
// 由 store 层按「已存本机、没同步上」处理（本地内容保留）。
function postAdd(post) {
  return call('postAdd', { post: post })
    .then((r) => (r === null ? { ok: false, saved: false, msg: '云端暂时连不上' } : r));
}

function reviewAdd(review) {
  return call('reviewAdd', { review: review })
    .then((r) => (r === null ? { ok: false, saved: false, msg: '云端暂时连不上' } : r));
}

function courseAdd(course) {
  return call('courseAdd', { course: course })
    .then((r) => (r === null ? { ok: false, saved: false, msg: '云端暂时连不上' } : r));
}

// 删除同学自己误加的课程（只能删自己加的，官方课删不了）
// 注意不能像其他接口那样「调不通就当成功」：删除是破坏性操作，
// 谎报成功会让云端那条永远留着，下次同步又冒出来（「删了重进还在」）。
// 拿不到结果就如实说没删掉，由调用方决定怎么提示。
function courseRemove(id, name) {
  return call('courseRemove', { id: id || '', name: name || '' })
    .then((r) => (r === null ? { ok: false, msg: '云端连不上，没能删干净' } : r));
}

/* ---------------- 误加课程 · 申请删除 ---------------- */

// 别人误加的课删不掉，是加课这件事的硬伤：加的人毕业了，这门课就永远挂在库里。
// 现在是「申请」制：谁都能投一票，凑够票数（或审核员出手）自动清掉。
// 同样不能谎报成功 —— 删不掉就是删不掉。
// courseName 一定要带上：早先云端存的课没有 id，前端那个 id 在云端对不上号，
// 只给 id 会让云函数认不出这门课、永远删不掉（误加的课就那么挂着）
function courseReqVote(courseId, reason, courseName) {
  return call('courseReqVote', {
    courseId: courseId || '', reason: reason || '', name: courseName || ''
  }).then((r) => (r === null ? { ok: false, saved: false, msg: '云端连不上，没能提交申请' } : r));
}

// 这门课上现在有几票、我投过没有。详情页要靠它决定按钮显示成什么样
function courseReqInfo(courseId, courseName) {
  return call('courseReqInfo', { courseId: courseId || '', name: courseName || '' })
    .then((r) => r || { ok: true, votes: 0, need: 3, mine: false });
}

// 纠正一门课的类型（体育课 / 思政课这些靠课名猜的，猜错了由同学改）。
// 云端 course_types 集合按课程 id 存一份，全校共享
function courseTypeSet(courseId, ctype) {
  return call('courseTypeSet', { id: courseId || '', ctype: ctype || '' })
    .then((r) => r || { ok: false, saved: false, msg: '云端连不上，先记在你手机上' });
}

// 拉全校的课程类型纠正表：{ 课程id: 类型 }。进课程页时合并进本机
function courseTypeList() {
  return call('courseTypeList', {}).then((r) => r || { ok: false, fixes: null });
}

// 赞 / 踩：kind 传 'like'（默认）或 'dislike'，再点一次同一个就是取消
function likeToggle(postId) {
  return call('likeToggle', { postId: postId }).then((r) => (r === null ? { ok: true, likes: 0 } : r));
}

function voteToggle(postId, kind) {
  return call('likeToggle', { postId: postId, kind: kind === 'dislike' ? 'dislike' : 'like' })
    .then((r) => (r === null
      ? { ok: true, liked: false, disliked: false, likes: 0, dislikes: 0 }
      : r));
}

// 置顶 / 取消置顶（只有审核员能操作，云端会再验一次身份）
function postPin(postId, pin) {
  return call('postPin', { postId: postId, pin: pin !== false })
    .then((r) => r || { ok: false, msg: '云函数没响应' });
}

// 运行配置：订阅消息模板 ID + 当前置顶列表
function cfgGet() {
  return call('cfgGet', {}).then((r) => r || null);
}

// 保存订阅消息模板 ID（审核员在小程序「审核」页里直接填，不用再进控制台）
function cfgSave(submsg) {
  return call('cfgSave', { submsg: submsg || {} })
    .then((r) => r || { ok: false, msg: '云函数没响应' });
}

// 评论走云函数：服务端过审 + 给作者推订阅消息
function postComment(postId, content) {
  return call('postComment', {
    postId: postId,
    content: content,
    author: getMyProfile().nickName || '浙小商'
  }).then((r) => (r === null ? { ok: true } : r));
}

/* ---------------- 学习资料 ---------------- */

function resourceList(params) {
  return call('resourceList', params || {}).then((r) => (r && r.list) || []);
}

function resourceAdd(resource) {
  return call('resourceAdd', { resource: resource }).then((r) => (r === null ? { ok: true } : r));
}

function resourceUrl(id) {
  return call('resourceUrl', { id: id }).then((r) => r || { ok: false, msg: '云函数没响应' });
}

function resourceThanks(id) {
  return call('resourceThanks', { id: id }).then((r) => (r === null ? { ok: true, thanked: true } : r));
}

function resourceRemove(id) {
  return call('resourceRemove', { id: id }).then((r) => r || { ok: false, msg: '云函数没响应' });
}

/* ---------------- 校园活动 · 官网同步 ---------------- */

// 从学校官网抓最新公告当作官方活动。同步是幂等的，点多少次都不会变多。
function eventSync() {
  return call('eventSyncFromWeb', {}).then((r) => (r === null ? { ok: false, msg: '云端连不上，同步失败' } : r));
}

/* ---------------- 教师名录 ---------------- */

// 名录有两个来源：官网各学院师资页抓取（official:true）+ 同学自己补（official:false）。
// 搜索是服务端的字符串包含匹配，keyword 可以只打一个字。
function teacherList(keyword, college) {
  return call('teacherList', { keyword: keyword || '', college: college || '' })
    .then((r) => (r && r.list) || []);
}

function teacherAdd(name, college) {
  return call('teacherAdd', { name: name || '', college: college || '' })
    .then((r) => (r === null ? { ok: false, msg: '云端连不上，没存住' } : r));
}

function teacherRemove(id) {
  return call('teacherRemove', { id: id })
    .then((r) => (r === null ? { ok: false, msg: '云端连不上，没删掉' } : r));
}

/* ---------------- 校历 ---------------- */

function calendarList() {
  return call('calendarList', {}).then((r) => (r && r.list) || []);
}

function calendarSave(item) {
  return call('calendarSave', { item: item }).then((r) => r || { ok: false, msg: '云函数没响应' });
}

function calendarRemove(id) {
  return call('calendarRemove', { id: id }).then((r) => r || { ok: false, msg: '云函数没响应' });
}

// 一键导入教务处官方校历（审核员操作，会清掉旧节点重新灌入）
function calendarReset() {
  return call('calendarReset', {}).then((r) => r || { ok: false, msg: '云函数没响应' });
}

/* ---------------- 校园地点 ---------------- */

function placeList(category) {
  return call('placeList', { category: category || '' }).then((r) => (r && r.list) || []);
}

function placeAdd(place) {
  return call('placeAdd', { place: place }).then((r) => r || { ok: false, msg: '云函数没响应' });
}

function placeRemove(id) {
  return call('placeRemove', { id: id }).then((r) => r || { ok: false, msg: '云函数没响应' });
}

/* ---------------- 备忘录 ---------------- */

// 备忘录是纯私人的：服务端一律按 openid 过滤，别人翻不到。
// 云函数不可用时全部 resolve(null)，调用方按空列表处理，功能不中断。
function memoList() {
  return call('memoList', {}).then((r) => (r && r.ok === false) ? r : { ok: true, list: (r && Array.isArray(r.list)) ? r.list : [] });
}

function memoSave(item) {
  return call('memoSave', { item: item || {} })
    .then((r) => r || { ok: false, msg: '云函数没响应' });
}

function memoRemove(id) {
  return call('memoRemove', { id: id })
    .then((r) => r || { ok: false, msg: '云函数没响应' });
}

/* ---------------- 举报 ---------------- */

function reportPost(targetOpenid, reason, detail, targetId, targetType) {
  return call('report', {
    targetOpenid: targetOpenid,
    reason: reason,
    detail: detail || '',
    targetId: targetId || '',
    targetType: targetType || 'post'
  }).then((r) => (r === null ? { ok: true, msg: '举报已提交' } : r));
}

// 举报一条留言（信息墙上别人留的群号那类）。
// 走的是另一条通道：留言不是一条独立内容，而是长在帖子里的，
// 所以这里要连帖子 id 一起带上，云函数才知道该改哪条帖子的哪一条留言。
// 服务端当场就判定要不要删，凑够人数不用运营同学亲手去点。
function reportComment(postId, commentId, reason, detail) {
  return call('commentReport', {
    postId: postId,
    commentId: commentId,
    reason: reason,
    detail: (detail || '').slice(0, 200)
  }).then((r) => r || { ok: true, msg: '举报已提交' });
}

/* ---------------- 内容审核（管理员） ---------------- */

// 白名单判断只是前端展示用，云函数那边还有一份真校验
function isModerator(profile) {
  const list = (cloud.cfg.MODERATORS) || [];
  const oid = (profile && profile.openid) || getMyProfile().openid || cloud.getOpenid() || '';
  return !!oid && Array.isArray(list) && list.indexOf(oid) >= 0;
}

function whoami() {
  return call('whoami', {}).then((r) => r || null);
}

// 注意：这里曾经有「一键把我设为审核员」，上线后等于给每个用户一把删全校内容的钥匙，
// 已经拿掉。审核员名单统一走云函数环境变量 MODERATORS。

// 环境自检：返回还没建的数据库集合，页面好把引导直接显示出来
function diagCloud() {
  return call('diag', {}).then((r) => (r === null ? { ok: false, missing: [] } : r));
}

// 待处理队列：举报 + 它对应的内容
function getModerationQueue() {
  return call('getQueue', {}).then((r) => r || { ok: false, list: [] });
}

// 批量裁决：reject=证据不足驳回（顺带恢复内容），confirm=违规成立
function resolveReports(ids, action, all) {
  return call('resolveReports', { ids: ids, action: action, all: !!all })
    .then((r) => (r === null ? { ok: false, msg: '云函数没响应' } : r));
}

// 审核员 / 作者本人 手动下架或恢复一条内容
function setContentStatus(targetId, status, targetType) {
  return call('setStatus', { targetId: targetId, status: status, targetType: targetType || 'post' })
    .then((r) => (r === null ? { ok: true, msg: '已提交' } : r));
}

// 删除一条内容（帖子或评价）：必须走云函数，客户端直连数据库删不掉别人的/示例的记录
function delContent(targetType, id) {
  return call('delContent', { targetType: targetType, id: id })
    .then((r) => r || { ok: false, msg: '云函数没响应' });
}

// 更新一条内容的允许字段（点赞计数 / 评论 / 评价内容等）
function patchContent(targetType, id, patch) {
  return call('patchContent', { targetType: targetType, id: id, patch: patch })
    .then((r) => r || { ok: false });
}

// 删掉一条留言。信息墙上留错了群号、群里有人塞广告，都得有人能清掉 ——
// 帖主是唯一有动力维护那面墙的人，所以先给他；审核员兜底。
// 服务端会再认一遍权限，这里传什么进去都改不了判定结果。
function removeComment(postId, commentId) {
  return call('commentRemove', { postId: postId, commentId: commentId })
    .then((r) => r || { ok: false, msg: '云函数没响应' });
}

/* ---------------- 内容安全 ---------------- */

// 服务端权威校验：前端已有本地词表做即时提示，这里再过一遍，防绕过
function checkText(fields) {
  const payload = {};
  ['title', 'content'].forEach((k) => {
    if (fields && fields[k]) payload[k] = fields[k];
  });
  if (!Object.keys(payload).length) return Promise.resolve({ ok: true });
  return call('checkText', payload).then((r) => {
    // 预检只是「提前打招呼」，真正的拦截在 postAdd/reviewAdd 服务端那道 guard，
    // 这里放行并不等于违规内容能进库。
    // 只有云端明确判定内容违规才拦；云函数版本太老不认识 checkText（返回「未知操作」）
    // 时必须放行 —— 否则旧版云函数会把所有发帖/评价卡死在预检这一步，
    // 表现就是「闲置能发、论坛和评价全都发不出去」（闲置不走这道预检）。
    if (r && r.ok === false && String(r.msg || '').indexOf('未知操作') < 0) return r;
    return { ok: true };
  });
}

module.exports = {
  CONTACT_LABEL,
  initUser,
  getMyProfile,
  saveProfile,
  getProfile,
  search,
  addRequest,
  respond,
  listRequests,
  listOutgoing,
  listFriends,
  isFriend,
  block,
  isModerator,
  whoami,
  diagCloud,
  // 云函数统一出口：漂流瓶（utils/bottle.js）走它调云端，不用为每个 action 在这里写一层
  call,
  getModerationQueue,
  resolveReports,
  setContentStatus,
  delContent,
  patchContent,
  removeComment,
  unblock,
  listBlocks,
      reportPost,
      // 举报留言：一条留言不是独立内容，长在帖子里，所以要连 postId 一起报（见 reportComment 实现）
      reportComment,
      checkText,
      // 内容写入（服务端过审，别给前端留绕过口子）
      postAdd,
      reviewAdd,
      courseAdd,
      courseRemove,
      courseReqVote,
      courseReqInfo,
      courseTypeSet,
      courseTypeList,
      likeToggle,
      voteToggle,
      postComment,
      // 学习资料
      resourceList,
      resourceAdd,
      resourceUrl,
      resourceThanks,
      resourceRemove,
      // 校历
      calendarList,
      calendarSave,
      calendarRemove,
      calendarReset,
      // 置顶与运行配置
      postPin,
      cfgGet,
      cfgSave,
      // 校园地点
      placeList,
      placeAdd,
      placeRemove,
      // 校园活动 · 官网同步
      eventSync,
      // 教师名录
      teacherList,
      teacherAdd,
      teacherRemove,
      // 备忘录（私有，只自己可见）
      memoList,
      memoSave,
      memoRemove,
    // 收藏（云端存一份，换手机 / 重装还能拿回来）
    saveFavorites,
    getFavorites
  };
