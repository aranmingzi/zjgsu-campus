#!/usr/bin/env python3
"""Generate the linear outline icon set used by the native mini program.

Vue prototype used lucide-vue-next. WeChat mini programs cannot render <svg>
in WXML, but <image> does support SVG assets, so we bake the lucide-style
line art into flat SVG files (one file per icon x colour).

Usage:  python scripts/generate-miniprogram-icons.py
Out:    miniprogram/zjgsu-campus/assets/icons/<name>--<color>.svg
"""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "miniprogram", "zjgsu-campus", "assets", "icons")

COLORS = {
    "brand": "#2B5AED",
    "brand600": "#2047C9",
    "white": "#FFFFFF",
    "ink": "#172033",
    "muted": "#6F7B91",
    "faint": "#98A3B8",
    "forum": "#7357FF",
    "market": "#F58A32",
    "campus": "#19A66A",
    "profile": "#2F9FD6",
    "danger": "#DD4B55",
    "amber": "#D98C0B",
}

# ---- path data -------------------------------------------------------------
# 24x24 grid, stroke based, fill none, round joins. Mirrors lucide geometry.
ICONS = {
    # --- navigation / chrome -------------------------------------------------
    "chevron-right": "M9 6l6 6-6 6",
    "chevron-left": "M15 6l-6 6 6 6",
    "chevron-down": "M6 9l6 6 6-6",
    "arrow-left": "M19 12H5M12 19l-7-7 7-7",
    "more-horizontal": "M5 12h.01M12 12h.01M19 12h.01",
    "x": "M6 6l12 12M18 6L6 18",
    "check": "M20 6L9 17l-5-5",
    "plus": "M12 5v14M5 12h14",
    "minus": "M5 12h14",
    "search": "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
    "menu": "M4 7h16M4 12h16M4 17h16",
    "home": "M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5",
    "settings": "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.11A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49 1z",
    "filter": "M3 5h18l-7 8v6l-4 2v-8L3 5z",
    "refresh": "M21 12a9 9 0 1 1-3-6.7M21 3v6h-6",

    # --- course --------------------------------------------------------------
    "book-open": "M12 7v14M3 18a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-6",
    "book-open-check": "M12 7v14M3 18a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-6M9 12l2 2 4-4",
    "star": "M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9L12 3.5z",
    "circle-dashed": "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM8 10h.01M16 14h.01",
    "award": "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14.5 7 22l5-2.5L17 22l-1.5-7.5",
    "graduation-cap": "M22 9 12 4 2 9l10 5 10-5zM6 11.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5",

    # --- forum / tree hole ---------------------------------------------------
    "message-circle": "M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.9-5A8.3 8.3 0 0 1 3.6 12 8.4 8.4 0 0 1 12 3.6a8.4 8.4 0 0 1 9 7.9z",
    "message-square": "M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    "flame": "M12 22a7 7 0 0 0 7-7c0-4-3-6-4.5-9.5C13 7 11 8 9.5 9.5 8 11 8 12.5 8.5 14c-.8-1-1.2-2.3-1-3.8-.6 1.8-1 3.4-1 5a7 7 0 0 0 5.5 7z",
    "users": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
    "user-round": "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM14 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2",
    "thumbs-up": "M7 21V10l5-7a2.5 2.5 0 0 1 2.5 2.5V9h4.7A2 2 0 0 1 21 11.6l-1.4 7A2 2 0 0 1 17.6 20H7zM7 10H3v11h4",
    "share-2": "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 3.9M8.6 10.5l6.8-3.9",
    "vote": "M12 3l8 4v5c0 4.4-3.2 7.6-8 9-4.8-1.4-8-4.6-8-9V7l8-4zM9 12l2 2 4-4",
    "clock": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2",
    "moon": "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z",
    "cloud": "M18 16.5a4 4 0 0 0-.9-7.9 6 6 0 0 0-11.4 2A3.8 3.8 0 0 0 6 18.5h12z",
    "shield": "M12 21s7-3.2 7-9V5.7L12 3 5 5.7V12c0 5.8 7 9 7 9zM9 12l2 2 4-4",
    "shield-check": "M12 21s7-3.2 7-9V5.7L12 3 5 5.7V12c0 5.8 7 9 7 9zM9 12l2 2 4-4",
    "lock": "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
    "eye": "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "eye-off": "M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M6.7 6.8C4 8.5 2 12 2 12s3.6 7 10 7c1.9 0 3.5-.6 4.9-1.4M20.5 15A15.8 15.8 0 0 0 22 12s-3.6-7-10-7c-.9 0-1.7.1-2.5.3",

    # --- market --------------------------------------------------------------
    "shopping-bag": "M6 8h12l1 12H5L6 8zM9 8V6a3 3 0 0 1 6 0v2",
    "tag": "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7-7V3h10.6l6.8 6.8a2 2 0 0 1 0 2.6zM7.5 7.5h.01",
    "map-pin": "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "map-pinned": "M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    "wallet": "M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8zM16 13h.01M3 10h18",
    "gift": "M20 12v8H4v-8M2 8h20v4H2zM12 21V8M12 8H7.5a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8zM12 8h4.5a2.5 2.5 0 1 0 0-5C13 3 12 8 12 8z",

    # --- campus --------------------------------------------------------------
    "calendar-days": "M4 7h16v13H4zM4 11h16M8 3v4M16 3v4M8 15h3M15 15h3",
    "calendar": "M4 7h16v13H4zM4 11h16M8 3v4M16 3v4",
    "megaphone": "M3 11v3a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11",
    "users-round": "M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21v-2a4 4 0 0 0-3-3.8M17 3.2a4 4 0 0 1 0 7.6",
    "sparkles": "M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z",
    "ticket": "M3 9h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V9zM10 9v10",
    "compass": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5 5-2z",
    # 下面四个是「分类 / 心情」用的：原来 Vue 原型里这些位置是 emoji，
    # 迁移时统一换成线性 outline，图标名写进数据里（见 utils/event.js 等）。
    "laptop": "M5 5h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM2 21h20",
    "utensils": "M7 3v8a2 2 0 0 0 4 0V3M9 11v10M6.5 3h5M17 3c-1.7 1-2.5 2.7-2.5 5s.8 3 2.5 3 2.5-1.3 2.5-3S19.7 4 17 3zM17 11v10",
    "dumbbell": "M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11",
    "heart": "M12 20s-7-4.4-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7C19 15.6 12 20 12 20z",

    # --- user / mine ---------------------------------------------------------
    "user": "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM14 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2",
    "bookmark": "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
    "file-text": "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M9 13h6M9 17h4",
    "notebook-pen": "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z",
    "life-buoy": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6a12.4 12.4 0 0 0 0 12.8M18.4 5.6a12.4 12.4 0 0 1 0 12.8M2.5 9.5l17 5M2.5 14.5l17-5",
    "inbox": "M3 12h5l2 3h4l2-3h5M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6l2.5-7z",
    "send": "M21 3 3 10.5l7 3 3 7L21 3zM10 13.5 21 3",
    "camera": "M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    "trash-2": "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6",
    "edit": "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z",
    "image": "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM4 17l4.5-4 3.5 3 4-3.5L20 17",
    "loader": "M12 3a9 9 0 1 0 9 9",

    # --- tools ---------------------------------------------------------------
    "list-checks": "M3 7h2M3 12h2M3 17h2M8 7l2 2 3-3M8 17l2-2",
    "pin": "M12 21v-7M8 3h8l-1 6 3 3H6l3-3-1-6z",
    "map": "M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2zM9 3v16M15 5v16",
    "luggage": "M6 8h12a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM9 8V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3M8 13h.01M16 13h.01",
}


def build(name, color):
    body = ICONS[name]
    paths = []
    for piece in body.split("M"):
        piece = "M" + piece if not piece.startswith("M") else piece
        d = piece.strip()
        if not d:
            continue
        paths.append(f'    <path d="{d}"/>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" '
        f'viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="1.8" '
        f'stroke-linecap="round" stroke-linejoin="round">\n'
        + "\n".join(paths)
        + "\n</svg>\n"
    )


def main():
    os.makedirs(OUT, exist_ok=True)
    count = 0
    for name, _ in ICONS.items():
        for cname, cval in COLORS.items():
            safe = name.replace("/", "-")
            path = os.path.join(OUT, f"{safe}--{cname}.svg")
            with open(path, "w", encoding="utf-8") as f:
                f.write(build(name, cval))
            count += 1
    print(f"generated {count} svg icons into {OUT}")


if __name__ == "__main__":
    main()
