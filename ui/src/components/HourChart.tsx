import { useMemo, useState } from 'react'

/**
 * 今日推送时段分布 —— 纯 SVG 柱状图。
 * 不依赖 echarts，避免把 700KB+ 的图表库打进产物。
 *
 * 配色走 CSS 变量，跟着白天/夜间主题自动切换。
 */
export function HourChart({ posts }: { posts: { id: number; time: string }[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const buckets = useMemo(() => {
    const b = new Array(24).fill(0) as number[]
    for (const p of posts) {
      const h = parseInt((p.time ?? '').slice(0, 2), 10)
      if (Number.isFinite(h) && h >= 0 && h < 24) b[h] += 1
    }
    return b
  }, [posts])

  const max = Math.max(1, ...buckets)
  const total = buckets.reduce((a, b) => a + b, 0)

  return (
    <div className="relative">
      <div className="flex h-24 items-end gap-[3px]">
        {buckets.map((v, h) => {
          const pct = (v / max) * 100
          const active = hover === h
          return (
            <div
              key={h}
              onMouseEnter={() => setHover(h)}
              onMouseLeave={() => setHover(null)}
              className="relative flex h-full flex-1 items-end"
            >
              <div
                className="w-full rounded-t-[3px] transition-all duration-300"
                style={{
                  height: v === 0 ? '2px' : `${Math.max(pct, 6)}%`,
                  background: active
                    ? 'linear-gradient(180deg,var(--color-brand-soft),var(--color-brand))'
                    : v === 0
                      ? 'var(--color-ink-600)'
                      : 'linear-gradient(180deg,color-mix(in oklab, var(--color-brand-soft) 85%, transparent),color-mix(in oklab, var(--color-brand) 22%, transparent))',
                }}
              />
              {active && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-md border border-line bg-ink-700 px-2 py-1 text-xs whitespace-nowrap text-fg shadow-lg">
                  {String(h).padStart(2, '0')}:00 · {v} 条
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="tabular mt-1.5 flex justify-between text-xs text-dim">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
      <div className="mt-1 text-right text-xs text-dim">共 {total} 条</div>
    </div>
  )
}
