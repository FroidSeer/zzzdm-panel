#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
抓取 Telegram 公开频道 t.me/zzzdm（真正值得买-频道）的当天推送，转发到企业微信群机器人。

纯标准库，无第三方依赖。频道是公开频道，走 t.me/s/ 网页预览，无需登录/session。

用法:
  设置环境变量 ZZZDM_WEBHOOK_KEY（或 -k 参数）后运行:
    python tg_zzzdm_to_wecom.py                 # 发送当天全部新帖（可能分多条，受单条4096字节限制）
    python tg_zzzdm_to_wecom.py --dry-run       # 只打印，不真正发送
    python tg_zzzdm_to_wecom.py --hours 24      # 取最近24小时（默认取“今天”0点至今）
    python tg_zzzdm_to_wecom.py -p http://127.0.0.1:7890   # 指定代理（Telegram 需代理）

代理:
  优先用 -p 参数；否则读 HTTPS_PROXY / HTTP_PROXY 环境变量。
"""

import argparse
import base64
import hashlib
import html as html_mod
import io
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception:      # 没装 Pillow 时退化为「图 + 文字」两条消息
    Image = ImageDraw = ImageFont = None

# Windows 控制台默认 GBK，避免打印 emoji/中文时崩溃
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

CHANNEL = "zzzdm"
BASE_URL = f"https://t.me/s/{CHANNEL}"
WEBHOOK_URL = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key={key}"

# 单条企业微信 text 消息上限（字节），留余量用字符数近似
WECOM_MAX_CHARS = 3900

# news 图文消息单条最多 8 张卡片
NEWS_BATCH = 8

# 抓取过程中遇到的非致命问题（如翻页中途失败），由 fetch_channel_today 填充，调用方读取后判断数据是否完整
FETCH_WARN = []

# 默认排除的关键词（母婴/儿童/牛奶相关，每次推送都会过滤）。可自行增删，或用 --exclude 临时追加。
EXCLUDE_KEYWORDS = [
    # 通用
    "母婴", "婴儿", "宝宝", "幼儿", "婴幼", "儿童", "孩童", "小孩", "新生儿",
    # 纸品/尿裤
    "尿不湿", "尿裤", "纸尿裤", "拉拉裤", "尿片",
    # 喂养（"奶粉"太宽会误伤成人奶粉，改用具体表述）
    "配方奶", "配方奶粉", "婴儿奶粉", "婴幼儿奶粉", "宝宝奶粉", "一段奶粉",
    "二段奶粉", "三段奶粉", "1段奶粉", "2段奶粉", "3段奶粉",
    "辅食", "奶瓶", "奶嘴", "吸奶器", "哺乳", "母乳", "断奶",
    "磨牙棒", "磨牙饼", "婴儿米粉", "宝宝辅食",
    # 出行/睡眠
    "婴儿车", "学步车", "婴儿床", "摇篮", "腰凳", "婴儿背带", "安全座椅",
    "儿童座椅", "童车", "童装", "童鞋", "童袜", "遛娃", "溜娃",
    # 孕产
    "孕妇", "孕期", "待产", "月子", "产妇", "孕妇装", "待产包",
    # 玩具/早教
    "玩具", "积木", "乐高", "拼图", "毛绒", "玩偶", "早教", "益智", "儿童绘本",
    # 牛奶/乳制品（整类不推）
    "牛奶", "鲜奶", "纯奶", "奶粉", "生牛乳", "巴氏杀菌乳", "酪蛋白",
    "水牛奶", "乳清", "高钙奶", "舒化", "特仑苏", "金典纯",
]

MSG_START_RE = re.compile(r'<div class="tgme_widget_message[^"]*"\s+data-post="([^"]+)"')
TIME_RE = re.compile(r'<time datetime="([^"]+)"')
TEXT_DIV_RE = re.compile(
    r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', re.DOTALL
)
PHOTO_RE = re.compile(
    r'background-image:url\(\'([^\']+?)(?:_thumb/\w+)?\'\)'
)
ANCHOR_RE = re.compile(r'<a\s+[^>]*href="(https?://[^"]+)"')
URL_RE = re.compile(r'https?://[^\s"\'<>]+')
TAG_RE = re.compile(r'<[^>]+>')


def build_opener(proxy):
    if proxy:
        ph = urllib.request.ProxyHandler({"http": proxy, "https": proxy})
    else:
        # 自动读 HTTPS_PROXY/HTTP_PROXY 环境变量；Windows 下还会回退到系统代理(注册表)
        ph = urllib.request.ProxyHandler()
    return urllib.request.build_opener(ph, urllib.request.HTTPSHandler())


def fetch_html(opener, url, tries=3):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
            )
        },
    )
    last = None
    for attempt in range(tries):
        try:
            with opener.open(req, timeout=30) as resp:
                return resp.read().decode("utf-8", "replace")
        except Exception as e:
            last = e
            if attempt < tries - 1:
                time.sleep(1.5 * (attempt + 1))
    raise last


def parse_posts(html):
    """解析 t.me/s 页面，返回按 id 升序的帖子列表。"""
    starts = list(MSG_START_RE.finditer(html))
    posts = []
    for i, m in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else len(html)
        block = html[m.start():end]
        data_post = m.group(1)  # 形如 "zzzdm/365898"
        msg_id = int(data_post.split("/", 1)[1])

        dt = None
        tm = TIME_RE.search(block)
        if tm:
            try:
                dt = datetime.fromisoformat(tm.group(1).replace("Z", "+00:00"))
            except ValueError:
                dt = None

        text = ""
        text_raw = ""
        tmdiv = TEXT_DIV_RE.search(block)
        if tmdiv:
            text_raw = tmdiv.group(1)
            raw = re.sub(r"<br\s*/?>", "\n", text_raw)
            text = html_mod.unescape(TAG_RE.sub("", raw)).strip()

        # 只取第一张真实商品图：跳过 telegram.org 的表情/贴纸，跳过无协议地址
        photos = []
        for pm in PHOTO_RE.finditer(block):
            u = pm.group(1).replace("&amp;", "&")
            if u.startswith("//"):
                u = "https:" + u
            if "telegram.org" in u and "/file/" not in u:
                continue  # 表情、贴纸
            if not u.startswith("https://"):
                continue
            if u not in photos:
                photos.append(u)
            if len(photos) >= 1:
                break  # 每条只保留第一张

        links = [f"https://t.me/{CHANNEL}/{msg_id}"]
        for am in ANCHOR_RE.finditer(text_raw):
            u = am.group(1)
            if u not in links and not u.startswith(("https://t.me/", "https://telegram.org")):
                links.append(u)
        for um in URL_RE.finditer(text_raw):
            u = um.group(0).rstrip(".,;:!?)")
            if u not in links and not u.startswith(("https://t.me/", "https://telegram.org")):
                links.append(u)

        posts.append({
            "id": msg_id,
            "dt": dt,
            "text": text,
            "photos": photos,
            "links": links,
        })
    posts.sort(key=lambda p: p["id"])
    return posts


def fetch_channel_today(opener, tz_offset, hours=None, max_pages=25):
    """翻页抓取，直到最老一条早于今天0点（或达页数上限）。返回按时间升序的今日帖子。

    中途某页抓取失败时不再静默 break：把原因追加到 FETCH_WARN 列表（调用方可读），
    调用方据此区分“翻完了”和“中途断了”。
    """
    posts_all = []
    seen_ids = set()
    page_url = BASE_URL
    FETCH_WARN.clear()
    for page_no in range(max_pages):
        try:
            page_html = fetch_html(opener, page_url)
        except Exception as e:
            print(f"[warn] 抓取页面失败: {e}", file=sys.stderr)
            FETCH_WARN.append(f"第 {page_no + 1} 页抓取失败：{e}")
            break
        page_posts = parse_posts(page_html)
        if not page_posts:
            break
        for p in page_posts:
            if p["id"] not in seen_ids:
                seen_ids.add(p["id"])
                posts_all.append(p)
        min_id = min(p["id"] for p in page_posts)
        page_url = f"{BASE_URL}?before={min_id}"

        # 判断是否还要继续翻页
        earliest_dt = min((p["dt"] for p in page_posts if p["dt"]), default=None)
        cutoff = datetime.now(timezone.utc) - (timedelta(hours=hours) if hours else timedelta(0))
        if hours:
            if earliest_dt is not None and earliest_dt < cutoff:
                break
        else:
            # “今天”截止：本地时区今天0点对应的 UTC 时间
            today_local = datetime.now(timezone.utc) + timedelta(hours=tz_offset)
            day_start_local = today_local.replace(hour=0, minute=0, second=0, microsecond=0)
            day_start_utc = day_start_local - timedelta(hours=tz_offset)
            if earliest_dt is not None and earliest_dt < day_start_utc:
                break
    else:
        # 翻满 max_pages 还没走到今天0点：数据可能不完整
        FETCH_WARN.append(f"已翻 {max_pages} 页仍未到达今日起点，可能有更早的帖子未取到")

    # 过滤出目标时间范围
    now_utc = datetime.now(timezone.utc)
    if hours:
        cutoff = now_utc - timedelta(hours=hours)
        posts = [p for p in posts_all if p["dt"] and p["dt"] >= cutoff]
    else:
        today_local = now_utc + timedelta(hours=tz_offset)
        day_start_local = today_local.replace(hour=0, minute=0, second=0, microsecond=0)
        day_start_utc = day_start_local - timedelta(hours=tz_offset)
        posts = [p for p in posts_all if p["dt"] and p["dt"] >= day_start_utc]

    posts.sort(key=lambda p: p["id"])
    return posts


def format_post(i, p, tz_offset, show_photo_url=True):
    dt_local = p["dt"].astimezone(timezone(timedelta(hours=tz_offset))) if p["dt"] else None
    ts = dt_local.strftime("%H:%M") if dt_local else "??:??"
    lines = [f"{i}. [{ts}] {p['text']}" if p["text"] else f"{i}. [{ts}] （无文字）"]
    for lnk in p["links"][:3]:
        lines.append(f"   🔗 {lnk}")
    if show_photo_url and p["photos"]:
        lines.append(f"   🖼 图片: {p['photos'][0]}")
    return "\n".join(lines)


def build_messages(posts, tz_offset, show_photo_url=False):
    header = f"【真正值得买·zzzdm】今日推送共 {len(posts)} 条\n" + ("=" * 20)
    body = "\n\n".join(
        format_post(i, p, tz_offset, show_photo_url=show_photo_url)
        for i, p in enumerate(posts, 1)
    )
    full = header + "\n" + body

    msgs = []
    while full:
        if len(full) <= WECOM_MAX_CHARS:
            msgs.append(full)
            break
        cut = full.rfind("\n", 0, WECOM_MAX_CHARS)
        if cut <= 0:
            cut = WECOM_MAX_CHARS
        msgs.append(full[:cut])
        full = full[cut:].lstrip("\n")
    return msgs


def _wecom_post(opener, key, payload_obj):
    url = WEBHOOK_URL.format(key=key)
    payload = json.dumps(payload_obj, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}
    )
    with opener.open(req, timeout=20) as resp:
        body = resp.read().decode("utf-8", "replace")
    r = json.loads(body)
    return r.get("errcode") == 0, r


def send_wecom(opener, key, content):
    return _wecom_post(opener, key, {"msgtype": "text", "text": {"content": content}})


def send_wecom_markdown(opener, key, content):
    """markdown 消息：标题加粗、链接显示为可点击的文字，版面比纯文本好看。"""
    return _wecom_post(opener, key, {"msgtype": "markdown", "markdown": {"content": content}})


def send_wecom_news(opener, key, articles):
    """图文消息 news：图片内嵌在卡片里，一条消息自带标题+描述+图+链接。

    articles: [{"title","description","url","picurl"}, ...] 最多 8 条。
    企业微信要求 picurl 为可公网直连的 https JPG/PNG（建议 ≥300x300）。
    """
    return _wecom_post(opener, key, {"msgtype": "news", "news": {"articles": articles}})


def _first_line(s):
    for ln in (s or "").splitlines():
        t = ln.strip()
        if t:
            return t
    return ""


NAME_PREFIX_RE = re.compile(
    r"^(今日必买|今日推荐|国家补贴|白菜价|神价格|绝对值|超值|必买|推荐|精选|好价|新低)\s*[：:]\s*"
)


PROMO_TOKEN_RE = re.compile(
    r"^(?:" + "|".join([
        "淘金币可用", "淘礼金", "今日必买", "今日推荐", "今日爆款", "百亿补贴",
        "国家补贴", "plus会员", "PLUS会员", "88vip", "88VIP", "会员",
        "限时", "秒杀", "预售", "新品", "直播", "猫超", "超级红包", "聚划算",
        "天猫超市", "京东自营", "自营", "包邮", "领券",
    ]) + r")\s*[、：:,，]\s*",
    re.I,
)

SHORT_BUY_HOSTS = ("u.jd.com", "s.click.taobao.com", "m.tb.cn", "3.cn",
                   "item.m.jd.com", "item.jd.com", "detail.tmall.com")


def _clean_name(raw):
    """去掉品名开头堆叠的促销词，只留下货品本身。
    「淘金币可用、今日必买、88VIP：千禾 酱油…」-> 「千禾 酱油…」
    """
    s = (raw or "").strip()
    for _ in range(6):
        new = PROMO_TOKEN_RE.sub("", s, count=1)
        if new == s:
            break
        s = new
    return s.strip() or (raw or "").strip()


def parse_deal(p):
    """从帖子正文里抽出「品名 / 价格 / 商家 / 值率 / 券 / 价格备注」，
    用于排版时把价格和货品名放在最显眼的位置。
    """
    text = (p.get("text") or "").strip()
    name = _clean_name(NAME_PREFIX_RE.sub("", _first_line(text))) or "（无标题）"

    price = price_note = shop = coupon = ""
    good = bad = ""

    m = re.search(r"价格[：:]\s*([0-9]+(?:\.[0-9]+)?)\s*元\s*(?:\(([^)]*)\))?", text)
    if m:
        price = m.group(1).rstrip("0").rstrip(".") or m.group(1)
        price_note = (m.group(2) or "").strip()

    m = re.search(r"商家[：:]\s*\[?([^\]\n]+?)\]?\s*$", text, re.M)
    if m:
        shop = m.group(1).strip()

    m = re.search(r"值率[：:]\s*值\s*[：:]?\s*(\d+)[^\d]*不值\s*[：:]?\s*(\d+)", text)
    if m:
        good, bad = m.group(1), m.group(2)

    m = re.search(r"领券[：:]\s*\[?([^\]\n]*)\]?", text)
    if m:
        coupon = m.group(1).strip()
        if coupon in ("无需领券", "无"):
            coupon = ""

    return {
        "name": name,
        "price": price,
        "price_note": price_note,
        "shop": shop,
        "good": good,
        "bad": bad,
        "coupon": coupon,
        "url": _buy_link(p),
    }


def _buy_link(p):
    """挑一个最适合发到微信的下单链接。

    优先短链（u.jd.com / s.click.taobao.com 这类），其次商品详情页；
    如果只剩几百字符的联盟长链，就退回值得买的帖子页（里面有一键购买），
    否则一条消息会被 URL 撑爆。
    """
    cands = [u for u in (p.get("links") or [])
             if u and "t.me/" not in u and "telegram" not in u]
    short = [u for u in cands if any(h in u for h in SHORT_BUY_HOSTS) and len(u) <= 90]
    if short:
        return min(short, key=len)
    ok_len = [u for u in cands if len(u) <= 90]
    if ok_len:
        return ok_len[0]
    mid = [u for u in cands if "zzzdm.com/posts/view" in u]
    if mid:
        return mid[0]
    if cands:
        return cands[0]
    return f"https://t.me/{CHANNEL}/{p['id']}"


def deal_headline(d):
    """卡片/消息的第一行：价格 + 品名，一眼判断值不值。"""
    if d["price"]:
        return f"¥{d['price']} · {d['name']}"
    return d["name"]


def deal_subline(d):
    """第二行：商家、值率、价格水位、券，做辅助判断。"""
    bits = []
    if d["shop"]:
        bits.append(f"🏪 {d['shop']}")
    if d["good"]:
        tag = "👍值得" if (d["good"].isdigit() and int(d["good"]) >= 5) else "值"
        bits.append(f"{tag}{d['good']}·踩{d['bad'] or 0}")
    if d["price_note"]:
        bits.append(f"📉 {d['price_note']}")
    if d["coupon"]:
        bits.append(f"🎫 {d['coupon']}")
    return " | ".join(bits)


def md_escape(s):
    """markdown 里 [ ] ` 会破坏语法，替换成全角。"""
    if not s:
        return ""
    return s.replace("[", "【").replace("]", "】").replace("`", "'").strip()


