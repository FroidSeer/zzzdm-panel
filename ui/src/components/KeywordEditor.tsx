import { useMemo, useRef, useState } from 'react'
import { Ban, Check, ChevronDown, Download, Loader2, Plus, RotateCcw, Search, Trash2, Upload, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { buildKeywordsFile, downloadText, keywordsFileName, parseKeywords } from '../lib/keywords'
import { Field } from './Panel'
import type { Config } from '../types'

/** 内置分组：和后端 EXCLUDE_KEYWORDS 对应，仅用于「恢复默认」与分组展示 */
const DEFAULT_GROUPS: { name: string; words: string[] }[] = [
  { name: '通用', words: ['母婴', '婴儿', '宝宝', '幼儿', '婴幼', '儿童', '孩童', '小孩', '新生儿'] },
  {
    name: '纸品/尿裤',
    words: ['尿不湿', '尿裤', '纸尿裤', '拉拉裤', '尿片'],
  },
  {
    name: '喂养',
    words: [
      '配方奶', '配方奶粉', '婴儿奶粉', '婴幼儿奶粉', '宝宝奶粉', '一段奶粉',
      '二段奶粉', '三段奶粉', '1段奶粉', '2段奶粉', '3段奶粉',
      '辅食', '奶瓶', '奶嘴', '吸奶器', '哺乳', '母乳', '断奶',
      '磨牙棒', '磨牙饼', '婴儿米粉', '宝宝辅食',
    ],
  },
  {
    name: '出行/睡眠',
    words: ['婴儿车', '学步车', '婴儿床', '摇篮', '腰凳', '婴儿背带', '安全座椅', '儿童座椅', '童车', '童装', '童鞋', '童袜', '遛娃', '溜娃'],
  },
  {
    name: '孕产',
    words: ['孕妇', '孕期', '待产', '月子', '产妇', '孕妇装', '待产包'],
  },
  {
    name: '玩具/早教',
    words: ['玩具', '积木', '乐高', '拼图', '毛绒', '玩偶', '早教', '益智', '儿童绘本'],
  },
  {
    name: '牛奶/乳制品',
    words: ['牛奶', '鲜奶', '纯奶', '奶粉', '生牛乳', '巴氏杀菌乳', '酪蛋白', '水牛奶', '乳清', '高钙奶', '舒化', '特仑苏', '金典纯'],
  },
]

const DEFAULT_WORDS = DEFAULT_GROUPS.flatMap((g) => g.words)

/** 高亮命中的关键词，便于一眼看出为什么被过滤 */
function Hit({ text, word }: { text: string; word: string }) {
  const i = text.toLowerCase().indexOf(word.toLowerCase())
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-brand/25 px-0.5 text-brand">{text.slice(i, i + word.length)}</mark>
      {text.slice(i + word.length)}
    </>
  )
}

/** 关键词改动的自动保存状态：改一下就在这儿看到有没有真的存进配置文件 */
function SaveBadge({ state, at }: { state?: 'saving' | 'saved' | 'error' | ''; at?: string }) {
  if (!state) return null
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-0.5 text-dim/70" title="改动正在写入配置文件">
        <Loader2 className="size-2.5 animate-spin" />
        保存中
      </span>
    )
  }
  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400/80" title="自动保存失败，可点下方「保存设置」重试">
        保存失败
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400/80"
      title="关键词已自动写入 ui_config.json"
    >
      <Check className="size-2.5" />
      已存{at ? ` ${at}` : ''}
    </span>
  )
}

