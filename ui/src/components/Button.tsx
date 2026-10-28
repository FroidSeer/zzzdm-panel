import type { ReactNode } from 'react'
import { cn } from '../lib/utils'
import { Loader2 } from 'lucide-react'

type Variant = 'secondary' | 'primary' | 'ghost'
type Size = 'sm' | 'md'

export function Button({
  children,
  onClick,
  disabled,
  loading,
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  variant?: Variant
  size?: Size
  className?: string
  type?: 'button' | 'submit'
  title?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition select-none',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        variant === 'primary' &&
          'brand-gradient border-transparent text-white shadow-lg shadow-brand/25 hover:brightness-110 active:brightness-95',
        variant === 'secondary' &&
          'border-line bg-ink-700 text-fg hover:border-ink-600 hover:bg-ink-600 active:bg-ink-600/80',
        variant === 'ghost' && 'border-transparent bg-transparent text-dim hover:bg-ink-700 hover:text-fg',
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}