def _trim(s, n):
    s = (s or "").strip()
    if len(s) <= n:
        return s
    return s[:n - 1].rstrip() + "…"


def format_deal_brief(p):
    """一条帖子排成 3 行，像人发的推荐，不像机器搬砖。

    第 1 行：到手价 + 品名（价格在最前面，一眼就能判断）
    第 2 行：商家 · 价格水位 · 值率 · 券（够不够便宜的佐证）
    第 3 行：下单链接
    不带序号、不带时间，微信里读起来更干净。
    """
    d = parse_deal(p)
    name = _trim(d["name"], 44)
    head = f"到手 ¥{d['price']}　{name}" if d["price"] else name

    bits = []
    if d["shop"]:
        bits.append(d["shop"])
    if d["price_note"]:
        bits.append(d["price_note"])
    if d["good"]:
        bits.append(f"{d['good']} 人觉得值 / {d['bad'] or 0} 人不值")
    if d["coupon"]:
        bits.append(f"券 {d['coupon']}")

    lines = [head]
    if bits:
        lines.append(" · ".join(bits))
    lines.append(f"👉 {d['url']}")
    return "\n".join(lines)


def format_post_md(idx, total, p, tz_offset):
    """纯文字模式用：带序号和时间的紧凑列表，尽量一条塞下多条。"""
    d = parse_deal(p)
    dt_local = p["dt"].astimezone(timezone(timedelta(hours=tz_offset))) if p["dt"] else None
    ts = dt_local.strftime("%H:%M") if dt_local else "??:??"
    lines = [f"{idx}. [{ts}] {deal_headline(d)}"]
    sub = deal_subline(d)
    if sub:
        lines.append(f"   {sub}")
    lines.append(f"   🔗 {d['url']}")
    return "\n".join(lines)


