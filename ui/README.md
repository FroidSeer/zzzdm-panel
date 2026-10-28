# zzzdm-ui

「真正值得买 · 推送面板」的前端，用主流前端技术栈封装：

- **React 19** + **TypeScript**
- **Vite 7**（构建 / 开发服务器）
- **Tailwind CSS v4**（白天/夜间双主题，`src/index.css` 里定义 ink/line/fg/dim/brand 色板）
- **lucide-react** 图标
- 图表为纯 SVG/CSS 手写柱状图（不引入 echarts，产物从 739KB 降到 297KB）

## 主题（白天 / 夜间）

- `src/lib/theme.ts`：`useTheme()` 返回 `[theme, toggle]`，只切 `<html>` 上的 `.dark` 类。
- `src/index.css`：`@theme` 里是**白天**色值，`html.dark { … }` 覆盖成夜间色值。
  Tailwind 编译出的工具类引用的就是这些 CSS 变量，所以组件里不用写 `dark:`
  前缀就能整体换肤；只有零星的语义色（红/绿/蓝）写了 `dark:` 变体。
- `index.html` 首帧前跑一小段内联脚本读 `localStorage['zzzdm-theme']`，
  避免刷新时闪白/闪黑。也可以用 `?theme=dark` / `?theme=light` 临时指定。

## 排除大类

- `src/lib/catalog.ts`：10 个大类 / 49 个小类 / 350 个词，纯前端常量。
- `src/components/CategoryNav.tsx`：header 下方的导航条，点大类等于整组词入库/出库，
  展开后可以单独勾选某个小类（三态框：全选 / 部分 / 未选）。
- 服务端只认识扁平的 `exclude: string[]`，大类是「这组词是否都在 exclude 里」的
  派生视图，所以**加/删大类不需要改后端**。自定义关键词（不在目录里的词）会单独提示。

## 目录结构

```
ui/
  src/
    main.tsx            # React 入口
    App.tsx             # 页面骨架：统计卡、时段分布、帖子列表、右侧设置
    api.ts              # 封装 /api/state /api/fetch /api/push /api/config
    toast.tsx           # 右上角 toast
    types.ts            # Post/Config/Snapshot 类型 + 链接分类
    lib/
      catalog.ts        # 排除大类目录（大类 / 小类 / 词）
      theme.ts          # 白天夜间主题
    components/
      Button.tsx  Panel.tsx  PostCard.tsx  HourChart.tsx
      CategoryNav.tsx   # 排除大类导航条
      KeywordEditor.tsx ExcludedDrawer.tsx Lightbox.tsx
  vite.config.ts        # dev 代理 /api → 127.0.0.1:8765，构建 base:'./'
```

## 开发

```powershell
# 1) 先启动后端（服务 API + 静态文件）
python ..\webui_server.py --port 8765

# 2) 起 Vite 开发服务器（热更新）
pnpm dev        # 或 npm run dev
# 打开 http://127.0.0.1:5173 （/api 会自动代理到 8765）
```

## 构建（让后端直接托管前端产物）

```powershell
pnpm build      # 输出到 ui/dist
# 之后 webui_server.py 会自动优先返回 dist/index.html
```

后端无改动时也可直接跑 `python webui_server.py`，它会托管 `ui/dist`。
