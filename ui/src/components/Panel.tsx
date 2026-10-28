import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

export function Panel({ title, icon, children, className }: { title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-line bg-ink-800 p-4', className)}>
      <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

/** 一个「标签 + 控件」的字段块。
 * 默认用 <label> 包裹（点哪都能聚焦输入框）；`plain` 时改用 <div>——
 * 里面若有按钮 / 可滚动区域，label 会抢走点击并触发激活行为，必须换成 div。 */
export function Field({
  label,
  hint,
  children,
  plain,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  plain?: boolean
}) {
  const head = (
    <span className="mb-1.5 flex items-baseline justify-between text-xs text-dim">
      {label}
      {hint && <span className="text-[10px] text-dim/60">{hint}</span>}
    </span>
  )
  if (plain) {
    return (
      <div className="block">
        {head}
        {children}
      </div>
    )
  }
  return (
    <label className="block">
      {head}
      {children}
    </label>
  )
}

export const inputCls =
  'h-9 w-full rounded-lg border border-line bg-ink-950 px-3 text-sm text-fg outline-none transition placeholder:text-dim/50 focus:border-brand/70 focus:ring-2 focus:ring-brand/20'

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-ink-950 px-3 py-2 text-sm transition hover:border-ink-600"
    >
      <span className="flex min-w-0 flex-col items-start">
        <span className="text-fg/90">{label}</span>
        {hint && <span className="mt-0.5 text-[10.5px] text-dim/70">{hint}</span>}
      </span>
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 self-center rounded-full transition',
          checked ? 'brand-gradient' : 'bg-ink-600',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow transition-all',
            checked ? 'left-4.5' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}
