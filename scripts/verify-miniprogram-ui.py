#!/usr/bin/env python3
"""Self-check for the native mini-program UI migration.

Runs on plain Python + stdlib (no node deps). Checks:

  1. every <image src="/assets/icons/..."> referenced from wxml exists
  2. every custom tag used in wxml is declared in the owning page/component json
  3. no forbidden browser-only APIs / CSS features leaked in
  4. .container / .page-scroll never get a persistent transform (breaks fixed)
  5. every page in app.json has .wxml/.wxss/.js/.json
  6. no functional emoji left in wxml
  7. pages that opt into navigationStyle:custom actually use <app-header>
  8. every wx:for / wx:if references a binding that exists in the sibling .js data
     (light check: handler names referenced by bind* exist as page methods)

Usage: python scripts/verify-miniprogram-ui.py
"""

import json
import os
import re
import sys
from itertools import product

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MP = os.path.join(ROOT, "miniprogram", "zjgsu-campus")

errors = []
warnings = []

# ---------------------------------------------------------------- helpers ---


def walk(base, exts):
    out = []
    for dirpath, _dirs, files in os.walk(base):
        for fn in files:
            if os.path.splitext(fn)[1] in exts:
                out.append(os.path.join(dirpath, fn))
    return out


def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def rel(p):
    return os.path.relpath(p, MP)


# 微信内置组件：带短横但不是自定义组件，不需要在 usingComponents 声明
BUILTIN_TAGS = {
    "scroll-view", "swiper", "swiper-item", "movable-view", "movable-area",
    "cover-view", "cover-image", "match-media", "page-meta", "navigation-bar",
    "web-view", "ad", "official-account", "open-data", "live-player",
    "live-pusher", "camera", "form", "label", "picker", "checkbox", "radio",
    "slider", "switch", "progress", "rich-text", "input", "textarea", "button",
    "image", "text", "icon", "view", "navigator",
}


def strip_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


# ------------------------------------------------------ 1. icon references ---
icon_src = re.compile(r'src="/assets/icons/([^"]+)"')
MISSING_ICONS = os.path.join(MP, "assets", "icons")


# 含这些运算符的模板片段是「按数据分支取图」，静态推不出来，只能跳过
UNRESOLVABLE = re.compile(r"\?|===|!==|&&|\|\||\bor\b|\band\b|[<>]")


PROP_RE = re.compile(r"(\w+):\s*\{\s*type:\s*\w+,\s*value:\s*(?:'([^']*)'|\"([^\"]*)\"|null|\d+)")


def _defaults(js_path):
    """从组件 index.js / 页面 js 的 data 里提出「属性默认值 / data 初值」。

    自定义组件写 src="/assets/icons/{{icon}}--{{iconColor}}.svg" 时，这里两个
    值就是 empty-state 的默认值 'inbox' / 'faint'，正好能静态渲染出一张图来查。"""
    if not os.path.exists(js_path):
        return {}
    out = {}
    for m in PROP_RE.finditer(read(js_path)):
        val = m.group(2) if m.group(2) is not None else m.group(3)
        if val:
            out[m.group(1)] = val
    return out


def icon_candidates(name, ctx=None):
    """把 src="/assets/icons/{{a}}--{{b}}.svg" 里的候选文件名全部展开检查。

    可静态求值的三种写法才展开：
      · 整条路径是字面量           → /assets/icons/star--amber.svg
      · 片段是引号字符串           → {{a ? 'x' : 'y'}} 里能取到的字面量
      · 片段是属性名 / data 字段名 → 用默认值或 data 初值代入
    一旦遇到三元 / 比较 / 逻辑运算符且没有可用字面量（例如 campus.wxml 按 tab
    在 megaphone / calendar-days / map-pinned 之间切图），就返回空列表 ——
    宁可漏检，也不能报出 "assets/icons/events--campus.svg 不存在" 这种假问题。"""
    ctx = ctx or {}
    if "{{" not in name:
        return [name] if name.endswith(".svg") else []
    lits, exprs = (lambda parts: (parts[0::2], parts[1::2]))(re.split(r"\{\{|\}\}", name))
    groups = []
    for lit in lits:
        if "{{" in lit or "}}" in lit:
            return []
        groups.append([lit])
    for expr in exprs:
        if UNRESOLVABLE.search(expr):
            return []
        vals = re.findall(r"'([^']+)'|\"([^\"]+)\"", expr)
        if vals:
            groups.append([a or b for a, b in vals])
            continue
        ident = re.fullmatch(r"\s*(\w+)\s*(?:\[\s*\w+\s*\])?\s*", expr)
        if ident:
            key = ident.group(1)
            if key in ctx:
                v = ctx[key]
                groups.append(v if isinstance(v, list) else [str(v)])
                continue
            return []
        return []
    out = set()
    for combo in product(*groups):
        cand = "".join(combo)
        if cand.endswith(".svg") and "{" not in cand:
            out.add(cand)
    return sorted(out)