def build_news_article(idx, total, p, tz_offset):
    """把一条帖子拼成 news 图文卡片：价格+品名做标题，商家/值率做描述。"""
    d = parse_deal(p)
    dt_local = p["dt"].astimezone(timezone(timedelta(hours=tz_offset))) if p["dt"] else None
    ts = dt_local.strftime("%H:%M") if dt_local else "??:??"

    head = deal_headline(d)
    sub = deal_subline(d)
    # news 标题限 128 字符
    title = f"{head}  [{idx}/{total} {ts}]"
    if len(title) > 60:
        keep = 60 - len(f"  [{idx}/{total} {ts}]") - 1
        title = f"{head[:max(10, keep)]}…  [{idx}/{total} {ts}]"
    # 描述限 512 字符
    desc = sub or (p["text"] or "").replace("\n", " ")[:200]
    return {
        "title": title[:128],
        "description": desc[:512],
        "url": d["url"],
        "picurl": p["photos"][0] if p["photos"] else "",
    }


def send_post_text(opener, key, content):
    """发文字：直接走 text 消息。企微会把 URL 自动变成可点链接，
    markdown 的颜色/加粗在手机上收益很低，反而容易因特殊字符被拒。"""
    return send_with_retry(send_wecom, opener, key, content)


def download_image(opener, url, tries=3):
    """下载图片原始字节；失败返回 None。CDN 偶发 SSL EOF，重试几次。"""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
        ),
        "Referer": "https://t.me/",
        "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
    }
    last_err = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with opener.open(req, timeout=45) as resp:
                data = resp.read()
            if data:
                return data
        except Exception as e:
            last_err = e
            if attempt < tries - 1:
                time.sleep(1.5 * (attempt + 1))
    print(f"[warn] 下载图片失败 {url[:70]}…: {last_err}", file=sys.stderr)
    return None


