import { useEffect, useMemo, useRef, useState } from 'react'
import { Ban, ChevronUp, EyeOff, RotateCcw, Search, Undo2 } from 'lucide-react'
import type { Post } from '../types'
import { cn } from '../lib/utils'

/**
 * 被关键词排除掉的商品：默认只是一条贴底的细条，点开才是完整列表。
 * 放在不显眼处，避免干扰主信息流，但保留可追溯入口。
 * openTick 变化时（例如点了顶部「关键词已过滤」卡片）自动展开并滚动到此处。
 *
 * 每条右上角命中的关键词是按钮：点一下就把该词从排除列表里删掉，
 * 这条（以及所有只被它挡住的帖子）立刻回到主列表。
 */
export function ExcludedDrawer({
  posts,
  keywords,
  openTick = 0,
  onUnban,
}: {
  posts: Post[]
  keywords: string[]
  openTick?: number
  onUnban: (word: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openTick) return
    setOpen(true)
    const id = window.setTimeout(
      () => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      60,
    )
    return () => window.clearTimeout(id)
  }, [openTick])

  /** 命中了哪些关键词 —— 与服务端 apply_filter 的判定保持一致（两侧都转小写） */
  const hitOf = (text: string) => {
    const low = text.toLowerCase()
    return keywords.filter((k) => k && low.includes(k.trim().toLowerCase())).slice(0, 4)
  }

  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    const arr = k ? posts.filter((p) => p.text.toLowerCase().includes(k)) : posts
    return arr.slice().reverse()
  }, [posts, q])

  return (
    <div className="mt-4" ref={rootRef}>
      {/* 收起态：一条不显眼的底栏 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border border-dashed border-line/70 bg-ink-800/40 px-3 py-2 text-[11.5px] text-dim/70 transition',
          'hover:border-line hover:bg-ink-800/70 hover:text-dim',
        )}
      >
        <EyeOff className="size-3.5 shrink-0" />
        <span>
          已排除 <span className="tabular text-dim">{posts.length}</span> 条
          {posts.length > 0 && <span className="text-dim/50">（关键词命中，不推送）</span>}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10.5px] text-dim/50">
          {open ? '收起' : '查看'}
          <ChevronUp className={cn('size-3.5 transition', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="fade-up mt-2 rounded-xl border border-line bg-ink-800/60 p-3">
          {posts.length === 0 ? (
            <p className="py-6 text-center text-[11.5px] text-dim/60">
              没有被排除的商品（关键词未命中任何帖子）
            </p>
          ) : (
            <>
              {posts.length > 6 && (
                <div className="relative mb-2.5">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-dim/60" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={`在 ${posts.length} 条里搜索`}
                    className="h-8 w-full rounded-md border border-line bg-ink-950 pr-2.5 pl-8 text-xs text-fg outline-none placeholder:text-dim/50 focus:border-brand/70"
                  />
                </div>
              )}

              <div className="max-h-80 space-y-2 overflow-y-auto pr-0.5">
                {list.map((p) => {
                  const hits = hitOf(p.text)
                  return (
                    <article
                      key={p.id}
                      className="rounded-lg border border-line/70 bg-ink-900/60 p-2.5"
                    >
                      <header className="mb-1.5 flex items-center gap-2">
                        <span className="tabular rounded bg-ink-700 px-1.5 py-0.5 text-[10.5px] text-dim">
                          {p.time || '--:--'}
                        </span>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener"
                          className="text-[10.5px] text-dim/70 underline-offset-2 hover:text-fg hover:underline"
                        >
                          #{p.id}
                        </a>
                        <div className="ml-auto flex flex-wrap justify-end gap-1">
                          {hits.map((h) => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => onUnban(h)}
                              title={`取消排除「${h}」，点一下这个词就从排除列表移除`}
                              className={cn(
                                'group inline-flex items-center gap-1 rounded border border-red-500/25 bg-red-500/12 px-1.5 py-0.5 text-[10px] text-red-600 dark:text-red-300/90 transition',
                                'hover:border-emerald-500/50 hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-300',
                                'active:scale-95',
                              )}
                            >
                              <Ban className="size-2.5 group-hover:hidden" />
                              <Undo2 className="hidden size-2.5 group-hover:block" />
                              {h}
                            </button>
                          ))}
                          {!hits.length && (
                            <span className="text-[10px] text-dim/50">（命中的词已不在列表里）</span>
                          )}
                        </div>
                      </header>
                      <p className="line-clamp-3 text-[12px] leading-relaxed break-words text-fg/70">
                        {p.text}
                      </p>
                    </article>
                  )
                })}
                {!list.length && (
                  <p className="py-6 text-center text-[11.5px] text-dim/60">
                    没有匹配「{q}」的已排除商品
                  </p>
                )}
              </div>

              <p className="mt-2 flex items-center gap-1.5 border-t border-line/60 pt-2 text-[10.5px] text-dim/50">
                <RotateCcw className="size-3" />
                点条目右上角的红色词条，即可把该关键词从排除列表移除并重新过滤
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
