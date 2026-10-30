import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertTriangle } from 'lucide-react'

export type ConfirmOptions = {
  title: string
  body: ReactNode
  confirmText?: string
  cancelText?: string
  /** 破坏性操作：确认按钮用红色，且默认焦点落在「取消」上 */
  danger?: boolean
}

type Pending = { opts: ConfirmOptions; resolve: (v: boolean) => void }

const Ctx = createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false)

/** 用法：`const confirm = useConfirm()`，然后 `if (!(await confirm({...}))) return` */
export function useConfirm() {
  return useContext(Ctx)
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ opts, resolve })
      }),
    [],
  )

  const settle = useCallback((v: boolean) => {
    setPending((p) => {
      p?.resolve(v)
      return null
    })
  }, [])

  // 焦点默认落在「取消」：误按回车不会直接执行破坏性操作
  useEffect(() => {
    if (pending) cancelRef.current?.focus()
  }, [pending])

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        settle(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pending, settle])

  const value = useMemo(() => confirm, [confirm])

  return (
    <Ctx.Provider value={value}>
      {children}
      {pending && (
        <div
          className="fade-in fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) settle(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-body"
            className="fade-up w-full max-w-md rounded-2xl border border-line bg-ink-800 p-5 shadow-2xl"
          >
            <div className="mb-3 flex items-start gap-3">
              {pending.opts.danger && (
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-red-500/30 bg-red-500/10">
                  <AlertTriangle className="size-4 text-red-600 dark:text-red-400" />
                </span>
              )}
              <div className="min-w-0">
                <h2 id="confirm-title" className="text-base font-semibold text-fg">
                  {pending.opts.title}
                </h2>
                <div id="confirm-body" className="mt-1.5 text-sm leading-relaxed text-dim">
                  {pending.opts.body}
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => settle(false)}
                className="h-9 rounded-lg border border-line bg-ink-950 px-4 text-sm text-fg transition hover:border-ink-600 focus-visible:ring-2 focus-visible:ring-brand-text focus-visible:outline-none"
              >
                {pending.opts.cancelText ?? '取消'}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={
                  pending.opts.danger
                    ? 'h-9 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-500 focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:outline-none'
                    : 'brand-gradient h-9 rounded-lg px-4 text-sm font-medium text-white transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand-text focus-visible:outline-none'
                }
              >
                {pending.opts.confirmText ?? '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
