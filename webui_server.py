#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
zzzdm 可视化面板：本地起一个网页，实时展示 t.me/zzzdm 的今日推送，
支持关键词过滤、手动/自动推送到企业微信、配置持久化。

纯标准库，无第三方依赖。
  python webui_server.py            # 默认 http://127.0.0.1:8765
  python webui_server.py --port 9000
"""

import argparse
import json
import os
import re
import shutil
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timedelta, timezone

import tg_zzzdm_to_wecom as core
import push_channels as chans

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "ui_config.json")
CONFIG_BAK = CONFIG_PATH + ".bak"
STATE_PATH = os.path.join(HERE, "ui_state.json")   # 已推送记录 + 定时任务水位
LOG_DIR = os.path.join(HERE, "logs")
DIST_DIR = os.path.join(HERE, "ui", "dist")

MIME = {
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".json": "application/json; charset=utf-8",
}

DEFAULT_CONFIG = {
    "key": "",
    "proxy": "",
    "tz": 8.0,
    "exclude": list(core.EXCLUDE_KEYWORDS),   # 默认沿用脚本内置的母婴/牛奶关键词
    "filter_enabled": True,
    "latest": 0,             # 0 = 不限，只保留最新 N 条（只影响展示/推送切片，不污染状态池）
    "push_images": True,     # 推送时是否把每条帖子首图作为图片发出（非链接）
    "auto_refresh_sec": 0,   # 0 = 关闭面板自动抓取
    "auto_push": False,      # 服务端定时任务：抓到后是否自动推送未推送过的
    "daily_time": "",        # 服务端每日定时抓取+推送时刻 "HH:MM"，空 = 关闭
    "skip_pushed": False,    # 手动推送时默认跳过已推送过的帖子
    # 推送通道：enabled 为真的通道各推一遍。企业微信沿用上面的 key 字段。
    "channels": {
        "wecom": {"enabled": True},
        "serverchan": {"enabled": False, "key": ""},
        "pushplus": {"enabled": False, "token": ""},
        "mp": {
            "enabled": False, "appid": "", "secret": "", "openid": "",
            "template_id": "", "fields": dict(chans.DEFAULT_MP_FIELDS),
        },
    },
}

# 允许客户端通过 /api/* 覆盖的配置键（白名单，避免任意键写进配置文件）
CONFIG_KEYS = (
    "key", "proxy", "tz", "latest", "auto_refresh_sec", "filter_enabled",
    "exclude", "push_images", "auto_push", "daily_time", "skip_pushed",
    "channels",
)

_lock = threading.Lock()
_state = {
    "posts": [],        # 全部今日帖子
    "filtered": [],     # 过滤后（未按 latest 截断）
    "excluded": [],     # 被过滤掉的
    "last_fetch": None,
    "last_error": "",
    "pushing": False,
    # 推送进度：前端轮询 /api/state 拿它画进度条，done/total 跨通道累计
    "push": {"running": False, "done": 0, "total": 0, "label": "", "ok": 0, "fail": 0, "phase": ""},
    "fetch_warn": "",   # 抓取过程中断等非致命问题
    "log": [],
}

# 中止信号：/api/push_cancel 置位，推送循环里每次进度回调都会检查
_cancel = threading.Event()


class PushCancelled(Exception):
    """用户点了「中止」。用异常穿出 core.push_posts 的发送循环，避免逐层改签名。"""


# 已推送记录：{ "帖子id": "推送时间" }，以及定时任务水位
_pushed = {}
_job = {"last_run": "", "running": False}


def load_config():
    """读配置。文件损坏时保留现场并明确报错，不静默回退到默认值。"""
    cfg = dict(DEFAULT_CONFIG)
    if not os.path.exists(CONFIG_PATH):
        return cfg
    try:
        saved = _read_json_file(CONFIG_PATH)
        if not isinstance(saved, dict):
            raise ValueError("配置文件根节点不是对象")
    except Exception as e:
        broken = CONFIG_PATH + ".broken"
        try:
            os.replace(CONFIG_PATH, broken)
        except OSError:
            broken = CONFIG_PATH
        add_log(f"配置文件读取失败（{e}），已备份为 {os.path.basename(broken)}，本次使用默认配置")
        _state["last_error"] = f"配置文件损坏：{e}"
        return cfg
    # 旧配置文件里 exclude 为空列表时，补上默认关键词，避免首次使用什么都不过滤
    if not saved.get("exclude") and saved.get("filter_enabled", True):
        saved.pop("exclude", None)
    cfg.update({k: v for k, v in saved.items() if k in CONFIG_KEYS})
    cfg["channels"] = _merge_channels(saved.get("channels"))
    return cfg


def _merge_channels(saved):
    """通道配置逐层合并默认值：老配置文件里没有的字段自动补齐，不丢用户已填的值。"""
    base = {k: dict(v) for k, v in DEFAULT_CONFIG["channels"].items()}
    if not isinstance(saved, dict):
        return base
    for name, conf in saved.items():
        if name not in base or not isinstance(conf, dict):
            continue
        base[name].update(conf)
        if name == "mp":
            fields = dict(chans.DEFAULT_MP_FIELDS)
            if isinstance(conf.get("fields"), dict):
                fields.update({k: str(v) for k, v in conf["fields"].items()})
            base[name]["fields"] = fields
    return base


def save_config(cfg):
    """原子写：先写临时文件再 os.replace，避免半截 JSON 覆盖掉好配置。"""
    cfg = {k: v for k, v in cfg.items() if k in CONFIG_KEYS}
    if "channels" in cfg:
        cfg["channels"] = _merge_channels(cfg["channels"])
    tmp = CONFIG_PATH + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        if os.path.exists(CONFIG_PATH):
            try:
                shutil.copyfile(CONFIG_PATH, CONFIG_BAK)
            except OSError:
                pass
        os.replace(tmp, CONFIG_PATH)
        return True
    except Exception as e:
        add_log(f"配置保存失败：{e}")
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False


def _read_json_file(path):
    """读 JSON，容忍 BOM（记事本/PowerShell 另存为常带 utf-8-sig）。"""
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def _load_state():
    """读已推送记录。"""
    global _pushed, _job
    try:
        data = _read_json_file(STATE_PATH)
        _pushed = {int(k): v for k, v in (data.get("pushed") or {}).items()}
        j = data.get("job") or {}
        _job = {"last_run": j.get("last_run", ""), "running": False}
    except FileNotFoundError:
        pass
    except Exception as e:
        add_log(f"推送记录读取失败（{e}），本次从空记录开始")


def _save_state():
    tmp = STATE_PATH + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"pushed": {str(k): v for k, v in _pushed.items()},
                       "job": {"last_run": _job.get("last_run", "")}},
                      f, ensure_ascii=False, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, STATE_PATH)
    except Exception as e:
        add_log(f"推送记录保存失败：{e}")


def mark_pushed(ids, when=None):
    when = when or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        for i in ids:
            _pushed[int(i)] = when
        # 只保留最近 14 天的记录，避免无限膨胀
        if len(_pushed) > 5000:
            keep = sorted(_pushed.items(), key=lambda kv: kv[1])[-5000:]
            _pushed.clear()
            _pushed.update(dict(keep))
    _save_state()


def add_log(msg):
    line = {"t": datetime.now().strftime("%H:%M:%S"), "m": msg}
    with _lock:
        _state["log"].append(line)
        _state["log"] = _state["log"][-200:]
    # 同时落盘，半夜定时任务出问题第二天能看到现场
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        p = os.path.join(LOG_DIR, datetime.now().strftime("%Y-%m-%d") + ".log")
        with open(p, "a", encoding="utf-8") as f:
            f.write(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\t{msg}\n")
    except OSError:
        pass


def apply_filter(posts, keywords):
    if not keywords:
        return posts, []
    words = [str(k).strip().lower() for k in keywords if str(k).strip()]
    kept, dropped = [], []
    for p in posts:
        text = (p.get("text") or "").lower()
        (dropped if any(w in text for w in words) else kept).append(p)
    return kept, dropped


def _fetch_posts(cfg):
    """抓取 + 过滤，返回 (posts, kept, dropped, warn)。warn 非空表示翻页中途断了。"""
    opener = core.build_opener(cfg.get("proxy") or None)
    warn = []
    try:
        core.FETCH_WARN.clear()
    except Exception:
        pass
    posts = core.fetch_channel_today(opener, float(cfg.get("tz", 8.0)))
    try:
        warn.extend(core.FETCH_WARN)
    except Exception:
        pass
    keywords = list(cfg.get("exclude") or [])
    kept, dropped = apply_filter(posts, keywords if cfg.get("filter_enabled", True) else [])
    return posts, kept, dropped, "；".join(str(w) for w in warn)


def do_fetch(cfg, quiet=False):
    try:
        posts, kept, dropped, warn = _fetch_posts(cfg)
        with _lock:
            _state["posts"] = posts
            _state["filtered"] = kept          # 存全量，latest 只在展示/推送时切片
            _state["excluded"] = dropped
            _state["last_fetch"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            _state["last_error"] = ""
            _state["fetch_warn"] = warn
        msg = f"抓取成功：共 {len(posts)} 条，过滤 {len(dropped)} 条，保留 {len(kept)} 条"
        if warn:
            msg += f"（警告：{warn}）"
        if not quiet:
            add_log(msg)
        return True
    except Exception as e:
        with _lock:
            _state["last_error"] = str(e)
        add_log(f"抓取失败：{e}")
        return False


CHANNEL_LABEL = {
    "wecom": "企业微信",
    "serverchan": "Server酱",
    "pushplus": "PushPlus",
    "mp": "公众号",
}
CHANNEL_ORDER = ("wecom", "serverchan", "pushplus", "mp")


def enabled_channels(cfg):
    """返回已启用的通道 [(name, conf), ...]，顺序固定，方便界面上下一一对应。"""
    raw = cfg.get("channels") or {}
    out = []
    for name in CHANNEL_ORDER:
        conf = raw.get(name) or {}
        if conf.get("enabled"):
            out.append((name, conf))
    return out


def _mp_data(conf, p, d, tz):
    """公众号模板消息的 data：用户配了字段模板就按模板渲染，否则用默认四段。"""
    ctx = chans.deal_ctx(p, d, tz)
    tpl = conf.get("fields") or chans.DEFAULT_MP_FIELDS
    return chans.render_fields(tpl, ctx)


def _push_wecom(cfg, pool, log, progress):
    """企业微信：图文合成一张卡片逐条发。返回 (成功数, 失败数, 命中的帖子 id 集合)。"""
    opener = core.build_opener(cfg.get("proxy") or None)
    tz = float(cfg.get("tz", 8.0))
    with_images = bool(cfg.get("push_images", True))
    n_img = len([p for p in pool if p.get("photos")]) if with_images else 0
    log(f"开始推送：{len(pool)} 篇帖子"
        + (f"，{n_img} 张首图，图文合成一张卡片" if with_images else "（仅文字）"))
    ok_n, fail_n, detail = core.push_posts(
        opener, cfg.get("key", ""), pool, tz,
        with_images=with_images, log=log, progress=progress,
    )
    # 按实际成功的帖子 id 记录（detail 里 ids 是该次消息覆盖的帖子）
    hit = set()
    legacy = []
    for it in detail or []:
        if not it.get("ok"):
            continue
        ids_ = it.get("ids")
        if ids_:
            hit.update(int(x) for x in ids_)
        elif it.get("idx") is not None:
            legacy.append(int(it["idx"]))
    per = getattr(core, "NEWS_BATCH", 8)
    for i in legacy:
        hit.update(p["id"] for p in pool[i:i + per])
    return ok_n, fail_n, hit


def _push_markdown(name, conf, cfg, pool, log, progress):
    """Server酱 / PushPlus：一条帖子一段 markdown，按字符数分批。"""
    tz = float(cfg.get("tz", 8.0))
    with_img = bool(cfg.get("push_images", True))
    label = CHANNEL_LABEL[name]
    opener = core.build_opener(cfg.get("proxy") or None)

    pieces = []
    for p in pool:
        d = core.parse_deal(p)
        pieces.append((p, chans.post_markdown(p, d, tz, with_image=with_img)))

    batches, buf, size = [], [], 0
    for p, md in pieces:
        if buf and size + len(md) > 4800:
            batches.append(buf)
            buf, size = [], 0
        buf.append((p, md))
        size += len(md) + 8
    if buf:
        batches.append(buf)

    ok_n = fail_n = 0
    hit = set()
    total = len(pool)
    seen = 0
    for i, batch in enumerate(batches):
        body = "\n\n---\n\n".join(md for _p, md in batch)
        title = f"值得买精选 {len(batch)} 条（{i + 1}/{len(batches)}）"
        if name == "serverchan":
            ok, r = chans.send_serverchan(opener, conf.get("key", ""), title, body)
        else:
            ok, r = chans.send_pushplus(opener, conf.get("token", ""), title, body)
        if ok:
            ok_n += 1
            hit.update(p["id"] for p, _md in batch)
        else:
            fail_n += 1
        seen += len(batch)
        log(f"[{label} {i + 1}/{len(batches)}] {'成功' if ok else '失败'} -> "
            f"{r.get('errmsg') or r.get('code') or 'ok'}")
        if progress:
            progress(seen, total)
        time.sleep(1.0)
    return ok_n, fail_n, hit


def _push_mp(conf, cfg, pool, log, progress):
    """公众号：一条帖子一条模板消息。字段值都是纯文本，图片放不进去。"""
    tz = float(cfg.get("tz", 8.0))
    opener = core.build_opener(cfg.get("proxy") or None)
    ok_n = fail_n = 0
    hit = set()
    total = len(pool)
    for i, p in enumerate(pool):
        d = core.parse_deal(p)
        data = _mp_data(conf, p, d, tz)
        ok, r = chans.send_mp_template(
            opener, conf.get("appid", ""), conf.get("secret", ""),
            conf.get("openid", ""), conf.get("template_id", ""),
            data, url=d.get("url", ""),
        )
        if ok:
            ok_n += 1
            hit.add(p["id"])
        else:
            fail_n += 1
        log(f"[公众号 {i + 1}/{total}] {'成功' if ok else '失败'} -> "
            f"{r.get('errmsg') or r.get('errcode') or 'ok'}")
        if progress:
            progress(i + 1, total)
        time.sleep(0.5)
    return ok_n, fail_n, hit


def _set_push(**kw):
    with _lock:
        cur = dict(_state["push"])
        cur.update(kw)
        _state["push"] = cur


# 最近一次推送的收尾结果，/api/push 用它告诉前端「是正常结束还是被中止」
_last_push = {"cancelled": False, "ok": 0, "fail": 0}


def do_push(cfg, ids=None, skip_pushed=None, force=False):
    """推送。ids 给定时只推这些；否则推全部保留项。

    多通道：channels.*.enabled 为真的通道各推一遍；
    任一通道成功即视为这条帖子推送成功，写进已推送记录。
    skip_pushed=True 时跳过已推送过的帖子；force=True 无视记录强制重推。

    进度写进 _state["push"]，前端轮询 /api/state 显示「已发 37/173」；
    /api/push_cancel 置位 _cancel 后，下一次进度回调会抛 PushCancelled 结束发送。
    """
    with _lock:
        if _state["pushing"]:
            add_log("已有推送进行中")
            return False
        _state["pushing"] = True
        pool = list(_state["filtered"])
        pushed_now = set(_pushed)
    _cancel.clear()
    _set_push(running=True, done=0, total=0, label="准备中", ok=0, fail=0, phase="准备中")
    _last_push.update(cancelled=False, ok=0, fail=0)
    ok_all = fail_all = 0
    cancelled = False
    try:
        targets = enabled_channels(cfg)
        if not targets:
            add_log("推送失败：没有启用任何推送通道")
            return False
        names = [n for n, _c in targets]
        if "wecom" in names and not cfg.get("key"):
            add_log("推送失败：企业微信通道未配置 webhook key")
            return False
        skip = bool(cfg.get("skip_pushed", False) if skip_pushed is None else skip_pushed)

        if ids:
            want = {int(i) for i in ids}
            by_id = {p["id"]: p for p in _state["posts"]}
            pool = [by_id[i] for i in sorted(want) if i in by_id]
            add_log(f"按勾选推送：选中 {len(want)} 条，命中 {len(pool)} 条")
        else:
            pool = truncated(pool, int(cfg.get("latest") or 0))
        if skip and not force:
            before = len(pool)
            pool = [p for p in pool if p["id"] not in pushed_now]
            if before != len(pool):
                add_log(f"跳过已推送 {before - len(pool)} 条，剩余 {len(pool)} 条")
        if not pool:
            add_log("没有可推送的帖子" + ("（都已推送过）" if skip else ""))
            return False

        add_log(f"推送通道：{' + '.join(CHANNEL_LABEL[n] for n in names)}")
        grand_total = len(pool) * len(targets)
        _set_push(total=grand_total, phase="发送中")

        ok_all = fail_all = 0
        done = set()
        base = 0  # 已经跑完的通道累计条数，用来把各通道进度拼成一条总进度

        for name, conf in targets:
            label = CHANNEL_LABEL[name]

            def _progress(done_n, total_n, _l=label, _base=base):
                # 企微群机器人限速 20 条/分钟，逐条记录会淹没日志，这里按 10 条一档
                if _cancel.is_set():
                    raise PushCancelled()
                _set_push(done=_base + done_n, total=grand_total, label=_l, phase=f"{_l}发送中")
                if done_n == total_n or done_n % 10 == 0:
                    add_log(f"{_l}进度：{done_n}/{total_n}")

            try:
                if name == "wecom":
                    ok_n, fail_n, hit = _push_wecom(cfg, pool, add_log, _progress)
                elif name == "mp":
                    ok_n, fail_n, hit = _push_mp(conf, cfg, pool, add_log, _progress)
                else:
                    ok_n, fail_n, hit = _push_markdown(name, conf, cfg, pool, add_log, _progress)
            except PushCancelled:
                with _lock:
                    n_done = _state["push"]["done"]
                add_log(f"已中止：{label} 处理到 {n_done}/{grand_total} 条，已经发出去的无法撤回")
                cancelled = True
                break
            except Exception as e:
                add_log(f"[{label}] 推送异常：{e}")
                fail_all += 1
                base += len(pool)
                continue
            ok_all += ok_n
            fail_all += fail_n
            done |= hit
            base += len(pool)
            _set_push(done=base, ok=ok_all, fail=fail_all)
            add_log(f"[{label}] 结束：成功 {ok_n} 条，失败 {fail_n} 条")
            time.sleep(1.0)

        if done:
            mark_pushed(sorted(done))
            add_log(f"已记录 {len(done)} 条为已推送")
        if cancelled:
            add_log(f"推送已中止：成功 {ok_all} 条，失败 {fail_all} 条")
        else:
            add_log(f"推送结束：成功 {ok_all} 条，失败 {fail_all} 条，覆盖 {len(pool)} 篇帖子")
        return (not cancelled) and fail_all == 0
    except Exception as e:
        add_log(f"推送异常：{e}")
        return False
    finally:
        with _lock:
            _state["pushing"] = False
            cur = dict(_state["push"])
            cur.update(running=False, phase="已结束")
            _state["push"] = cur
        _last_push.update(cancelled=cancelled, ok=ok_all, fail=fail_all)
        _cancel.clear()


_META_LINE = re.compile(r"^(价格|商家|值率|领券|到手|补贴|优惠)\s*[：:]")


def _clean_reason(text):
    """正文里除首行（品名）之外那句人话，就是「为什么值得买」。

    Telegram 的排版约定是：品名 / 一句推荐语 / 价格 / 商家 / 值率 / 领券 / --- / 链接。
    取第一句非元信息的长句，最多两行、120 字，够卡片用。
    """
    buf = []
    for raw in (text or "").splitlines()[1:]:
        line = raw.strip()
        if not line:
            continue
        if _META_LINE.match(line) or set(line) <= {"-", "—", "="} or line.startswith("【"):
            break
        buf.append(line)
        if sum(len(x) for x in buf) >= 120 or len(buf) >= 2:
            break
    return " ".join(buf)[:160]


def deal_json(p):
    """面板用的结构化商品信息。

    和推出去的那张图同源（core.parse_deal），所以面板里看到的
    品名/价格/商家/值率和微信群里的图不会对不上。
    """
    try:
        d = core.parse_deal(p)
    except Exception:
        d = {"name": "", "price": "", "price_note": "", "shop": "",
             "good": "", "bad": "", "coupon": "", "url": ""}
    return {
        "name": d.get("name") or "",
        "price": d.get("price") or "",
        "price_note": d.get("price_note") or "",
        "shop": d.get("shop") or "",
        "good": d.get("good") or "",
        "bad": d.get("bad") or "",
        "coupon": d.get("coupon") or "",
        "url": d.get("url") or "",
        "reason": _clean_reason(p.get("text") or ""),
    }


def post_json(p, tz):
    dt = p.get("dt")
    local = dt.astimezone(timezone(timedelta(hours=tz))) if dt else None
    return {
        "id": p["id"],
        "time": local.strftime("%H:%M") if local else "",
        "text": p["text"],
        "links": p["links"],
        "photos": p["photos"],
        "url": f"https://t.me/zzzdm/{p['id']}",
        "deal": deal_json(p),
    }


def truncated(posts, latest):
    """latest>0 时只保留最新的 N 条。"""
    if latest and latest > 0 and len(posts) > latest:
        return posts[-latest:]
    return posts


def snapshot(cfg):
    with _lock:
        tz = float(cfg.get("tz", 8.0))
        latest = int(cfg.get("latest") or 0)
        shown = truncated(_state["filtered"], latest)
        pushed_map = dict(_pushed)
        return {
            "posts": [post_json(p, tz) for p in shown],
            "excluded": [post_json(p, tz) for p in _state["excluded"]],
            "stats": {
                "total": len(_state["posts"]),
                "kept": len(_state["filtered"]),
                "excluded": len(_state["excluded"]),
                "shown": len(shown),
                "pushed": sum(1 for p in shown if p["id"] in pushed_map),
            },
            "pushed": {str(k): v for k, v in pushed_map.items()},
            "last_fetch": _state["last_fetch"],
            "last_error": _state["last_error"],
            "fetch_warn": _state.get("fetch_warn", ""),
            "pushing": _state["pushing"],
            "push": dict(_state["push"]),
            "job": {"last_run": _job.get("last_run", ""), "running": _job.get("running", False)},
            "log": _state["log"][-40:],
            "config": cfg,
        }


def _schedule_decision(hhmm, now, last_run):
    """返回 'wait'（没到点）、'missed'（错过太久，今天不补）、'run'（该跑了）或 'off'。

    抽成纯函数是为了能直接单测，不用等真的到点。
    """
    hhmm = str(hhmm or "").strip()
    if not hhmm:
        return "off"
    try:
        hh, mm = [int(x) for x in hhmm.split(":")]
        due = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    except (ValueError, AttributeError):
        return "off"
    mark = due.strftime("%Y-%m-%d %H:%M")
    if last_run == mark:
        return "done"
    late = (now - due).total_seconds()
    if late < 0:
        return "wait"
    if late > 30 * 60:
        return "missed"
    return "run"


def _scheduled_worker():
    """服务端每日定时：到点抓取 → 过滤 → 推送未推送过的。面板关着也照跑。

    只在到点后的 30 分钟内触发一次；服务起得比定时时刻晚太多时，
    记下当天不再补跑，避免开机就给你推一整天的量。
    """
    while True:
        try:
            cfg = load_config()
            hhmm = str(cfg.get("daily_time") or "").strip()
            if hhmm and not _job.get("running"):
                decision = _schedule_decision(hhmm, datetime.now(), _job.get("last_run"))
                mark = datetime.now().strftime("%Y-%m-%d ") + hhmm
                if decision == "missed":
                    _job["last_run"] = mark
                    _save_state()
                    add_log(f"定时任务：已错过 {hhmm}（超过 30 分钟），今天不补跑")
                elif decision == "run":
                    _job["running"] = True
                    try:
                        add_log(f"定时任务启动（{hhmm}）")
                        cfg2 = load_config()
                        if do_fetch(cfg2):
                            if cfg2.get("auto_push", False) and cfg2.get("key"):
                                do_push(cfg2, skip_pushed=True)
                            else:
                                add_log("定时抓取完成（未开启自动推送）")
                        _job["last_run"] = mark
                        _save_state()
                        add_log("定时任务结束")
                    finally:
                        _job["running"] = False
        except Exception as e:
            add_log(f"定时任务异常：{e}")
        time.sleep(30)


PAGE = r"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>真正值得买 · 推送面板</title>
<style>
  :root{
    --bg:#0d1117; --panel:#161b22; --panel2:#1c2129; --line:#232b36;
    --fg:#e6edf3; --dim:#8b949e; --accent:#ff6b35; --green:#3fb950; --red:#f85149;
    --blue:#58a6ff;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);
       font:14px/1.6 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  header{position:sticky;top:0;z-index:20;background:rgba(13,17,23,.92);
         backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
  .bar{max-width:1280px;margin:0 auto;padding:14px 20px;display:flex;
       align-items:center;gap:16px;flex-wrap:wrap}
  .logo{font-size:17px;font-weight:700;letter-spacing:.5px}
  .logo b{color:var(--accent)}
  .chip{padding:3px 10px;border-radius:999px;background:var(--panel2);
        border:1px solid var(--line);font-size:12px;color:var(--dim)}
  .spacer{flex:1}
  button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid var(--line);
         background:var(--panel2);color:var(--fg);padding:8px 16px;transition:.15s}
  button:hover{border-color:#3d4756;background:#242c38}
  button.primary{background:linear-gradient(135deg,#ff6b35,#ff8f5e);border:none;
                 color:#fff;font-weight:600;box-shadow:0 2px 12px rgba(255,107,53,.3)}
  button.primary:hover{filter:brightness(1.08)}
  button:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
  main{max-width:1280px;margin:0 auto;padding:20px;display:grid;
       grid-template-columns:1fr 340px;gap:20px;align-items:start}
  @media(max-width:980px){main{grid-template-columns:1fr}}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}
  .stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .stat .n{font-size:26px;font-weight:700;line-height:1.1}
  .stat .l{color:var(--dim);font-size:12px;margin-top:4px}
  .stat.total .n{color:var(--blue)} .stat.keep .n{color:var(--green)}
  .stat.drop .n{color:var(--red)}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;
        padding:16px 18px;margin-bottom:12px;transition:.15s;position:relative}
  .card:hover{border-color:#39424f;transform:translateY(-1px)}
  .card .head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
  .time{font-variant-numeric:tabular-nums;color:var(--dim);font-size:12px;
        background:var(--panel2);padding:2px 8px;border-radius:6px}
  .txt{white-space:pre-wrap;word-break:break-word;margin:2px 0 10px}
  .links{display:flex;flex-wrap:wrap;gap:8px}
  .links a{font-size:12px;color:var(--blue);text-decoration:none;background:rgba(88,166,255,.08);
           border:1px solid rgba(88,166,255,.25);padding:4px 10px;border-radius:7px;
           max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .links a:hover{background:rgba(88,166,255,.18)}
  .links a.buy{color:var(--accent);border-color:rgba(255,107,53,.3);background:rgba(255,107,53,.08)}
  .thumb{margin-top:10px;border-radius:9px;overflow:hidden;border:1px solid var(--line);
         max-width:220px;background:#000}
  .thumb img{display:block;width:100%;height:auto}
  aside{position:sticky;top:78px;display:flex;flex-direction:column;gap:14px}
  .panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
  .panel h3{margin:0 0 12px;font-size:13px;color:var(--dim);font-weight:600;
            letter-spacing:.6px;text-transform:uppercase}
  label{display:block;font-size:12px;color:var(--dim);margin:10px 0 5px}
  input,select,textarea{width:100%;background:#0b0f14;border:1px solid var(--line);
      border-radius:8px;color:var(--fg);padding:8px 10px;font:inherit;font-size:13px}
  input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent)}
  textarea{resize:vertical;min-height:64px;font-family:ui-monospace,Consolas,monospace;font-size:12px}
  .row{display:flex;gap:8px}
  .row>*{flex:1}
  .switch{display:flex;align-items:center;gap:8px;margin:12px 0;font-size:13px}
  .switch input{width:auto;flex:none}
  .log{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--dim);
       max-height:210px;overflow:auto;background:#0b0f14;border-radius:8px;padding:10px}
  .log div{padding:2px 0;border-bottom:1px solid rgba(255,255,255,.03)}
  .log b{color:var(--accent);font-weight:500}
  .tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:6px;
       background:rgba(248,81,73,.12);color:var(--red);border:1px solid rgba(248,81,73,.25)}
  .empty{text-align:center;color:var(--dim);padding:60px 20px}
  .empty .big{font-size:38px;margin-bottom:10px;opacity:.5}
  .toast{position:fixed;right:20px;bottom:20px;background:var(--panel2);border:1px solid var(--line);
         border-left:3px solid var(--accent);border-radius:10px;padding:12px 18px;z-index:99;
         box-shadow:0 8px 30px rgba(0,0,0,.5);opacity:0;transform:translateY(10px);transition:.25s}
  .toast.show{opacity:1;transform:none}
  .spinner{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.3);
           border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:-2px}
  @keyframes spin{to{transform:rotate(360deg)}}
  .hide{display:none!important}
</style>
</head>
<body>
<header><div class="bar">
  <div class="logo">真正值得买 <b>zzzdm</b> · 推送面板</div>
  <span class="chip" id="fetchTime">未抓取</span>
  <span class="chip hide" id="errChip"></span>
  <div class="spacer"></div>
  <button id="btnFetch">刷新抓取</button>
  <button id="btnPush" class="primary">推送到企业微信</button>
</div></header>

<main>
  <section>
    <div class="stats">
      <div class="stat total"><div class="n" id="sTotal">0</div><div class="l">今日总推送</div></div>
      <div class="stat keep"><div class="n" id="sKeep">0</div><div class="l">过滤后保留</div></div>
      <div class="stat drop"><div class="n" id="sDrop">0</div><div class="l">已过滤（母婴/牛奶）</div></div>
    </div>
    <div id="list"></div>
  </section>

  <aside>
    <div class="panel">
      <h3>推送设置</h3>
      <label>企业微信 webhook key</label>
      <input id="cfgKey" placeholder="粘贴 webhook 地址里 key= 后面那串">
      <label>代理（留空则用系统代理）</label>
      <input id="cfgProxy" placeholder="http://127.0.0.1:7890">
      <div class="row">
        <div><label>只发最新 N 条</label><input id="cfgLatest" type="number" min="0" value="0"></div>
        <div><label>自动刷新(秒)</label><input id="cfgAuto" type="number" min="0" value="0"></div>
      </div>
      <div class="switch"><input type="checkbox" id="cfgFilter"><label for="cfgFilter" style="margin:0">启用关键词过滤</label></div>
      <label>排除关键词（逗号/换行分隔）</label>
      <textarea id="cfgExclude"></textarea>
      <button style="width:100%;margin-top:12px" id="btnSave">保存设置</button>
    </div>
    <div class="panel">
      <h3>运行日志</h3>
      <div class="log" id="log"></div>
    </div>
  </aside>
</main>

<div class="toast" id="toast"></div>

<script>
const $ = s => document.querySelector(s);
let autoTimer = null;

function toast(msg, ok=true){
  const t = $('#toast');
  t.textContent = msg;
  t.style.borderLeftColor = ok ? 'var(--green)' : 'var(--red)';
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(()=>t.classList.remove('show'), 2600);
}

function esc(s){return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

function linkLabel(u){
  if(/u\.jd\.com|item\.jd\.com/.test(u)) return '🛒 京东';
  if(/taobao|tmall|tb\.cn/.test(u)) return '🛒 淘宝';
  if(/zzzdm\.com/.test(u)) return '📝 详情';
  if(/t\.me\/zzzdm/.test(u)) return '💬 原帖';
  return '🔗 ' + (()=>{try{return new URL(u).hostname}catch(e){return u.slice(0,24)}})();
}

function card(p){
  const links = p.links.map(u=>{
    const cls = /u\.jd\.com|item\.jd\.com|taobao|tmall|tb\.cn/.test(u)?'buy':'';
    return `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener">${linkLabel(u)}</a>`;
  }).join('');
  const img = p.photos.length ? `<div class="thumb"><img loading="lazy" src="${esc(p.photos[0])}"></div>` : '';
  return `<div class="card">
    <div class="head"><span class="time">${p.time}</span>
      <span class="chip">#${p.id}</span></div>
    <div class="txt">${esc(p.text)||'<span style="color:var(--dim)">（无文字）</span>'}</div>
    ${img}
    <div class="links" style="margin-top:10px">${links}</div>
  </div>`;
}

function render(d){
  $('#sTotal').textContent = d.stats.total;
  $('#sKeep').textContent = d.stats.kept;
  $('#sDrop').textContent = d.stats.excluded;
  $('#fetchTime').textContent = d.last_fetch ? '抓取于 ' + d.last_fetch : '未抓取';
  const ec = $('#errChip');
  if(d.last_error){ ec.textContent = '错误: ' + d.last_error.slice(0,60); ec.classList.remove('hide'); }
  else ec.classList.add('hide');

  const list = $('#list');
  if(!d.posts.length){
    list.innerHTML = `<div class="empty"><div class="big">📭</div>
      ${d.last_fetch ? '没有可展示的帖子' : '点击右上角「刷新抓取」开始'}</div>`;
  } else {
    list.innerHTML = d.posts.slice().reverse().map(card).join('');
  }
  $('#log').innerHTML = d.log.map(x=>`<div><b>${x.t}</b> ${esc(x.m)}</div>`).join('');

  const c = d.config;
  if(document.activeElement === document.body){
    $('#cfgKey').value = c.key||''; $('#cfgProxy').value = c.proxy||'';
    $('#cfgLatest').value = c.latest||0; $('#cfgAuto').value = c.auto_refresh_sec||0;
    $('#cfgFilter').checked = !!c.filter_enabled;
  }
  $('#cfgExclude').value = (c.exclude||[]).join(', ');
  $('#btnPush').disabled = d.pushing || !d.posts.length;
  $('#btnPush').innerHTML = d.pushing ? '<span class="spinner"></span> 推送中…' : '推送到企业微信';
  setupAuto(c.auto_refresh_sec||0);
}

let lastAuto = 0;
function setupAuto(sec){
  if(sec === lastAuto) return;
  lastAuto = sec;
  clearInterval(autoTimer); autoTimer = null;
  if(sec > 0) autoTimer = setInterval(()=>api('/api/fetch',{}), sec*1000);
}

async function api(path, body){
  const r = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'},
                               body: JSON.stringify(body||{})});
  return r.json();
}

async function refresh(){ render(await api('/api/state',{})); }

$('#btnFetch').onclick = async ()=>{
  const btn = $('#btnFetch');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 抓取中';
  const r = await api('/api/fetch', readConfig());
  btn.disabled = false;
  btn.textContent = '刷新抓取';
  toast(r.ok ? ('抓取成功：保留 ' + r.stats.kept + ' 条') : ('抓取失败：' + (r.error||'')), r.ok);
  refresh();
};

$('#btnPush').onclick = async ()=>{
  const btn = $('#btnPush');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 推送中…';
  const r = await api('/api/push', readConfig());
  toast(r.ok ? ('推送完成：' + (r.sent||'')) : ('推送失败：' + (r.error||'')), r.ok);
  refresh();
};

$('#btnSave').onclick = async ()=>{
  const r = await api('/api/config', readConfig());
  toast('设置已保存', r.ok);
  refresh();
};

function readConfig(){
  return {
    key: $('#cfgKey').value.trim(),
    proxy: $('#cfgProxy').value.trim(),
    latest: parseInt($('#cfgLatest').value)||0,
    auto_refresh_sec: parseInt($('#cfgAuto').value)||0,
    filter_enabled: $('#cfgFilter').checked,
    exclude: $('#cfgExclude').value.split(/[,，\n]/).map(s=>s.trim()).filter(Boolean),
  };
}

refresh();
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        data = body if isinstance(body, bytes) else str(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            # 推送要跑好几分钟，用户中途关页面/刷新是常事，别让断开的连接刷一屏栈
            pass

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/", "/index.html"):
            # 优先返回 Vite 构建出的 React 前端；没有 dist 时回退到内置页面
            dist_index = os.path.join(DIST_DIR, "index.html")
            if os.path.isfile(dist_index):
                with open(dist_index, "rb") as f:
                    return self._send(200, f.read(), "text/html; charset=utf-8")
            return self._send(200, PAGE, "text/html; charset=utf-8")
        if path.startswith("/assets/"):
            rel = path.lstrip("/")
            full = os.path.normpath(os.path.join(DIST_DIR, rel))
            # 用 commonpath 校验，避免 ui/dist_evil/... 这类同前缀兄弟目录穿透
            try:
                inside = os.path.commonpath([os.path.abspath(full), os.path.abspath(DIST_DIR)]) \
                    == os.path.abspath(DIST_DIR)
            except ValueError:
                inside = False
            if inside and os.path.isfile(full):
                ext = os.path.splitext(full)[1].lower()
                ctype = MIME.get(ext, "application/octet-stream")
                with open(full, "rb") as f:
                    return self._send(200, f.read(), ctype)
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}
        cfg = load_config()
        # 只有真正带配置字段、且值有变化的请求才落盘（避免每次 /api/state 重写文件）
        changed = False
        for k in CONFIG_KEYS:
            if k in body and body[k] != cfg.get(k):
                cfg[k] = body[k]
                changed = True
        if "channels" in body:
            cfg["channels"] = _merge_channels(body["channels"])
        if changed:
            save_config(cfg)

        if self.path == "/api/state":
            return self._send(200, snapshot(cfg))

        if self.path == "/api/fetch":
            ok = do_fetch(cfg)
            snap = snapshot(cfg)
            return self._send(200, {"ok": ok, "error": snap["last_error"],
                                    "warn": snap["fetch_warn"], "stats": snap["stats"]})

        if self.path == "/api/refilter":
            # 只按当前关键词重算一遍已抓到的帖子，不重新联网抓取
            with _lock:
                posts = list(_state["posts"])
            if not posts:
                return self._send(200, {"ok": False, "error": "还没抓取过，先点一次「抓取今日」",
                                        "stats": snapshot(cfg)["stats"]})
            keywords = list(cfg.get("exclude") or [])
            kept, dropped = apply_filter(
                posts, keywords if cfg.get("filter_enabled", True) else [])
            with _lock:
                _state["filtered"] = kept
                _state["excluded"] = dropped
            add_log(f"重新过滤：保留 {len(kept)} 条，排除 {len(dropped)} 条")
            return self._send(200, {"ok": True, "error": "",
                                    "stats": snapshot(cfg)["stats"]})

        if self.path == "/api/push_cancel":
            # 只置位信号：真正的停止发生在下一次进度回调（最多差一条消息）
            if not _state["pushing"]:
                return self._send(200, {"ok": False, "error": "当前没有进行中的推送"})
            _cancel.set()
            add_log("已请求中止推送，正在收尾…")
            return self._send(200, {"ok": True})

        if self.path == "/api/push":
            ids = body.get("ids")
            skip = body.get("skip_pushed")
            force = bool(body.get("force", False))
            ok = do_push(cfg, ids=ids, skip_pushed=skip, force=force)
            with _lock:
                tail = [x["m"] for x in _state["log"][-4:]]
            summary = tail[-1] if tail else ""
            return self._send(200, {"ok": ok, "sent": summary, "cancelled": _last_push["cancelled"],
                                    "ok_count": _last_push["ok"], "fail_count": _last_push["fail"],
                                    "error": "" if ok else " / ".join(tail),
                                    "stats": snapshot(cfg)["stats"]})

        if self.path == "/api/test_channel":
            # 通道自检：发一条测试消息，验证 key/token/模板是否可用
            name = str(body.get("name") or "")
            if name not in CHANNEL_LABEL:
                return self._send(200, {"ok": False, "error": f"未知通道 {name}"})
            conf = (cfg.get("channels") or {}).get(name) or {}
            opener = core.build_opener(cfg.get("proxy") or None)
            try:
                if name == "wecom":
                    ok, r = core.send_post_text(
                        opener, cfg.get("key", ""),
                        "✅ zzzdm 面板连通测试\n如果你看到这条，说明企业微信通道可用。")
                elif name == "serverchan":
                    ok, r = chans.send_serverchan(
                        opener, conf.get("key", ""), "zzzdm 面板连通测试",
                        "✅ 如果你看到这条，说明 Server酱通道可用。")
                elif name == "pushplus":
                    ok, r = chans.send_pushplus(
                        opener, conf.get("token", ""), "zzzdm 面板连通测试",
                        "✅ 如果你看到这条，说明 PushPlus 通道可用。")
                else:
                    ok, r = chans.send_mp_template(
                        opener, conf.get("appid", ""), conf.get("secret", ""),
                        conf.get("openid", ""), conf.get("template_id", ""),
                        chans.render_fields(conf.get("fields") or chans.DEFAULT_MP_FIELDS, {
                            "head": "zzzdm 面板连通测试", "name": "连通测试", "price": "0",
                            "shop": "本地面板", "price_note": "这是一条测试消息",
                            "coupon": "", "value": "", "url": "",
                            "photo": "", "time": "", "text": "通道自检",
                        }))
            except Exception as e:
                return self._send(200, {"ok": False, "error": str(e)})
            msg = r.get("errmsg") or r.get("message") or ("成功" if ok else "失败")
            add_log(f"[{CHANNEL_LABEL[name]}] 连通测试：{'成功' if ok else '失败'} -> {msg}")
            return self._send(200, {"ok": bool(ok), "error": "" if ok else msg})

        if self.path == "/api/config":
            return self._send(200, {"ok": True, "config": cfg})

        if self.path == "/api/unpush":
            # 清空已推送记录，方便整批重推
            ids = body.get("ids")
            with _lock:
                if ids:
                    for i in ids:
                        _pushed.pop(int(i), None)
                else:
                    _pushed.clear()
            _save_state()
            add_log("已清空推送记录" if not ids else f"已清除 {len(ids)} 条推送记录")
            return self._send(200, {"ok": True, "stats": snapshot(cfg)["stats"]})

        return self._send(404, {"error": "not found"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--no-schedule", action="store_true", help="不启动每日定时任务线程")
    args = ap.parse_args()

    cfg = load_config()
    _load_state()
    add_log("服务已启动")
    if not args.no_schedule:
        threading.Thread(target=_scheduled_worker, daemon=True).start()
        if cfg.get("daily_time"):
            add_log(f"每日定时任务已加载：{cfg['daily_time']}")
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"面板已启动： http://{args.host}:{args.port}", flush=True)
    print("Ctrl+C 停止", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
