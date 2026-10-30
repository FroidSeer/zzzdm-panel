import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ExternalLink,
  ImageOff,
  ShoppingBag,
  FileText,
  MessageSquare,
  Link2,
  Check,
  Send,
  Store,
  Ticket,
  Images,
  ChevronDown,
  Image as ImageIcon,
} from 'lucide-react'
import type { Post } from '../types'
import { linkKind, linkLabel } from '../types'
import { cn } from '../lib/utils'
import { Lightbox, type LightboxOrigin } from './Lightbox'

/** 下单链接按平台收敛：同一家店的第二条链接并进第一条，不再冒出两个「立即购买」 */
const HOSTS: [RegExp, string][] = [
  [/u\.jd\.com|item\.jd\.com|jd\.com|jd\.hk|3\.cn/, '京东'],
  [/taobao|tmall|tb\.cn/, '淘宝'],
  [/pinduoduo|yangkeduo/, '拼多多'],
  [/suning|vip\.com/, '苏宁'],
]

function hostLabel(url: string) {
  for (const [re, name] of HOSTS) if (re.test(url)) return name
  return '购买'
}

type Pill = { url: string; label: string; kind: ReturnType<typeof linkKind> }

function buildPills(post: Post): Pill[] {
  const seenUrl = new Set<string>()
  const seenHost = new Set<string>()
  const out: Pill[] = []
  // 主下单链接排在最前（服务端已经挑过短链），其余按原顺序
  const ordered = post.deal?.url
    ? [post.deal.url, ...post.links.filter((u) => u !== post.deal?.url)]
    : post.links
  for (const u of ordered) {
    if (!u || seenUrl.has(u)) continue
    const kind = linkKind(u)
    if (kind === 'buy') {
      const h = hostLabel(u)
      if (seenHost.has(h)) continue
      seenHost.add(h)
      out.push({ url: u, label: h, kind })
    } else {
      out.push({ url: u, label: linkLabel(u), kind })
    }
    seenUrl.add(u)
  }
  return out
}

