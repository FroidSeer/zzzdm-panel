import { useCallback, useMemo, useRef, useState } from 'react'
import { ExternalLink, ImageOff, ShoppingBag, FileText, MessageSquare, Link2, Check, Send } from 'lucide-react'
import type { Post } from '../types'
import { linkKind, linkLabel } from '../types'
import { cn } from '../lib/utils'
import { Lightbox, type LightboxOrigin } from './Lightbox'

function LinkPill({ url }: { url: string }) {
  const kind = linkKind(url)
  const Icon =
    kind === 'buy' ? ShoppingBag : kind === 'post' ? MessageSquare : kind === 'detail' ? FileText : Link2
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition',
        kind === 'buy' &&
          'border-brand/30 bg-brand/10 text-brand hover:border-brand/60 hover:bg-brand/20',
        kind !== 'buy' &&
          'border-sky-500/30 bg-sky-500/8 text-sky-700 hover:border-sky-500/60 hover:bg-sky-500/15 dark:border-sky-400/25 dark:bg-sky-400/8 dark:text-sky-300 dark:hover:border-sky-400/50 dark:hover:bg-sky-400/15',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{linkLabel(url)}</span>
      <ExternalLink className="size-3 shrink-0 opacity-60" />
    </a>
  )
}

export function PostCard({
  post,
  checked,
  onToggle,
  pushedAt,
}: {
  post: Post
  checked?: boolean
  onToggle?: (id: number, on: boolean) => void
  /** 已推送时间，有值说明这条推过了 */
  pushedAt?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const [lb, setLb] = useState<number | null>(null)
  const thumbs = useRef<(HTMLImageElement | null)[]>([])

  const gallery = post.photos.slice(0, 4)

  /** 实时测量缩略图位置：关闭时用它算回缩点，滚动过也不会落错 */
  const getOrigin = useCallback((i: number): LightboxOrigin | null => {
    const el = thumbs.current[i]
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (!r.width || r.bottom <= 0 || r.top >= window.innerHeight) return null
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }, [])

  const { short, long } = useMemo(() => {
    const t = post.text.trim()
    return { short: t.slice(0, 220), long: t.length > 220 }
  }, [post.text])

  return (
    <article
      className={cn(
        'fade-up group relative rounded-xl border bg-ink-800 p-4 transition hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20',
        checked
          ? 'border-brand/60 bg-brand/5 shadow-sm shadow-brand/10'
          : 'border-line hover:border-ink-600 hover:bg-ink-800/80',
        pushedAt && !checked && 'border-emerald-500/25',
      )}
    >
      <header className="mb-2 flex items-center gap-2">
        {onToggle && (
          <button
            type="button"
            onClick={() => onToggle(post.id, !checked)}
            title={checked ? '取消勾选' : '勾选这条，只推送选中的'}
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded border transition',
              checked
                ? 'border-brand bg-brand text-white'
                : 'border-ink-600 bg-ink-900 text-transparent hover:border-brand/70',
            )}
          >
            <Check className="size-3" strokeWidth={3} />
          </button>
        )}
        <span className="tabular rounded-md bg-ink-700 px-2 py-0.5 text-xs text-dim">{post.time || '--:--'}</span>
        <a
          href={post.url}
          target="_blank"
          rel="noopener"
          className="rounded-md border border-line px-2 py-0.5 text-[11px] text-dim transition hover:border-ink-600 hover:text-fg"
        >
          #{post.id}
        </a>
        <span className="ml-auto flex items-center gap-1.5">
          {pushedAt && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300"
              title={`已于 ${pushedAt} 推送`}
            >
              <Send className="size-3" />
              已推送
            </span>
          )}
          <span className="text-[11px] text-dim/70 opacity-0 transition group-hover:opacity-100">{post.time}</span>
        </span>
      </header>

      <p className="mb-3 text-sm leading-relaxed whitespace-pre-wrap break-words text-fg/90">
        {expanded ? post.text : short}
        {long && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-1 text-xs text-brand hover:underline"
          >
            {expanded ? '收起' : '展开'}
          </button>
        )}
      </p>

      {post.photos.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {gallery.map((src, i) =>
            imgFailed ? null : (
              <button
                key={src}
                onClick={() => setLb(i)}
                className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-ink-900"
                title="点击放大查看"
              >
                <img
                  ref={(el) => {
                    thumbs.current[i] = el
                  }}
                  src={src}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="h-full w-full cursor-zoom-in object-cover transition duration-300 hover:scale-110"
                />
              </button>
            ),
          )}
          {imgFailed && (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-dim">
              <ImageOff className="size-5" />
            </div>
          )}
        </div>
      )}

      {post.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {post.links.map((u) => (
            <LinkPill key={u} url={u} />
          ))}
        </div>
      )}

      {lb !== null && (
        <Lightbox
          items={gallery}
          index={lb}
          getOrigin={getOrigin}
          caption={post.text.slice(0, 80)}
          onClose={() => setLb(null)}
          onIndex={setLb}
        />
      )}
    </article>
  )
}