# 企业微信 image 消息：图片（base64 编码前）≤ 2MB，仅支持 JPG/PNG
WECOM_IMG_MAX = 1_800_000


def prepare_image(raw):
    """把任意图片压成企业微信可接受的 JPG（≤1.8MB）。失败返回 None。"""
    if not raw:
        return None
    try:
        from PIL import Image
    except Exception:
        # 没有 PIL 时只能原样返回（限 JPG/PNG 且 <2MB）
        if len(raw) <= WECOM_IMG_MAX and raw[:3] in (b"\xff\xd8\xff", b"\x89PN"):
            return raw
        return None
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        # 超大图先等比缩小
        max_side = 1600
        w, h = img.size
        if max(w, h) > max_side:
            scale = max_side / float(max(w, h))
            img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))))
        for quality in (85, 75, 65, 55, 45):
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            data = buf.getvalue()
            if len(data) <= WECOM_IMG_MAX:
                return data
        return data if len(data) <= WECOM_IMG_MAX else None
    except Exception as e:
        print(f"[warn] 图片转码失败: {e}", file=sys.stderr)
        return None


def send_wecom_image(opener, key, data):
    """以 image 消息发送，微信里直接显示为图片（非链接）。"""
    url = WEBHOOK_URL.format(key=key)
    payload = json.dumps({
        "msgtype": "image",
        "image": {
            "base64": base64.b64encode(data).decode("ascii"),
            "md5": hashlib.md5(data).hexdigest(),
        },
    }).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}
    )
    with opener.open(req, timeout=30) as resp:
        body = resp.read().decode("utf-8", "replace")
    r = json.loads(body)
    return r.get("errcode") == 0, r


