# zzzdm 推送面板

抓取 Telegram 频道 [`zzzdm`](https://t.me/s/zzzdm)（真正值得买）的当日推送，按关键词过滤后，以「首图 + 说明」的形式推送到企业微信群机器人。

自带一个本地 Web 面板，可以手动抓取、勾选推送、维护排除关键词、切换白天/夜间主题。

## 组成

| 文件 | 作用 |
| --- | --- |
| `tg_zzzdm_to_wecom.py` | 抓取、解析、过滤、推送的核心逻辑，也可单独作为 CLI 使用 |
| `webui_server.py` | 本地 HTTP 服务，提供 `/api/*` 接口并托管 `ui/dist` |
| `ui/` | React 19 + Vite 7 + TypeScript + Tailwind v4 面板源码 |
| `ui_config.example.json` | 配置模板，复制为 `ui_config.json` 后填入自己的 webhook key |

## 快速开始

```powershell
# 1. 配置
Copy-Item ui_config.example.json ui_config.json
# 编辑 ui_config.json，把 key 换成企业微信群机器人的 webhook key

# 2. 构建前端（首次或改过 ui/src 后）
cd ui
pnpm install
pnpm build
cd ..

# 3. 启动面板
python webui_server.py
# 打开 http://127.0.0.1:8765/
```

不想用面板、只想跑一次抓取推送：

```powershell
$env:ZZZDM_WEBHOOK_KEY = "你的 key"
python tg_zzzdm_to_wecom.py
```

CLI 支持 `--hours`、`--latest`、`--exclude`、`--no-exclude-defaults`、`--proxy`、`--tz`、`--dry-run`、`--no-images` 等参数，`-h` 查看全部。

## 配置项

`ui_config.json` 由面板「推送设置」自动维护，也可以手工编辑：

| 键 | 说明 |
| --- | --- |
| `key` | 企业微信群机器人 webhook key（**不要提交到仓库**） |
| `proxy` | 抓取 Telegram 用的 HTTP 代理，留空则直连 |
| `tz` | 时区偏移，默认 `8.0` |
| `exclude` | 排除关键词列表，命中即过滤 |
| `filter_enabled` | 是否启用关键词过滤 |
| `latest` | 只展示/推送最近 N 条，`0` 表示全部 |
| `push_images` | 是否把说明文字合成到首图上推送 |
| `auto_refresh_sec` | 面板自动刷新间隔，`0` 关闭 |
| `auto_push` | 抓取后自动推送 |
| `daily_time` | 每日定时执行时间 `"HH:MM"`，空表示关闭 |
| `skip_pushed` | 跳过已推送过的帖子 |

## 运行产物（都在本地，不入库）

- `ui_config.json` / `ui_config.json.bak`：配置与上一版备份
- `ui_state.json`：已推送记录、定时任务上次运行时间
- `logs/YYYY-MM-DD.log`：运行日志

## 说明

- 抓取走 `https://t.me/s/<channel>` 的公开预览页，不登录、不调用 Telegram API。代理只在本地抓取时需要，部署在境外服务器上可以留空。
- 企业微信 webhook 单条消息只能是 text / image / news 之一，所以「首图 + 文字合一」是把文字绘制到图片上生成一张卡片再发送（依赖 Pillow）。
- 面板是纯本地工具，没有鉴权，不要直接暴露到公网。

## 许可

个人自用，无许可证。
