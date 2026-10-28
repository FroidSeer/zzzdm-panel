import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '../lib/utils'

/** 打开：快进慢出（像从缩略图「弹」出来） */
const OPEN_MS = 420
const OPEN_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** 关闭：慢进慢出（对称，起步轻、落点稳，不会一头栽下去） */
const CLOSE_MS = 360
const CLOSE_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'
/** 遮罩与图片的淡出：比位移稍晚一点起步，视觉上是「先走再化开」 */
const FADE_MS = 300

export interface LightboxOrigin {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 居中放大看图层：点击缩略图后从原位置动画放大到屏幕中央，不新开网页。
 * 关闭时反向缩回缩略图（位置在关闭那一刻实时测量，滚动过也不会落错），
 * 位移、遮罩、UI 一起同步淡出，不会突然消失。
 */
export function Lightbox({
  items,
  index,
  getOrigin,
  caption,
  onClose,
  onIndex,
}: {
  items: string[]
  index: number
  /** 实时取缩略图位置；返回 null 表示不在视口内 → 退化为原地缩小淡出 */
  getOrigin: (i: number) => LightboxOrigin | null
  caption?: string
  onClose: () => void
  onIndex: (i: number) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const frames = useRef<number[]>([])
  const closingRef = useRef(false)
  const doneRef = useRef(false)

  const [tf, setTf] = useState('scale(0.94)')
  const [closing, setClosing] = useState(false)
  const [live, setLive] = useState(false) // 首帧之后才开启过渡
  const [zoomed, setZoomed] = useState(false)
  const [error, setError] = useState(false)

  const src = items[index]
  const multi = items.length > 1

  /** 计算「缩略图位置」→「居中最终位置」的 FLIP 变换 */
  const flip = useCallback((from: LightboxOrigin | null) => {
    const el = boxRef.current
    if (!el || !from) return 'scale(0.94)'
    const t = el.getBoundingClientRect()
    if (!t.width || !t.height) return 'scale(0.94)'
    // 等比缩放（取 cover 倍率，和缩略图 object-cover 的观感一致，不会拉伸变形）
    const s = Math.max(from.width / t.width, from.height / t.height)
    const dx = from.left + from.width / 2 - (t.left + t.width / 2)
    const dy = from.top + from.height / 2 - (t.top + t.height / 2)
    return `translate(${dx}px, ${dy}px) scale(${s})`
  }, [])

  // 打开 / 切换图片：先摆到起点，下一帧回到原位触发动画
  useLayoutEffect(() => {
    setLive(false)
    setZoomed(false)
    setError(false)
    setTf(flip(getOrigin(index)))
    frames.current.push(
      requestAnimationFrame(() => {
        frames.current.push(
          requestAnimationFrame(() => {
            setLive(true)
            setTf('translate(0px, 0px) scale(1)')
          }),
        )
      }),
    )
    return () => {
      frames.current.forEach(cancelAnimationFrame)
      frames.current = []
    }
  }, [index, src, getOrigin, flip])

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    onClose()
  }, [onClose])

