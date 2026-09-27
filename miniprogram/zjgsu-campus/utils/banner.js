// utils/banner.js —— 顶部 Banner 轮播数据（论坛 / 闲置分享 / 活动三个板块共用）
//
// 内容固定三张，都是「此刻最值得看」的东西：
//   1. 全站最热树洞 —— 热度分最高的一条树洞帖（store.hotScore 的时间衰减口径）；
//   2. 最急寻物启事 —— 还没找到、发布时间最近的寻物启事（寻物天然越新越急）；
//   3. 最火闲置 —— 被收藏次数最多的闲置，没人收藏时退回最新一条。
//
// 某一类暂时没有内容就跳过那一张，三项全空时调用方（页面）会整块隐藏轮播。
// 轮播的自动切换 / 触摸暂停在页面的 swiper 上做（见 banner.wxml），这里只管数据。
const store = require('./store.js');
const market = require('./market.js');

// 从收藏清单里统计「market 类型被收藏的次数」：{ marketId: count }
function marketFavCount() {
  const m = {};
  store.getFavorites().forEach((f) => {
    if (f && f.type === 'market' && f.id) m[f.id] = (m[f.id] || 0) + 1;
  });
  return m;
}

function pickHole() {
  const p = store.getHolePosts('hot')[0];
  if (!p) return null;
  return {
    key: 'hole',
    icon: 'message-square',
    tag: '全站最热树洞',
    title: p.title || p.content,
    desc: (p.content || '').slice(0, 30),
    url: '/pages/forum/detail/detail?id=' + p.id
  };
}

function pickLost() {
  const list = market.getMarkets('lost').filter((m) => !m.done);
  const it = list[0];
  if (!it) return null;
  return {
    key: 'lost',
    icon: 'search',
    tag: '最急寻物启事',
    title: it.title,
    desc: (it.desc || '').slice(0, 30),
    url: '/pages/market/detail/detail?id=' + it.id
  };
}

function pickSell() {
  const list = market.getMarkets('sell').filter((m) => !m.done);
  if (!list.length) return null;
  const favs = marketFavCount();
  let best = list[0];
  let bestFav = favs[best.id] || 0;
  list.forEach((m) => {
    const n = favs[m.id] || 0;
    if (n > bestFav) { best = m; bestFav = n; }
  });
  return {
    key: 'sell',
    icon: 'shopping-bag',
    tag: bestFav > 0 ? ('最火闲置 · ' + bestFav + ' 人收藏') : '最新闲置',
    title: best.title,
    desc: best.price ? ('¥' + best.price) : ((best.desc || '').slice(0, 30)),
    url: '/pages/market/detail/detail?id=' + best.id
  };
}

function getBannerItems() {
  return [pickHole(), pickLost(), pickSell()].filter(Boolean);
}

module.exports = { getBannerItems };
