import { useEffect, useMemo, useRef, useState } from 'react'
import {
  RefreshCw,
  Send,
  Save,
  Package,
  Filter,
  Ban,
  Clock,
  Search,
  ChevronDown,
  Terminal,
  Settings2,
  Sparkles,
  CheckCheck,
  CheckSquare,
  Square,
  X,
  CalendarClock,
  Eraser,
  Moon,
  Sun,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useApi } from './api'
import { useToast } from './toast'
import type { Config, Snapshot } from './types'
import { Button } from './components/Button'
import { PostCard } from './components/PostCard'
import { HourChart } from './components/HourChart'
import { Field, inputCls, Panel, Switch } from './components/Panel'
import { KeywordEditor, KeywordCountBadge } from './components/KeywordEditor'
import { ExcludedDrawer } from './components/ExcludedDrawer'
import { CategoryNav } from './components/CategoryNav'
import { useTheme } from './lib/theme'
import { cn } from './lib/utils'

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'sky' | 'emerald' | 'red'
}) {
  const tones = {
    sky: 'text-sky-600 dark:text-sky-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-red-600 dark:text-red-400',
  } as const
  return (
    <div className="rounded-xl border border-line bg-ink-800 p-4">
      <div className={cn('mb-2 flex items-center gap-2 text-xs text-dim', tones[tone])}>{icon}</div>
      <div className={cn('tabular text-2xl leading-none font-bold', tones[tone])}>{value}</div>
      <div className="mt-1.5 text-xs text-dim">{label}</div>
    </div>
  )
}