for p in walk(MP, (".wxml",)):
    text = read(p)
    ctx = {}
    sib_js = p[:-5] + ".js"
    if os.path.exists(sib_js):
        ctx = _defaults(sib_js)
    else:
        cjs = os.path.join(os.path.dirname(p), "index.js")
        if os.path.exists(cjs):
            ctx = _defaults(cjs)
    for name in icon_src.findall(text):
        for cand in icon_candidates(name, ctx):
            if not os.path.exists(os.path.join(MISSING_ICONS, cand)):
                errors.append(f"{rel(p)}: 图标不存在 assets/icons/{cand}")

# -------------------------------------------- 2. component registration ----
tag_re = re.compile(r"<([a-z][a-z0-9]+-[a-z0-9-]+)[\s/>]")
for p in walk(MP, (".wxml",)):
    text = read(p)
    used = set(tag_re.findall(text))
    if not used:
        continue
    jp = p[:-5] + ".json"
    declared = {}
    if os.path.exists(jp):
        try:
            declared = (json.load(open(jp, encoding="utf-8")) or {}).get("usingComponents", {}) or {}
        except Exception as exc:
            errors.append(f"{rel(jp)}: JSON 解析失败 {exc}")
    for tag in sorted(used):
        if tag in declared or tag in BUILTIN_TAGS:
            continue
        # <import src> / <include src> use a src attribute, not a tag name
        if f'src="{tag}"' in text:
            continue
        errors.append(f"{rel(p)}: 使用了未注册组件 <{tag}>，需在 json 的 usingComponents 声明")

# ----------------------------------------------------- 3. forbidden APIs ---
BAD_TOKENS = [
    "window.",
    "document.",
    "navigator.vibrate",
    "backdrop-filter",
    "@property",
    "clamp(",
    "localStorage",
    "sessionStorage",
    "alert(",
    "fetch(",
]
for p in walk(MP, (".wxml", ".wxss", ".js")):
    text = strip_comments(read(p))   # 注释里提到这些名字不算违规
    for tok in BAD_TOKENS:
        if tok in text:
            # app.wxss 等文件里「说明不能用」的注释已被 strip_comments 去掉
            errors.append(f"{rel(p)}: 出现禁用 API/特性 {tok!r}")

# ------------------------------------------- 4. container must not transform
for p in walk(MP, (".wxss",)):
    text = read(p)
    text_nc = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    for m in re.finditer(r"(\.container|\.page-scroll)\s*\{[^}]*\}", text_nc):
        if "transform" in m.group(0):
            errors.append(f"{rel(p)}: {m.group(1)} 上出现 transform，会破坏 position:fixed")

# ------------------------------------------------ 5. every page complete ----
appjson = json.load(open(os.path.join(MP, "app.json"), encoding="utf-8"))
pages = appjson.get("pages", [])
for page in pages:
    for ext in (".wxml", ".wxss", ".js", ".json"):
        if not os.path.exists(os.path.join(MP, page + ext)):
            errors.append(f"页面缺文件: {page}{ext}")

TAB_PAGES = {item["pagePath"] for item in appjson.get("tabBar", {}).get("list", [])}

for page in pages:
    jp = os.path.join(MP, page + ".json")
    pj = json.load(open(jp, encoding="utf-8"))
    custom = pj.get("navigationStyle") == "custom"
    wxml = read(os.path.join(MP, page + ".wxml"))
    uses_header = "app-header" in wxml
    if custom and not uses_header:
        errors.append(f"{page}: navigationStyle=custom 但 wxml 里没有 <app-header>")
    if not custom and uses_header:
        errors.append(f"{page}: 没开 navigationStyle=custom 却用了 <app-header>")
    if page in TAB_PAGES and custom:
        errors.append(f"{page}: tab 页不应设置 navigationStyle=custom")