export function KeywordEditor({
  cfg,
  onChange,
  samples,
  saved,
  savedAt,
}: {
  cfg: Config
  onChange: (exclude: string[]) => void
  /** 被过滤掉的帖子标题，用于「命中预览」 */
  samples: string[]
  /** 自动保存状态：saving 保存中 / saved 已保存 / error 失败 */
  saved?: 'saving' | 'saved' | 'error' | ''
  /** 上次保存成功的时刻，如 14:31:07 */
  savedAt?: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [io, setIo] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const words = cfg.exclude
  const set = useMemo(() => new Set(words), [words])

  const add = (raw: string) => {
    const list = raw
      .split(/[\n,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const next = [...words]
    for (const w of list) if (!set.has(w)) next.push(w)
    if (next.length !== words.length) onChange(next)
    setDraft('')
  }

  const remove = (w: string) => onChange(words.filter((x) => x !== w))

  /** 导出：txt / md，内容一致，只是注释标记不同 */
  const exportAs = (fmt: 'txt' | 'md') => {
    if (!words.length) {
      setIo({ kind: 'err', text: '还没有关键词可导出' })
      return
    }
    downloadText(
      keywordsFileName(words.length, fmt),
      buildKeywordsFile(words, fmt),
      fmt === 'md' ? 'text/markdown' : 'text/plain',
    )
    setIo({ kind: 'ok', text: `已导出 ${words.length} 个关键词（.${fmt}）` })
  }

  /** 导入：txt / md / csv 都按同一套规则解析 */
  const importFile = async (file: File) => {
    setBusy(true)
    try {
      const incoming = parseKeywords(await file.text())
      if (!incoming.length) {
        setIo({ kind: 'err', text: `「${file.name}」里没读到关键词` })
        return
      }
      const added = incoming.filter((w) => !set.has(w))
      onChange([...words, ...added])
      setIo({
        kind: 'ok',
        text: added.length
          ? `从「${file.name}」读入 ${incoming.length} 个，新增 ${added.length} 个（重复 ${incoming.length - added.length} 个已跳过）`
          : `「${file.name}」里的 ${incoming.length} 个词已全部存在`,
      })
    } catch (e) {
      setIo({ kind: 'err', text: `读取失败：${(e as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  const visible = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? words.filter((w) => w.toLowerCase().includes(k)) : words
  }, [words, q])

  const missingDefaults = DEFAULT_WORDS.filter((w) => !set.has(w))

  // 命中预览：每个关键词命中的样本数
  const hits = useMemo(() => {
    if (!samples.length) return []
    return words
      .map((w) => {
        const matched = samples.filter((s) => s.includes(w))
        return { word: w, n: matched.length, sample: matched[0] ?? '' }
      })
      .filter((h) => h.n > 0)
      .sort((a, b) => b.n - a.n)
  }, [words, samples])

  return (
    <Field
      plain
      label="排除关键词"
      hint={
        <span className="flex items-center gap-1.5">
          <span>{words.length} 个</span>
          <SaveBadge state={saved} at={savedAt} />
          {missingDefaults.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([...words, ...missingDefaults])}
              className="text-brand/80 hover:text-brand"
              title={`补回 ${missingDefaults.length} 个内置关键词`}
            >
              补默认
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange(DEFAULT_WORDS)}
            className="text-dim/70 hover:text-fg"
            title={`重置为内置 ${DEFAULT_WORDS.length} 个关键词`}
          >
            重置
          </button>
          {words.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-dim/70 hover:text-red-600 dark:hover:text-red-400"
              title="清空"
            >
              清空
            </button>
          )}
        </span>
      }
    >
      <div className="rounded-lg border border-line bg-ink-950">
        {/* 顶部：折叠条 + 计数 */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Ban className="size-3.5 shrink-0 text-red-600 dark:text-red-400/80" />
            <span className="truncate text-xs text-dim">
              {words.length ? words.slice(0, 5).join('、') + (words.length > 5 ? ` 等 ${words.length} 个` : '') : '未设置（不过滤任何帖子）'}
            </span>
          </span>
          <ChevronDown className={cn('size-3.5 shrink-0 text-dim transition', open && 'rotate-180')} />
        </button>

        {open && (
          <div className="border-t border-line p-2.5">
            {/* 添加：回车/逗号即成标签 */}
            <div className="flex gap-1.5">
              <input
                ref={inputRef}
                className="h-8 flex-1 rounded-md border border-line bg-ink-900 px-2.5 text-xs text-fg outline-none placeholder:text-dim/50 focus:border-brand/70 focus:ring-2 focus:ring-brand/20"
                placeholder="输入后回车添加，支持逗号批量：尿裤, 婴儿"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                    e.preventDefault()
                    add(draft)
                  }
                }}
              />
              <button
                type="button"
                onClick={() => add(draft)}
                disabled={!draft.trim()}
                className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-line bg-ink-800 px-2.5 text-xs text-dim transition hover:border-brand/50 hover:text-fg disabled:opacity-40"
              >
                <Plus className="size-3.5" />
                添加
              </button>
            </div>

            {/* 导入 / 导出：txt、md 都认 */}
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.markdown,.csv,text/plain,text/markdown"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importFile(f)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="flex h-7 items-center gap-1 rounded-md border border-line bg-ink-800 px-2 text-[11px] text-dim transition hover:border-brand/50 hover:text-fg disabled:opacity-40"
                title="从 .txt / .md 文件追加关键词（已存在的自动跳过）"
              >
                <Upload className="size-3" />
                导入
              </button>
              <span className="text-[10.5px] text-dim/40">导出</span>
              <button
                type="button"
                onClick={() => exportAs('txt')}
                className="flex h-7 items-center gap-1 rounded-md border border-line bg-ink-800 px-2 text-[11px] text-dim transition hover:border-brand/50 hover:text-fg"
                title="导出为纯文本，一行一个词"
              >
                <Download className="size-3" />
                .txt
              </button>
              <button
                type="button"
                onClick={() => exportAs('md')}
                className="flex h-7 items-center gap-1 rounded-md border border-line bg-ink-800 px-2 text-[11px] text-dim transition hover:border-brand/50 hover:text-fg"
                title="导出为 Markdown，带说明注释"
              >
                <Download className="size-3" />
                .md
              </button>
            </div>

            {/* 上次导入/导出的结果 */}
            {io && (
              <p
                className={cn(
                  'mt-1.5 flex items-start gap-1 text-[10.5px] leading-relaxed',
                  io.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400/80' : 'text-red-600 dark:text-red-400/80',
                )}
              >
                <span className="flex-1">{io.text}</span>
                <button
                  type="button"
                  onClick={() => setIo(null)}
                  className="shrink-0 text-dim/50 hover:text-fg"
                  title="关闭提示"
                >
                  <X className="size-3" />
                </button>
              </p>
            )}

            {/* 搜索框：关键词多了靠它定位 */}
            {words.length > 12 && (
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-dim/60" />
                <input
                  className="h-8 w-full rounded-md border border-line bg-ink-900 pr-2.5 pl-8 text-xs text-fg outline-none placeholder:text-dim/50 focus:border-brand/70"
                  placeholder={`在 ${words.length} 个关键词中搜索`}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            )}

            {/* 标签云：固定高度内自己滚，滚到底不会带动整页 */}
            <div className="thin-scroll mt-2.5 flex max-h-44 flex-wrap content-start gap-1.5 overflow-y-auto">
              {visible.map((w) => (
                <span
                  key={w}
                  className="group inline-flex items-center gap-1 rounded-md border border-line bg-ink-800 py-0.5 pr-1 pl-2 text-[11.5px] text-fg/90 transition hover:border-red-500/40"
                >
                  {w}
                  <button
                    type="button"
                    onClick={() => remove(w)}
                    className="rounded p-0.5 text-dim/60 transition hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400"
                    title={`移除「${w}」`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {!visible.length && (
                <span className="px-1 py-2 text-[11px] text-dim/60">
                  {q ? `没有匹配「${q}」的关键词` : '还没有关键词，上面输入框添加'}
                </span>
              )}
            </div>

            {/* 命中预览：这些词真的拦下了什么 */}
            {hits.length > 0 && (
              <div className="mt-2.5 border-t border-line pt-2">
                <p className="mb-1.5 text-[10.5px] text-dim/70">本次抓取命中的关键词</p>
                <div className="thin-scroll max-h-28 space-y-1 overflow-y-auto">
                  {hits.slice(0, 6).map((h) => (
                    <div key={h.word} className="flex items-baseline gap-2 text-[11px]">
                      <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-red-600 dark:text-red-300">
                        {h.word}·{h.n}
                      </span>
                      <span className="line-clamp-1 text-dim/80">
                        <Hit text={h.sample.slice(0, 40)} word={h.word} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 内置分组：一键整组补回 */}
            <details className="mt-2.5 border-t border-line pt-2">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10.5px] text-dim/70 hover:text-dim">
                <ChevronDown className="size-3" />
                内置分组（{DEFAULT_GROUPS.length} 组 / {DEFAULT_WORDS.length} 词）
              </summary>
              <div className="mt-2 space-y-1.5">
                {DEFAULT_GROUPS.map((g) => {
                  const missing = g.words.filter((w) => !set.has(w))
                  const all = missing.length === 0
                  return (
                    <div key={g.name} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 truncate text-[11px] text-dim">{g.name}</span>
                      <span className="line-clamp-1 flex-1 text-[10.5px] text-dim/60">
                        {g.words.join('、')}
                      </span>
                      <button
                        type="button"
                        disabled={all}
                        onClick={() => onChange([...words, ...missing])}
                        className={cn(
                          'shrink-0 rounded px-1.5 py-0.5 text-[10.5px] transition',
                          all
                            ? 'text-emerald-600 dark:text-emerald-400/60'
                            : 'text-brand/80 hover:bg-brand/10 hover:text-brand',
                        )}
                      >
                        {all ? '已全选' : `+${missing.length}`}
                      </button>
                    </div>
                  )
                })}
              </div>
            </details>

            {words.length > 0 && (
              <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2 text-[10.5px] text-dim/60">
                <span>共 {words.length} 个，点击 × 删除</span>
                <button
                  type="button"
                  onClick={() => {
                    onChange([])
                    inputRef.current?.focus()
                  }}
                  className="inline-flex items-center gap-1 hover:text-red-600 dark:hover:text-red-400"
                >
                  <Trash2 className="size-3" />
                  清空全部
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Field>
  )
}

/** 顶部工具条上的小徽标：当前生效的关键词数 */
export function KeywordCountBadge({ n, enabled }: { n: number; enabled: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1', !enabled && 'opacity-40')}>
      <RotateCcw className="size-3" />
      {enabled ? `${n} 个关键词生效` : '过滤已关闭'}
    </span>
  )
}