function LinkPill({ pill }: { pill: Pill }) {
  const Icon =
    pill.kind === 'buy'
      ? ShoppingBag
      : pill.kind === 'post'
        ? MessageSquare
        : pill.kind === 'detail'
          ? FileText
          : Link2
  const buy = pill.kind === 'buy'
  return (
    <a
      href={pill.url}
      target="_blank"
      rel="noopener"
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition',
        buy
          ? 'border-brand/40 bg-brand/10 text-brand-ink hover:border-brand/70 hover:bg-brand/20'
          : 'border-line bg-ink-900 text-dim hover:border-ink-600 hover:text-fg',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{pill.label}</span>
      {buy ? null : <ExternalLink className="size-3 shrink-0 opacity-60" />}
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
  onToggle?: (id: number, on: boolean, shiftKey?: boolean) => void
  /** 已推送时间，有值说明这条推过了 */
  pushedAt?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const [lb, setLb] = useState<number | null>(null)
  const thumbs = useRef<(HTMLImageElement | null)[]>([])

  const photos = post.photos.slice(0, 4)
  const deal = post.deal
  const pills = useMemo(() => buildPills(post), [post])

  const firstLine = useMemo(() => {
    const t = post.text.trim()
    return (t.split('\n').find((l) => l.trim()) || `帖子 #${post.id}`).slice(0, 60)
  }, [post.text, post.id])

  // 服务端没解析出品名时（老数据 / 格式异常），退回正文首行，别让卡片开天窗
  const title = deal?.name && deal.name !== '（无标题）' ? deal.name : firstLine

  /** 实时测量缩略图位置：关闭时用它算回缩点，滚动过也不会落错 */
  const getOrigin = useCallback((i: number): LightboxOrigin | null => {
    const el = thumbs.current[i]
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (!r.width || r.bottom <= 0 || r.top >= window.innerHeight) return null
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }, [])

  const valueBits = deal?.good
    ? [
        { k: '值', v: deal.good, tone: 'good' as const },
        { k: '不值', v: deal.bad || '0', tone: 'bad' as const },
      ]
    : []

  return (
    <article
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === ' ' && onToggle) {
          e.preventDefault()
          onToggle(post.id, !checked, e.shiftKey)
        }
      }}
      className={cn(
        'fade-up group relative rounded-xl border bg-ink-800 p-3.5 outline-none transition hover:shadow-lg hover:shadow-black/5 focus-visible:ring-2 focus-visible:ring-brand-text dark:hover:shadow-black/20',
        checked
          ? 'border-brand/60 bg-brand/5 shadow-sm shadow-brand/10'
          : 'border-line hover:border-ink-600 hover:bg-ink-800/80',
        pushedAt && !checked && 'border-emerald-500/25',
      )}
    >
      <header className="mb-2.5 flex items-center gap-2">
        {onToggle && (
          <button
            type="button"
            role="checkbox"
            aria-checked={!!checked}
            aria-label={`选择帖子 #${post.id}`}
            onClick={(e) => onToggle(post.id, !checked, e.shiftKey)}
            title={checked ? '取消勾选（按住 Shift 可连选）' : '勾选这条（按住 Shift 可范围连选）'}
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded border transition',
              checked
                ? 'border-brand-strong bg-brand-strong text-white'
                : 'border-ink-600 bg-ink-900 text-transparent hover:border-brand/70',
            )}
          >
            <Check className="size-3.5" strokeWidth={3} />
          </button>
        )}
        <span className="tabular rounded-md bg-ink-700 px-2 py-0.5 text-xs text-dim">{post.time || '--:--'}</span>
        <a
          href={post.url}
          target="_blank"
          rel="noopener"
          className="rounded-md border border-line px-2 py-0.5 text-xs text-dim transition hover:border-ink-600 hover:text-fg"
        >
          #{post.id}
        </a>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {pushedAt && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300"
              title={`已于 ${pushedAt} 推送`}
            >
              <Send className="size-3" />
              已推送
            </span>
          )}
        </span>
      </header>

      {/* 主信息区：左图右文。价格是这张卡的第一眼落点，不再埋在正文里当普通文字 */}
      <div className="flex gap-3">
        {photos.length > 0 && !imgFailed && (
          <button
            type="button"
            onClick={() => setLb(0)}
            className="relative size-[88px] shrink-0 overflow-hidden rounded-lg border border-line bg-ink-900"
            title={photos.length > 1 ? `查看 ${photos.length} 张图` : '点击放大查看'}
          >
            {/* 图片没加载完时别留一个黑洞：垫一个占位图标，和「加载失败」区分开 */}
            <span className="pointer-events-none absolute inset-0 grid place-items-center text-dim">
              <ImageIcon className="size-4 opacity-45" />
            </span>
            <img
              ref={(el) => {
                thumbs.current[0] = el
              }}
              src={photos[0]}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="relative h-full w-full cursor-zoom-in object-cover transition duration-300 hover:scale-105"
            />
            {photos.length > 1 && (
              <span className="pointer-events-none absolute right-1 bottom-1 inline-flex items-center gap-0.5 rounded bg-black/65 px-1 py-0.5 text-[10px] leading-none text-white">
                <Images className="size-2.5" />
                {photos.length}
              </span>
            )}
          </button>
        )}
        {imgFailed && (
          <div className="flex size-[88px] shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-dim">
            <ImageOff className="size-5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* 用 h2 而不是 h3：页面大纲是 h1（面板标题）→ h2（每条帖子），
              中间没有 h2 会被无障碍检查判成「跳级标题」。 */}
          <h2 className="line-clamp-2 text-[15px] leading-snug font-semibold text-fg">{title}</h2>

          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {deal?.price ? (
              <>
                <span className="tabular text-brand-ink text-[26px] leading-none font-bold">
                  ¥{deal.price}
                </span>
                {deal.price_note && (
                  <span className="rounded border border-line bg-ink-900 px-1.5 py-0.5 text-[11px] text-dim">
                    {deal.price_note}
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-dim">没解析到价格，看原文</span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-dim">
            {deal?.shop && (
              <span className="inline-flex items-center gap-1">
                <Store className="size-3 shrink-0" />
                {deal.shop}
              </span>
            )}
            {valueBits.length > 0 && (
              <span className="inline-flex items-center gap-1.5" title="频道读者投票：觉得值 / 觉得不值">
                {valueBits.map((b) => (
                  <span
                    key={b.k}
                    className={cn(
                      'tabular inline-flex items-baseline gap-0.5',
                      b.tone === 'good' ? 'text-emerald-700 dark:text-emerald-400' : 'text-dim',
                    )}
                  >
                    {b.k}
                    <b className="font-semibold">{b.v}</b>
                  </span>
                ))}
              </span>
            )}
            {deal?.coupon && (
              <span className="inline-flex min-w-0 items-center gap-1" title={`领券：${deal.coupon}`}>
                <Ticket className="size-3 shrink-0" />
                <span className="truncate">{deal.coupon}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 一句「为什么值得买」，两行封顶；原文收进「查看原文」 */}
      {deal?.reason && (
        <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-fg/75">{deal.reason}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {pills.map((p) => (
          <LinkPill key={p.url} pill={p} />
        ))}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="ml-auto inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-dim transition hover:text-fg"
        >
          {expanded ? '收起原文' : '查看原文'}
          <ChevronDown className={cn('size-3.5 transition', expanded && 'rotate-180')} />
        </button>
      </div>

      {expanded && (
        <pre className="fade-in mt-2 max-h-72 overflow-auto rounded-lg bg-ink-950 p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-fg/80">
          {post.text}
        </pre>
      )}

      {lb !== null && (
        <Lightbox
          items={photos}
          index={lb}
          getOrigin={getOrigin}
          caption={title}
          onClose={() => setLb(null)}
          onIndex={setLb}
        />
      )}
    </article>
  )
}
