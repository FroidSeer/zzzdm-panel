#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""多渠道推送：企业微信群机器人之外的几种「发到微信」通道。

纯标准库。全部走 https 直连，失败抛异常由调用方兜底。

支持的通道：
  wecom      企业微信群机器人 webhook（图片/文字由 tg_zzzdm_to_wecom 负责，这里不实现）
  serverchan Server酱（sctapi.ftqq.com），markdown，图片用公网 URL 直接内嵌
  pushplus   PushPlus（pushplus.plus），markdown，同样支持外链图片
  mp         微信公众号（含「公众平台测试号」）模板消息，推给已关注的个人微信

公众号模板消息的限制（官方）：
  - 只能发给已经关注该公众号的 openid，且需要模板 id
  - 每个字段值都会当纯文本渲染，不支持 markdown / 图片
  - 消息上方那条 url 可以让整条消息可点击跳转
所以 mp 通道一条帖子发一条消息，正文字段用 {占位符} 模板配置。
"""

import json
import time
import urllib.parse
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

SC_URL = "https://sctapi.ftqq.com/{key}.send"
PP_URL = "https://www.pushplus.plus/send"
MP_TOKEN_URL = ("https://api.weixin.qq.com/cgi-bin/token"
                "?grant_type=client_credential&appid={appid}&secret={secret}")
MP_SEND_URL = "https://api.weixin.qq.com/cgi-bin/message/template/send?access_token={token}"

# 公众号 access_token 有效期 7200 秒，缓存起来避免每次都换（换太频会触发限频）
_TOKEN_CACHE = {}   # appid -> (token, expire_at)


def _post(opener, url, payload=None, form=None, timeout=25):
    """POST 并解析 JSON；HTTP 非 2xx 时把响应体一起带出来便于排查。"""
    if form is not None:
        data = urllib.parse.urlencode(form).encode("utf-8")
        ctype = "application/x-www-form-urlencoded"
    else:
        data = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
        ctype = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=data, headers={
        "Content-Type": ctype, "User-Agent": UA})
    try:
        with opener.open(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        return {"http_status": e.code, "errmsg": f"HTTP {e.code}", "raw": body[:400]}
    try:
        return json.loads(body)
    except Exception:
        return {"errmsg": "响应不是 JSON", "raw": body[:400]}


def _get(opener, url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with opener.open(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


# ---------------------------------------------------------------- 占位符渲染

def render_fields(tpl, ctx):
    """把 {"first": "{head} 到手 ¥{price}"} 这类模板里的占位符替换成实际值。

    未知占位符原样保留，方便用户看出自己拼错了哪个。
    """
    out = {}
    for k, v in (tpl or {}).items():
        s = str(v)
        for name, val in ctx.items():
            s = s.replace("{" + name + "}", str(val))
        out[k] = s
    return out


def deal_ctx(p, d, tz_offset=8.0):
    """模板可用的占位符取值。"""
    from datetime import datetime, timedelta, timezone

    dt = p.get("dt")
    if dt is not None:
        local = dt.astimezone(timezone(timedelta(hours=tz_offset)))
        ts = local.strftime("%m-%d %H:%M")
    else:
        ts = ""
    text = (p.get("text") or "").replace("\n", " ").strip()
    good = d.get("good") or ""
    bad = d.get("bad") or ""
    value = f"{good} 人觉得值 / {bad or 0} 人不值" if good else ""
    return {
        "head": (f"¥{d['price']} · {d['name']}" if d.get("price") else d.get("name", "")),
        "name": d.get("name", ""),
        "price": d.get("price", ""),
        "shop": d.get("shop", ""),
        "price_note": d.get("price_note", ""),
        "coupon": d.get("coupon", ""),
        "value": value,
        "url": d.get("url", ""),
        "photo": (p.get("photos") or [""])[0],
        "time": ts,
        "text": text[:120],
    }


DEFAULT_MP_FIELDS = {
    "first": "{head}",
    "keyword1": "到手 ¥{price}",
    "keyword2": "{shop} · {price_note}",
    "remark": "👉 {url}",
}


# ---------------------------------------------------------------- Server酱

def send_serverchan(opener, key, title, desp):
    if not key:
        return False, {"errmsg": "未填写 Server酱 SendKey"}
    r = _post(opener, SC_URL.format(key=key), form={"title": title[:64], "desp": desp})
    ok = r.get("code") == 0
    return ok, r


# ---------------------------------------------------------------- PushPlus

def send_pushplus(opener, token, title, content):
    if not token:
        return False, {"errmsg": "未填写 PushPlus token"}
    r = _post(opener, PP_URL, payload={
        "token": token, "title": title[:100], "content": content, "template": "markdown",
    })
    ok = r.get("code") == 200
    return ok, r


# ---------------------------------------------------------------- 公众号

def mp_access_token(opener, appid, secret, force=False):
    """换 access_token，带进程内缓存。返回 (token, error)。"""
    if not appid or not secret:
        return "", "未填写 appid / appsecret"
    hit = _TOKEN_CACHE.get(appid)
    if hit and not force and hit[1] > time.time():
        return hit[0], ""
    try:
        r = _get(opener, MP_TOKEN_URL.format(appid=appid, secret=secret))
    except Exception as e:
        return "", f"取 access_token 失败：{e}"
    token = r.get("access_token")
    if not token:
        return "", f"取 access_token 失败：{r.get('errmsg') or r}"
    _TOKEN_CACHE[appid] = (token, time.time() + int(r.get("expires_in", 7200)) - 300)
    return token, ""


def send_mp_template(opener, appid, secret, openid, template_id, data, url="", retry=True):
    """发一条公众号模板消息。返回 (ok, resp)。"""
    if not openid:
        return False, {"errmsg": "未填写接收人 openid"}
    if not template_id:
        return False, {"errmsg": "未填写模板 id"}
    token, err = mp_access_token(opener, appid, secret)
    if not token:
        return False, {"errmsg": err}
    payload = {"touser": openid, "template_id": template_id, "data": data}
    if url:
        payload["url"] = url
    r = _post(opener, MP_SEND_URL.format(token=token), payload=payload)
    if r.get("errcode") == 0:
        return True, r
    # 40001/42001 = token 失效，强制刷新后重试一次
    if retry and r.get("errcode") in (40001, 42001, 40014):
        token, err = mp_access_token(opener, appid, secret, force=True)
        if token:
            r = _post(opener, MP_SEND_URL.format(token=token), payload=payload)
            return r.get("errcode") == 0, r
    return False, r


# ---------------------------------------------------------------- markdown 排版

def post_markdown(p, d, tz_offset=8.0, with_image=True):
    """一条帖子排成 markdown：图在最上面，价格+品名做标题，第二行是佐证，最后是链接。"""
    ctx = deal_ctx(p, d, tz_offset)
    lines = []
    photo = ctx["photo"]
    if with_image and photo:
        lines.append(f"![商品图]({photo})")
    lines.append(f"### {ctx['head']}")
    bits = [x for x in (ctx["shop"], ctx["price_note"], ctx["value"], ctx["coupon"] and f"券 {ctx['coupon']}") if x]
    if bits:
        lines.append(" · ".join(bits))
    lines.append(f"[👉 去下单]({ctx['url']})")
    return "\n\n".join(lines)


def batch_markdown(items, limit=6000):
    """把多条 markdown 拼成若干条消息，避免单条过长被平台截断。"""
    out, buf, n = [], [], 0
    for md in items:
        if buf and n + len(md) > limit:
            out.append("\n\n---\n\n".join(buf))
            buf, n = [], 0
        buf.append(md)
        n += len(md) + 8
    if buf:
        out.append("\n\n---\n\n".join(buf))
    return out