def _is_rate_limited(r):
    return r.get("errcode") == 45009 or "freq" in str(r.get("errmsg", "")).lower()


def _is_transient(r):
    code = r.get("errcode")
    msg = str(r.get("errmsg", ""))
    if code == -1:
        return True
    for kw in ("SSL", "EOF", "timed out", "timeout", "Connection", "reset", "RemoteDisconnected", "URLError"):
        if kw in msg:
            return True
    return False


def _font(size, bold=False):
    """加载中文字体；找不到就退到 Pillow 内置位图字体（会乱码，但不会崩）。"""
    cands = (
        (r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\msyh.ttc",
         r"C:\Windows\Fonts\simhei.ttf", r"C:\Windows\Fonts\Deng.ttf")
        if bold else
        (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\Deng.ttf",
         r"C:\Windows\Fonts\simhei.ttf")
    )
    for path in cands:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size)
    except Exception:
        return ImageFont.load_default()


def _wrap(text, font, max_w):
    """按像素宽度折行，中文逐字断，英文尽量不断词。"""
    lines, cur = [], ""
    for ch in text or "":
        if ch == "\n":
            lines.append(cur)
            cur = ""
            continue
        trial = cur + ch
        if font.getlength(trial) <= max_w:
            cur = trial
        else:
            # 英文/数字粘连时尽量在空格处断
            if ch.isalnum() and " " in cur:
                cut = cur.rfind(" ")
                if cut > len(cur) * 0.5:
                    lines.append(cur[:cut])
                    cur = cur[cut + 1:] + ch
                    continue
            lines.append(cur)
            cur = ch.lstrip()
    if cur:
        lines.append(cur)
    return lines or [""]