export default function App() {
  const { snap, busy, fetchNow, pushNow, saveConfig, clearPushed, refilter } = useApi()
  const { show: toast } = useToast()
  const [theme, toggleTheme] = useTheme()

  const [cfg, setCfg] = useState<Config | null>(null)
  const [keyword, setKeyword] = useState('')
  const [showLog, setShowLog] = useState(true)
  const [excludeTick, setExcludeTick] = useState(0)
  const [sel, setSel] = useState<Set<number>>(new Set())
  /** 关键词自动保存的反馈：保存中 / 已存（带时间）/ 失败 */
  const [kwSave, setKwSave] = useState<'saving' | 'saved' | 'error' | ''>('')
  // key 默认遮住：截图 / 录屏 / 共享屏幕时不至于直接泄露
  const [showKey, setShowKey] = useState(false)
  const kwSavedAt = useRef('')
  const autoRef = useRef<number>(0)
  const saveTimer = useRef<number>(0)
  const pending = useRef<Config | null>(null)
  const saveConfigRef = useRef(saveConfig)
  saveConfigRef.current = saveConfig
  /** 最新快照，供防抖回调里读「改动前的已排除条数」做对比 */
  const snapRef = useRef<Snapshot | null>(null)
  snapRef.current = snap

  // 首次拿到服务端配置后初始化本地表单
  useEffect(() => {
    if (snap && !cfg) setCfg(snap.config)
  }, [snap, cfg])

  const posts = snap?.posts ?? []
  const stats = snap?.stats ?? { total: 0, kept: 0, excluded: 0 }
  const pushedMap = snap?.pushed ?? {}
  const pendingCount = useMemo(
    () => posts.filter((p) => !pushedMap[String(p.id)]).length,
    [posts, pushedMap],
  )

  const filtered = useMemo(() => {
    if (!keyword.trim()) return posts
    const k = keyword.trim().toLowerCase()
    return posts.filter((p) => p.text.toLowerCase().includes(k))
  }, [posts, keyword])

  // 自动刷新
  useEffect(() => {
    window.clearInterval(autoRef.current)
    const sec = cfg?.auto_refresh_sec ?? 0
    if (sec > 0 && cfg) {
      autoRef.current = window.setInterval(() => {
        void fetchNow(cfg)
      }, sec * 1000)
    }
    return () => window.clearInterval(autoRef.current)
  }, [cfg, fetchNow])

  const patch = (p: Partial<Config>) => setCfg((c) => (c ? { ...c, ...p } : c))

  /** 关键词变更即落盘：合并 350ms 内的连续改动（回车连加、批量导入）只发一次 */
  const onExcludeChange = (exclude: string[]) => {
    if (!cfg) return
    const next = { ...cfg, exclude }
    pending.current = next
    setCfg(next)
    setKwSave('saving')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      const target = pending.current
      if (!target) return
      const ok = await saveConfigRef.current(target)
      if (ok) {
        const d = new Date()
        kwSavedAt.current = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
      }
      setKwSave(ok ? 'saved' : 'error')
      // 存盘之后立刻用新词表重算已抓到的帖子：
      // 新加的词把命中的帖子挪进「已排除」，删掉的词把帖子放回列表，
      // 不用再点一次「抓取今日」才能看到结果
      if (ok) {
        if (!target.filter_enabled) {
          toast('关键词已保存，但「启用关键词过滤」是关的，暂时不会排除任何帖子', false)
          return
        }
        const before = snapRef.current?.stats.excluded ?? 0
        const r = await refilter()
        const after = r.stats?.excluded ?? before
        if (r.ok && after !== before) {
          toast(
            after > before
              ? `已排除 ${after - before} 条（共 ${after} 条在「已排除」里）`
              : `已放回 ${before - after} 条到列表`,
            true,
          )
        }
      }
    }, 350)
  }

  // 卸载前把还没落盘的改动补发一次，避免快速关页面丢掉刚加的词
  useEffect(() => {
    return () => {
      window.clearTimeout(saveTimer.current)
      const target = pending.current
      if (target) void saveConfigRef.current(target)
    }
  }, [])

  /**
   * 从「已排除」条目上取消某个关键词：
   * 1. 先从 exclude 里删掉并**立刻**落盘（不能走 350ms 防抖，
   *    否则紧接着的 refilter 会在服务端还拿着旧词表时执行，白跑一次）
   * 2. 调 /api/refilter 用新词表重算已抓到的帖子，被它挡住的那条立刻回到主列表
   */
  const onUnban = async (word: string) => {
    if (!cfg) return
    const next: Config = { ...cfg, exclude: cfg.exclude.filter((k) => k !== word) }
    window.clearTimeout(saveTimer.current)
    pending.current = next
    setCfg(next)
    setKwSave('saving')
    const saved = await saveConfigRef.current(next)
    if (!saved) {
      setKwSave('error')
      toast(`取消排除「${word}」失败：设置没存上`, false)
      return
    }
    setKwSave('saved')
    const r = await refilter()
    toast(
      r.ok ? `已取消排除「${word}」，相关帖子已放回列表` : `已取消排除「${word}」，但重新过滤失败：${r.error}`,
      r.ok,
    )
  }

  const onFetch = async () => {
    if (!cfg) return
    const r = await fetchNow(cfg)
    if (!r.ok) {
      toast(`抓取失败：${r.error}`, false)
    } else if (r.warn) {
      toast(`抓取完成但有警告：${r.warn}`, false)
    } else {
      toast(`抓取成功：保留 ${r.stats?.kept ?? 0} 条 / 共 ${r.stats?.total ?? 0} 条`, true)
    }
  }

  const onPush = async () => {
    if (!cfg) return
    const r = await pushNow(cfg, { skipPushed: false })
    toast(r.ok ? `推送完成：${r.sent ?? ''}` : `推送失败：${r.error}`, r.ok)
  }

  /** 只推还没推过的：每天重复跑也不会刷屏 */
  const onPushNew = async () => {
    if (!cfg) return
    const r = await pushNow(cfg, { skipPushed: true })
    toast(r.ok ? `推送完成：${r.sent ?? ''}` : `没有新内容或推送失败：${r.error}`, r.ok)
  }

  const onPushSelected = async () => {
    if (!cfg || sel.size === 0) return
    const n = sel.size
    const r = await pushNow(cfg, { ids: [...sel] })
    if (r.ok) setSel(new Set())
    toast(r.ok ? `已推送勾选的 ${n} 条：${r.sent ?? ''}` : `推送失败：${r.error}`, r.ok)
  }

  const onClearPushed = async () => {
    if (!snap?.stats.pushed) return
    const ok = await clearPushed()
    toast(ok ? '已清空推送记录，下次「全部推送」会重发一遍' : '清空失败', ok)
  }

  const toggle = (id: number, on: boolean) =>
    setSel((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  // 勾选集合随抓取结果收敛（重新抓取后丢弃已不存在的 id）
  useEffect(() => {
    if (!sel.size) return
    const alive = new Set(posts.map((p) => p.id))
    setSel((s) => {
      const next = new Set([...s].filter((id) => alive.has(id)))
      return next.size === s.size ? s : next
    })
  }, [posts]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSave = async () => {
    if (!cfg) return
    toast((await saveConfig(cfg)) ? '设置已保存' : '保存失败', true)
  }

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="glass sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="brand-gradient flex size-8 items-center justify-center rounded-lg text-white shadow-lg shadow-brand/30">
              <Sparkles className="size-4" />
            </span>
            <h1 className="text-[15px] font-semibold tracking-wide">
              真正值得买 <span className="text-brand">zzzdm</span>
              <span className="ml-2 text-xs font-normal text-dim">推送面板</span>
            </h1>
          </div>

          <Badge text={snap?.last_fetch ? `抓取于 ${snap.last_fetch}` : '未抓取'} icon={<Clock className="size-3" />} />
          {snap?.last_error ? <Badge text={snap.last_error.slice(0, 46)} danger /> : null}
          {snap?.fetch_warn ? <Badge text={`数据可能不完整：${snap.fetch_warn.slice(0, 40)}`} danger /> : null}
          {snap?.job?.last_run ? <Badge text={`定时 ${cfg?.daily_time} · 上次 ${snap.job.last_run.slice(5)}`} /> : null}
          {busy === 'push' && <Badge text="推送中" pulse />}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? '切到白天模式' : '切到夜间模式'}
              className="inline-flex size-10 items-center justify-center rounded-lg border border-line bg-ink-700 text-dim transition hover:border-ink-600 hover:bg-ink-600 hover:text-fg"
            >
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <Button onClick={onFetch} loading={busy === 'fetch'} disabled={!cfg}>
              <RefreshCw className="size-4" />
              刷新抓取
            </Button>
            {sel.size > 0 && (
              <Button
                variant="primary"
                onClick={onPushSelected}
                loading={busy === 'push'}
                disabled={!cfg}
                title="只推送被勾选的帖子"
              >
                <CheckCheck className="size-4" />
                推送勾选 <span className="tabular">{sel.size}</span>
              </Button>
            )}
            <Button
              variant={sel.size > 0 ? 'ghost' : 'primary'}
              onClick={onPushNew}
              loading={busy === 'push'}
              disabled={!cfg || !posts.length || pendingCount === 0}
              title="只推送还没推过的帖子，适合每天定时跑"
            >
              <Send className="size-4" />
              推未推送 <span className="tabular">{pendingCount}</span>
            </Button>
            <Button
              variant="ghost"
              onClick={onPush}
              loading={busy === 'push'}
              disabled={!cfg || !posts.length}
              title="无视推送记录，全部重发一遍"
            >
              全部重推
            </Button>
          </div>
        </div>
      </header>

      {cfg && (
        <CategoryNav
          exclude={cfg.exclude}
          enabled={cfg.filter_enabled}
          onChange={onExcludeChange}
        />
      )}

      <main className="mx-auto grid max-w-[1400px] gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* left */}
        <section className="min-w-0">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <StatCard icon={<Package className="size-3.5" />} label="今日总推送" value={stats.total} tone="sky" />
            <StatCard
              icon={<Filter className="size-3.5" />}
              label={`过滤后保留${stats.pushed ? ` · 已推 ${stats.pushed}` : ''}`}
              value={stats.kept}
              tone="emerald"
            />
            <button
              type="button"
              onClick={() => setExcludeTick((v) => v + 1)}
              className="text-left transition hover:brightness-125"
              title="点击查看被排除的商品"
            >
              <StatCard icon={<Ban className="size-3.5" />} label="关键词已过滤（点击查看）" value={stats.excluded} tone="red" />
            </button>
          </div>

          <div className="mb-4 rounded-xl border border-line bg-ink-800 px-4 pt-3 pb-1">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">
              <Clock className="size-3" /> 今日推送时段分布
            </div>
            <HourChart posts={posts} />
          </div>

          <div className="sticky top-[61px] z-20 mb-3 flex items-center gap-2 bg-ink-900/85 py-2 backdrop-blur">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-dim" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="在已抓到的帖子里搜关键词（品牌、商品、补贴…）"
                className={cn(inputCls, 'pl-9')}
              />
            </div>
            {cfg && (
              <span className="tabular hidden shrink-0 items-center rounded-lg border border-line bg-ink-800 px-3 py-2 text-xs text-dim sm:inline-flex">
                <KeywordCountBadge n={cfg.exclude.length} enabled={cfg.filter_enabled} />
              </span>
            )}
            <span className="tabular shrink-0 rounded-lg border border-line bg-ink-800 px-3 py-2 text-xs text-dim">
              {filtered.length} / {posts.length}
            </span>
            <button
              type="button"
              onClick={() => {
                const all = filtered.map((p) => p.id)
                const every = all.length > 0 && all.every((id) => sel.has(id))
                setSel((s) => {
                  const next = new Set(s)
                  if (every) all.forEach((id) => next.delete(id))
                  else all.forEach((id) => next.add(id))
                  return next
                })
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-ink-800 px-3 py-2 text-xs text-dim transition hover:border-ink-600 hover:text-fg"
              title="全选/取消当前列表中的帖子"
            >
              {filtered.length > 0 && filtered.every((p) => sel.has(p.id)) ? (
                <CheckSquare className="size-3.5 text-brand" />
              ) : (
                <Square className="size-3.5" />
              )}
              全选
            </button>
          </div>

          {sel.size > 0 && (
            <div className="fade-in mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand/35 bg-brand/8 px-3 py-2">
              <span className="tabular text-xs text-brand">
                已选 {sel.size} 条
              </span>
              <span className="text-[11px] text-dim">
                选中「推送勾选」只发这些；「推未推送」发剩下 {pendingCount} 条没发过的
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="primary" loading={busy === 'push'} onClick={onPushSelected}>
                  <CheckCheck className="size-3.5" />
                  推送勾选
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
                  <X className="size-3.5" />
                  清空
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {filtered.length === 0 ? (
              <Empty hasFetched={!!snap?.last_fetch} keyword={keyword} />
            ) : (
              filtered
                .slice()
                .reverse()
                .map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    checked={sel.has(p.id)}
                    onToggle={toggle}
                    pushedAt={pushedMap[String(p.id)]}
                  />
                ))
            )}
          </div>

          <ExcludedDrawer
            posts={snap?.excluded ?? []}
            keywords={cfg?.exclude ?? []}
            openTick={excludeTick}
            onUnban={onUnban}
          />
        </section>

        {/* right：粘住 + 自身可滚动，内容比视口高时也能滚到位 */}
        <aside className="sidebar-scroll flex min-w-0 flex-col gap-4 lg:sticky lg:top-[77px] lg:max-h-[calc(100vh-93px)] lg:overflow-y-auto lg:pr-1.5 lg:self-start">
          {cfg && (
            <>
              <Panel title="推送设置" icon={<Settings2 className="size-3.5" />}>
                <div className="space-y-3">
                  <Field label="企业微信 webhook key" hint="群机器人">
                    <div className="relative">
                      <input
                        className={cn(inputCls, 'pr-10')}
                        type={showKey ? 'text' : 'password'}
                        value={cfg.key}
                        onChange={(e) => patch({ key: e.target.value.trim() })}
                        placeholder="粘贴 key= 后面那串"
                        autoComplete="new-password"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        title={showKey ? '隐藏' : '显示'}
                        aria-label={showKey ? '隐藏 key' : '显示 key'}
                        className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-dim transition hover:bg-ink-700 hover:text-fg"
                      >
                        {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </Field>
                  <Field label="代理" hint="留空用系统代理">
                    <input
                      className={inputCls}
                      value={cfg.proxy}
                      onChange={(e) => patch({ proxy: e.target.value.trim() })}
                      placeholder="http://127.0.0.1:7890"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="只发最新 N 条" hint="0 不限">
                      <input
                        className={inputCls}
                        type="number"
                        min={0}
                        value={cfg.latest}
                        onChange={(e) => patch({ latest: Math.max(0, parseInt(e.target.value) || 0) })}
                      />
                    </Field>
                    <Field label="自动刷新(秒)" hint="0 关闭">
                      <input
                        className={inputCls}
                        type="number"
                        min={0}
                        value={cfg.auto_refresh_sec}
                        onChange={(e) => patch({ auto_refresh_sec: Math.max(0, parseInt(e.target.value) || 0) })}
                      />
                    </Field>
                  </div>
                  <Switch
                    checked={cfg.filter_enabled}
                    onChange={(v) => patch({ filter_enabled: v })}
                    label="启用关键词过滤"
                    hint={cfg.filter_enabled ? `${cfg.exclude.length} 个词生效` : '关闭后不过滤任何帖子'}
                  />
                  <Switch
                    checked={cfg.push_images ?? true}
                    onChange={(v) => patch({ push_images: v })}
                    label="图文合成推送（图+价+名+二维码，一条走完）"
                    hint={(cfg.push_images ?? true) ? '每条只发一条消息：图和字在同一张图里' : '关闭后只发纯文字列表'}
                  />

                  <div className="rounded-lg border border-line bg-ink-900/60 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">
                      <CalendarClock className="size-3" />
                      每日定时（服务端，关掉网页也跑）
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="每天几点" hint="留空关闭">
                        <input
                          className={inputCls}
                          type="time"
                          value={cfg.daily_time || ''}
                          onChange={(e) => patch({ daily_time: e.target.value })}
                        />
                      </Field>
                      <div className="flex items-end pb-2">
                        <Switch
                          checked={cfg.auto_push ?? false}
                          onChange={(v) => patch({ auto_push: v })}
                          label="抓完自动推送"
                          hint={cfg.auto_push ? '只推未推送过的' : '只抓取不推送'}
                        />
                      </div>
                    </div>
                    <Button className="mt-2 w-full" size="sm" onClick={onSave}>
                      <Save className="size-3.5" />
                      保存定时设置
                    </Button>
                  </div>

                  <KeywordEditor
                    cfg={cfg}
                    onChange={onExcludeChange}
                    saved={kwSave}
                    savedAt={kwSavedAt.current}
                    samples={(snap?.excluded ?? []).map((p) => p.text)}
                  />
                  <Button className="w-full" onClick={onSave}>
                    <Save className="size-4" />
                    保存设置
                  </Button>
                  {snap && snap.stats.pushed ? (
                    <button
                      type="button"
                      onClick={onClearPushed}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[11px] text-dim transition hover:border-red-500/40 hover:text-red-600 dark:hover:text-red-300"
                      title="清空后「全部重推」会重新发送所有帖子"
                    >
                      <Eraser className="size-3" />
                      清空推送记录（当前 {snap.stats.pushed} 条已推）
                    </button>
                  ) : null}
                  {snap && snap.excluded.length > 0 && (
                    <p className="text-[11px] leading-relaxed text-dim">
                      已过滤 {snap.excluded.length} 条，例如「{snap.excluded[0]?.text.slice(0, 22)}…」
                    </p>
                  )}
                </div>
              </Panel>

              <Panel
                title="运行日志"
                icon={<Terminal className="size-3.5" />}
                className="overflow-hidden"
              >
                <button
                  onClick={() => setShowLog((v) => !v)}
                  className="mb-2 flex w-full items-center justify-between text-xs text-dim hover:text-fg"
                >
                  <span>{showLog ? '收起' : '展开'}</span>
                  <ChevronDown className={cn('size-3.5 transition', showLog && 'rotate-180')} />
                </button>
                {showLog && (
                  <div className="max-h-56 overflow-auto rounded-lg bg-ink-950 p-2.5 font-mono text-[11px] leading-relaxed">
                    {(snap?.log ?? [])
                      .slice()
                      .reverse()
                      .map((l, i) => (
                        <div key={i} className="flex gap-2 border-b border-white/4 py-1 last:border-0">
                          <span className="shrink-0 text-brand">{l.t}</span>
                          <span className="break-all text-dim">{l.m}</span>
                        </div>
                      ))}
                    {!snap?.log.length && <div className="py-3 text-center text-dim/60">暂无日志</div>}
                  </div>
                )}
              </Panel>
            </>
          )}
        </aside>
      </main>
    </div>
  )
}

function Badge({ text, icon, danger, pulse }: { text: string; icon?: React.ReactNode; danger?: boolean; pulse?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
        danger ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300' : 'border-line bg-ink-800 text-dim',
        pulse && 'animate-pulse',
      )}
    >
      {icon}
      {text}
    </span>
  )
}

function Empty({ hasFetched, keyword }: { hasFetched: boolean; keyword: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-20 text-center">
      <Package className="mb-3 size-9 text-dim/40" />
      <p className="text-sm text-dim">
        {keyword ? `没有匹配「${keyword}」的帖子` : hasFetched ? '今天还没有抓到帖子' : '点右上角「刷新抓取」开始'}
      </p>
    </div>
  )
}