# ------------------------------------------------------- 6. functional emoji
EMOJI = re.compile(
    "[\U0001f300-\U0001faff\U00002600-\U000027bf\U0001f1e6-\U0001f1ff]"
    "[\U0000fe0f\u20e3]?"          # 变体选择符 / 带圈字符
)
# 情绪类 emoji 是设计上明确允许保留的：树洞的「抱抱 / 递茶 / 摸摸头」、
# 备忘的心情（开心 / 平静 / 低落 / 充实 / 累了），以及课程评分星级。
# 除此之外的功能类 emoji（分类 / 状态 / 排序图标）统一下换成 assets/icons 的线性图标。
ALLOW_EMOJI = (
    "reaction", "mood", "心情", "评分", "抱抱", "递茶", "摸摸头",
    "开心", "平静", "低落", "充实", "累了",
)


def check_no_emoji(path, txt, kind):
    txt = re.sub(r"<!--.*?-->", "", txt, flags=re.S)   # wxml 注释里的字样不算
    for line in txt.splitlines():
        if any(k in line for k in ALLOW_EMOJI):
            continue
        found = EMOJI.findall(line)
        if found:
            errors.append(f"{rel(path)}: 残留功能类 emoji {''.join(found)!r} → {line.strip()[:60]}")
        # ★ 是文本符号不是 emoji，但设计要求统一线性 Outline 图标，一并换掉
        if "★" in line:
            errors.append(f"{rel(path)}: 残留 ★ 文本星标，应换成 star 线性图标 → {line.strip()[:70]}")


for p in walk(MP, (".wxml",)):
    check_no_emoji(p, read(p), "wxml")

# .js 也要扫：utils/banner.js 里的 🎭 🔍 🛍️ 就藏在数据里，wxml 扫描扫不到。
# cloudfunctions/ 是云函数（服务端），不在小程序 UI 面，跳过；
# 注释里出现的 ⚠️ / ✓ 只算提醒，不算违规（它们不会渲染给用户）。
for p in walk(MP, (".js",)):
    if p.startswith(os.path.join(MP, "cloudfunctions")):
        continue
    for line in read(p).splitlines():
        if any(k in line for k in ALLOW_EMOJI):
            continue
        found = EMOJI.findall(line)
        if not found and "★" not in line:
            continue
        if re.match(r"\s*(//|/\*|\*)", line):
            warnings.append(f"{rel(p)}: 注释里的符号 {''.join(found)!r} → {line.strip()[:50]}")
            continue
        errors.append(f"{rel(p)}: 残留功能类 emoji {''.join(found)!r} → {line.strip()[:60]}")

# ---------------------------------------------- 7. bind handlers exist ------
handler_re = re.compile(r"bind(?:tap|change|input|confirm|scrolltolower|error|load)=\"?([a-zA-Z_\$][\w\$]*)")
# 页面里定义方法的三种写法：  onX() { } / async onX() { } / onX: function ( )
DEF_RE = re.compile(r"^\s{2,}(?:async\s+)?([A-Za-z_\$][\w\$]*)\s*[:(]", re.M)


def defined_names(src):
    return set(DEF_RE.findall(src))


# utils/x.wxml 这种被 include 的片段没有自己的 .js，处理函数都写在 include 它的页面里，
# 所以先在本目录找，找不到再退回全项目查找
GLOBAL_DEFS = set()
for _p in walk(MP, (".js",)):
    GLOBAL_DEFS |= defined_names(read(_p))

for p in walk(MP, (".wxml",)):
    text = read(p)
    names = set()
    for m in re.finditer(r"<(button|view|image|input|switch|textarea|slider|scroll-view)", text):
        seg = text[m.start(): m.start() + 400]
        seg = seg.split(">")[0]
        for h in handler_re.findall(seg):
            names.add((h, seg))
    if not names:
        continue
    jp = p[:-5] + ".js"
    src = read(jp) if os.path.exists(jp) else ""
    local = defined_names(src) if src else set()
    for h, seg in sorted(names):
        if h in local or h in GLOBAL_DEFS:
            continue
        errors.append(f"{rel(p)}: bind 处理函数 {h}() 在对应 js 里不存在")

# ------------------------------------------------------------- 8. report ---
print(f"检查 {len(pages)} 个页面 / {len(walk(MP, ('.wxml',)))} 个 wxml")
if warnings:
    print(f"\n警告 {len(warnings)} 条:")
    for w in warnings[:20]:
        print("  !", w)
if errors:
    print(f"\n发现 {len(errors)} 个问题:")
    for e in errors:
        print("  ✗", e)
    sys.exit(1)
print("\n原生 UI 迁移自检：全部通过")