def _qr_image(data, size):
    """生成二维码位图；没有 qrcode 库时返回 None。"""
    try:
        import qrcode
    except Exception:
        return None
    try:
        q = qrcode.QRCode(box_size=8, border=1,
                          error_correction=qrcode.constants.ERROR_CORRECT_M)
        q.add_data(data)
        q.make(fit=True)
        img = q.make_image(fill_color="black", back_color="white").get_image()
        return img.convert("RGB").resize((size, size), Image.LANCZOS)
    except Exception as e:
        print(f"[warn] 二维码生成失败: {e}", file=sys.stderr)
        return None


# 合成卡片：整条消息就是一张图，商品图在上，价格/品名/理由/二维码在下
CARD_W = 720
CARD_PAD = 26
CARD_MAX_PHOTO_H = 660


def compose_deal_image(raw, p, d):
    """把商品首图和文案合成「一张图」，作为单条 image 消息发出。

    这样企业微信里看到的就是「一条消息 = 图 + 图上的字」，
    不是图一条、说明一条，也不是 news 卡片墙。
    链接在图片里点不动，所以右下角附二维码，扫一下就能下单。
    失败返回 None（调用方退化为文字）。
    """
    try:
        from PIL import Image, ImageDraw
    except Exception:
        return None
    try:
        photo = None
        if raw:
            try:
                photo = Image.open(io.BytesIO(raw))
                photo.load()
                if photo.mode not in ("RGB", "L"):
                    photo = photo.convert("RGB")
            except Exception:
                photo = None

        inner_w = CARD_W - CARD_PAD * 2

        # ---- 先排版文字，量出高度 ----
        f_price = _font(46, bold=True)
        f_name = _font(27, bold=True)
        f_sub = _font(21)
        f_link = _font(19)

        price_txt = f"到手 ¥{d['price']}" if d["price"] else ""
        name_lines = _wrap(_trim(d["name"], 62), f_name, inner_w)[:3]

        bits = []
        if d["shop"]:
            bits.append(d["shop"])
        if d["price_note"]:
            bits.append(d["price_note"])
        if d["good"]:
            bits.append(f"{d['good']} 人觉得值 / {d['bad'] or 0} 人不值")
        if d["coupon"]:
            bits.append(f"券 {d['coupon']}")
        sub_lines = _wrap(" · ".join(bits), f_sub, inner_w)[:3] if bits else []

        qr_sz = 128
        link_txt = d["url"]
        link_lines = _wrap(link_txt, f_link, inner_w - qr_sz - 18)[:2]
        link_block_h = max(qr_sz, len(link_lines) * 26)

        # ---- 图片区高度 ----
        photo_h = 0
        if photo:
            scale = CARD_W / float(photo.width)
            pw, ph = CARD_W, int(photo.height * scale)
            if ph > CARD_MAX_PHOTO_H:
                scale = CARD_MAX_PHOTO_H / float(photo.height)
                pw, ph = int(photo.width * scale), CARD_MAX_PHOTO_H
            photo_h = ph
            photo = photo.resize((max(1, pw), max(1, ph)), Image.LANCZOS)

        height = (photo_h + CARD_PAD) if photo_h else CARD_PAD
        if price_txt:
            height += 62
        height += len(name_lines) * 38 + 8
        if sub_lines:
            height += len(sub_lines) * 30 + 6
        height += 10 + link_block_h + CARD_PAD
        height = max(height, 320)

        card = Image.new("RGB", (CARD_W, height), (255, 255, 255))
        draw = ImageDraw.Draw(card)

        y = CARD_PAD
        if photo_h:
            card.paste(photo, ((CARD_W - photo.width) // 2, 0))
            y = photo_h + CARD_PAD

        x = CARD_PAD
        if price_txt:
            draw.text((x, y), price_txt, font=f_price, fill=(214, 48, 24))
            y += 62
        for ln in name_lines:
            draw.text((x, y), ln, font=f_name, fill=(24, 24, 26))
            y += 38
        y += 8
        if sub_lines:
            for ln in sub_lines:
                draw.text((x, y), ln, font=f_sub, fill=(110, 110, 116))
                y += 30
            y += 6
        y += 10

        draw.line([(x, y - 6), (CARD_W - CARD_PAD, y - 6)], fill=(232, 232, 235), width=1)

        qr = _qr_image(link_txt, qr_sz)
        if qr:
            card.paste(qr, (CARD_W - CARD_PAD - qr_sz, y))
        ty = y + 6
        for ln in link_lines:
            draw.text((x, ty), ln, font=f_link, fill=(90, 90, 98))
            ty += 26
        draw.text((x, ty + 4), "扫码下单 →", font=f_link, fill=(214, 48, 24))

        buf = io.BytesIO()
        card.save(buf, format="JPEG", quality=88, optimize=True)
        data = buf.getvalue()
        if len(data) > WECOM_IMG_MAX:
            for q in (80, 70, 60, 50):
                buf = io.BytesIO()
                card.save(buf, format="JPEG", quality=q, optimize=True)
                data = buf.getvalue()
                if len(data) <= WECOM_IMG_MAX:
                    break
        return data if len(data) <= WECOM_IMG_MAX else None
    except Exception as e:
        print(f"[warn] 合成卡片失败: {e}", file=sys.stderr)
        return None


def send_with_retry(fn, *args, tries=4, **kwargs):
    """遇 45009（超频）或网络抖动时指数退避重试。"""
    delay = 5
    ok, r = False, {}
    for attempt in range(tries):
        try:
            ok, r = fn(*args, **kwargs)
        except Exception as e:
            ok, r = False, {"errcode": -1, "errmsg": str(e)}
        if ok:
            return ok, r
        if (_is_rate_limited(r) or _is_transient(r)) and attempt < tries - 1:
            print(f"  [重试] {r.get('errmsg')} — 等待 {delay}s", file=sys.stderr)
            time.sleep(delay)
            delay = min(delay * 2, 45)
            continue
        return ok, r
    return ok, r


def _fallback_text(opener, key, chunk, total, start, tz_offset, log):
    """纯文字汇总：一条消息里排多条，用于无图或图片接口被拒时。"""
    body = "\n\n".join(
        format_post_md(start + i + 1, total, p, tz_offset)
        for i, p in enumerate(chunk)
    )
    return send_post_text(opener, key, body)


def push_posts(opener, key, posts, tz_offset, with_images=True,
               text_delay=3.0, image_delay=3.0, log=print, progress=None):
    """推送到企业微信。

    默认风格（with_images=True）：
      每条帖子 = 一张合成图（商品图 + 价格 + 品名 + 理由 + 二维码），只发一条消息。
      图上的字就是说明，不再补发文字，微信里就是「一条消息 = 图 + 图上的字」。
      链接在图片里点不动，所以画了二维码。

    没图或合成失败的帖子，自动并进文字批里，保证一条不丢。
    企微群机器人限速 20 条/分钟，所以每条消息之间默认间隔 3 秒。
    progress(done, total) -> 每处理完一条回调一次
    返回 (ok_count, fail_count, detail_list)；detail 里的 ids 是该次消息覆盖的帖子 id。
    """
    ok_n = fail_n = 0
    detail = []
    total = len(posts)

    def _emit(kind, ok, resp, note, idx=None, ids=None):
        nonlocal ok_n, fail_n
        if ok:
            ok_n += 1
        else:
            fail_n += 1
        item = {"kind": kind, "ok": ok, "resp": resp}
        if idx is not None:
            item["idx"] = idx
        if ids:
            item["ids"] = list(ids)
        detail.append(item)
        log(f"[{note}] {'成功' if ok else '失败'} -> {resp}")

    if not with_images:
        # 纯文字模式：按字符数贪心打包，一条消息塞尽量多的帖子
        _push_text_only(opener, key, posts, tz_offset, text_delay, log, _emit, progress)
        return ok_n, fail_n, detail

    pending_text = []      # 没图的，攒起来一起发文字

    def flush_text(note_hint=""):
        nonlocal pending_text
        if not pending_text:
            return
        start_idx = pending_text[0][0]
        body = "\n\n".join(format_deal_brief(p) for _i, p in pending_text)
        ok, r = send_post_text(opener, key, body)
        _emit("text", ok, r, f"文字 {len(pending_text)} 条{note_hint}", idx=start_idx,
              ids=[p["id"] for _i, p in pending_text])
        pending_text = []
        time.sleep(text_delay)

    for i, p in enumerate(posts):
        sent_card = False
        if p.get("photos"):
            raw = download_image(opener, p["photos"][0])
            if raw:
                d = parse_deal(p)
                card = compose_deal_image(raw, p, d)
                if card:
                    ok, r = send_with_retry(send_wecom_image, opener, key, card)
                    _emit("image", ok, r, f"卡片 {i + 1}/{total}", idx=i, ids=[p["id"]])
                    sent_card = ok
                    if not ok:
                        log(f"  卡片发送失败，这条改走文字：{r.get('errmsg')}")
                    time.sleep(image_delay)
                else:
                    log(f"  第 {i + 1} 条合成卡片失败，改走文字")
            else:
                log(f"  第 {i + 1} 条图片下载失败，改走文字")
        if not sent_card:
            pending_text.append((i, p))
            # 攒够 4 条或者到结尾就发出去，避免文字太长被截断
            if len(pending_text) >= 4 or i == total - 1:
                flush_text()
        if progress:
            progress(i + 1, total)
    flush_text()

    return ok_n, fail_n, detail


def _push_text_only(opener, key, posts, tz_offset, delay, log, emit, progress):
    """纯文字模式：按 WECOM_MAX_CHARS 贪心分包。"""
    total = len(posts)
    buf, buf_start, buf_len = [], 0, 0

    def flush():
        nonlocal buf, buf_len
        if not buf:
            return
        body = "\n\n".join(format_post_md(buf_start + j + 1, total, p, tz_offset)
                           for j, p in enumerate(buf))
        ok, r = send_post_text(opener, key, body)
        emit("text", ok, r, f"文字 {buf_start + 1}-{buf_start + len(buf)}/{total}",
             idx=buf_start, ids=[p["id"] for p in buf])
        log(f"  （{len(body)} 字符）")
        buf, buf_len = [], 0
        time.sleep(delay)

    for i, p in enumerate(posts):
        piece = format_post_md(i + 1, total, p, tz_offset)
        if buf and buf_len + len(piece) + 2 > WECOM_MAX_CHARS - 200:
            flush()
            buf_start = i
        elif not buf:
            buf_start = i
        buf.append(p)
        buf_len += len(piece) + 2
        if progress:
            progress(i + 1, total)
    flush()


def main():
    ap = argparse.ArgumentParser(description="抓取 zzzdm 频道并转发到企业微信")
    ap.add_argument("-k", "--key", default=os.environ.get("ZZZDM_WEBHOOK_KEY"),
                    help="企业微信群机器人 webhook key（也可用环境变量 ZZZDM_WEBHOOK_KEY）")
    ap.add_argument("-p", "--proxy", default=None, help="代理，如 http://127.0.0.1:7890")
    ap.add_argument("--hours", type=float, default=None, help="只取最近N小时（默认取今天0点至今）")
    ap.add_argument("--latest", type=int, default=None, help="只发最新N条（用于测试）")
    ap.add_argument("--exclude", default="", help="额外排除关键词（逗号分隔）")
    ap.add_argument("--no-exclude-defaults", action="store_true", help="不使用内置母婴关键词")
    ap.add_argument("--tz", type=float, default=8.0, help="本地时区相对UTC的偏移小时（默认8，Asia/Hong_Kong）")
    ap.add_argument("--dry-run", action="store_true", help="只打印不发送")
    ap.add_argument("--no-images", action="store_true", help="不发送图片（只发文字）")
    args = ap.parse_args()

    opener = build_opener(args.proxy)
    posts = fetch_channel_today(opener, args.tz, hours=args.hours)
    if not posts:
        print("今天没有抓到任何新帖。")
        return

    # 关键词过滤（默认排除母婴）
    keywords = [] if args.no_exclude_defaults else list(EXCLUDE_KEYWORDS)
    if args.exclude:
        keywords += [k.strip() for k in args.exclude.replace("，", ",").split(",") if k.strip()]
    if keywords:
        kept, dropped = [], 0
        for p in posts:
            if any(k in p["text"] for k in keywords):
                dropped += 1
            else:
                kept.append(p)
        posts = kept
        print(f"关键词过滤：排除 {dropped} 条（关键词 {len(keywords)} 个），剩余 {len(posts)} 条。")

    if args.latest:
        posts = posts[-args.latest:]

    msgs = build_messages(posts, args.tz)
    if args.dry_run:
        print("\n--- DRY RUN 预览 ---")
        for m in msgs:
            print(m)
            print("-" * 40)
        print(f"共 {len(posts)} 条帖子，将分 {len(msgs)} 条消息发送。")
        return

    if not args.key:
        print("错误：未提供 webhook key。请设置环境变量 ZZZDM_WEBHOOK_KEY 或用 -k 参数。",
              file=sys.stderr)
        return

    ok_n, fail_n, _ = push_posts(
        opener, args.key, posts, args.tz, with_images=not args.no_images
    )
    print(f"完成：成功 {ok_n} 条，失败 {fail_n} 条。")


if __name__ == "__main__":
    main()
