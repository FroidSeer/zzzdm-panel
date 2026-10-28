import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

type Toast = { id: number; msg: string; ok: boolean }
type Ctx = { show: (msg: string, ok?: boolean) => void }

const ToastCtx = createContext<Ctx>({ show: () => {} })

export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const show = useCallback((msg: string, ok = true) => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev.slice(-2), { id, msg, ok }])
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200)
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className="fade-up flex max-w-sm items-start gap-2.5 rounded-xl border border-line bg-ink-700/95 px-4 py-3 text-sm shadow-2xl backdrop-blur"
          >
            {t.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <span className="break-words">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