  // 关闭：等地位移真的跑完（transitionend）再卸载，兜底定时器防漏
  useEffect(() => {
    if (!closing) return
    const el = boxRef.current
    let hit = false
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName === 'transform' && e.target === el) {
        hit = true
        finish()
      }
    }
    el?.addEventListener('transitionend', onEnd)
    const timer = window.setTimeout(() => {
      hit = true
      finish()
    }, CLOSE_MS + FADE_MS - 60)
    return () => {
      el?.removeEventListener('transitionend', onEnd)
      window.clearTimeout(timer)
    }
  }, [closing, finish])

  const close = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setZoomed(false)
    const target = getOrigin(index) // 实时测量：滚动过也能缩回正确位置
    frames.current.push(
      requestAnimationFrame(() => {
        frames.current.push(
          requestAnimationFrame(() => {
            setClosing(true)
            setTf(flip(target))
          }),
        )
      }),
    )
  }, [flip, getOrigin, index])

  // 键盘：Esc 关闭，←→ 切换
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (multi && e.key === 'ArrowRight') {
        onIndex((index + 1) % items.length)
      } else if (multi && e.key === 'ArrowLeft') {
        onIndex((index - 1 + items.length) % items.length)
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [close, multi, index, items.length, onIndex])

  const style: React.CSSProperties = {
    transform: zoomed && !closing ? 'scale(2)' : tf,
    opacity: closing ? 0 : 1,
    borderRadius: closing ? '0.5rem' : '0.75rem',
    transition: closing
      ? [
          `transform ${CLOSE_MS}ms ${CLOSE_EASE}`,
          `opacity ${FADE_MS}ms ease-in ${Math.round(CLOSE_MS * 0.45)}ms`,
          `border-radius ${CLOSE_MS}ms ${CLOSE_EASE}`,
        ].join(', ')
      : live
        ? `transform ${OPEN_MS}ms ${OPEN_EASE}`
        : 'none',
    transformOrigin: 'center center',
    cursor: zoomed ? 'zoom-out' : 'zoom-in',
    willChange: 'transform, opacity',
  }

  const chrome = cn(
    'z-10 transition-opacity duration-150 ease-out',
    closing ? 'pointer-events-none opacity-0' : 'opacity-100',
  )

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      onClick={close}
    >
      {/* 背景遮罩：跟着一起淡出，不再「啪」地消失 */}
      <div
        className={cn(
          'absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity',
          closing ? 'opacity-0 duration-[300ms] ease-in' : 'fade-in opacity-100',
        )}
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          close()
        }}
        className={cn(
          chrome,
          'absolute top-4 right-4 flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/80 transition-[opacity,background-color,color] duration-150 hover:bg-black/70 hover:text-white',
        )}
        title="关闭 (Esc)"
      >
        <X className="size-4" />
      </button>

      {multi && (
        <div
          className={cn(
            chrome,
            'tabular absolute top-5 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs text-white/80',
          )}
        >
          {index + 1} / {items.length}
        </div>
      )}

      {multi && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onIndex((index - 1 + items.length) % items.length)
            }}
            className={cn(
              chrome,
              'absolute left-3 flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/80 transition-[opacity,background-color,color] duration-150 hover:bg-black/70 hover:text-white sm:left-6',
            )}
            title="上一张 (←)"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onIndex((index + 1) % items.length)
            }}
            className={cn(
              chrome,
              'absolute right-3 flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/80 transition-[opacity,background-color,color] duration-150 hover:bg-black/70 hover:text-white sm:right-6',
            )}
            title="下一张 (→)"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}

      {/* 图片本体：从缩略图位置放大到屏幕中央 */}
      <div
        className="relative z-[5] max-h-[86vh] max-w-[92vw]"
        style={{ overflow: zoomed && !closing ? 'auto' : 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={boxRef} style={style} onClick={() => !closing && setZoomed((v) => !v)}>
          {error ? (
            <div className="flex h-64 w-64 items-center justify-center rounded-xl bg-ink-800 text-sm text-dim">
              图片加载失败
            </div>
          ) : (
            <img
              src={src}
              alt={caption ?? ''}
              referrerPolicy="no-referrer"
              onError={() => setError(true)}
              className="block max-h-[86vh] max-w-[92vw] object-contain"
              draggable={false}
            />
          )}
        </div>
      </div>

      {/* 底部：说明 + 操作提示 */}
      <div
        className={cn(
          chrome,
          'pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 px-4 text-center',
        )}
      >
        {caption && <p className="line-clamp-2 max-w-[80vw] text-xs text-white/70">{caption}</p>}
        <p className="mt-1 flex items-center justify-center gap-1 text-[10.5px] text-white/40">
          {zoomed ? <ZoomOut className="size-3" /> : <ZoomIn className="size-3" />}
          点击图片{zoomed ? '还原' : '放大'} · Esc 关闭{multi ? ' · ←→ 切换' : ''}
        </p>
      </div>
    </div>,
    document.body,
  )
}
