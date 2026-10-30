import { useMemo, useState } from 'react'
import {
  Baby,
  Sparkles,
  Mountain,
  Shirt,
  Coffee,
  Sofa,
  Smartphone,
  PawPrint,
  HeartPulse,
  Car,
  ChevronDown,
  Ban,
  Check,
  Minus,
  Eraser,
  Tag,
} from 'lucide-react'
import { cn } from '../lib/utils'
import {
  CATEGORIES,
  catWords,
  customWords,
  groupState,
  toggleWords,
  type Category,
  type Tri,
} from '../lib/catalog'

/** 每个大类的图标（Lucide 组件） */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  muying: Baby,
  beauty: Sparkles,
  outdoor: Mountain,
  fashion: Shirt,
  food: Coffee,
  home: Sofa,
  digital: Smartphone,
  pet: PawPrint,
  health: HeartPulse,
  auto: Car,
}

/** 三态勾选框：全选 / 部分 / 未选 */
function TriBox({ state }: { state: Tri }) {
  return (
    <span
      className={cn(
        'flex size-3.5 shrink-0 items-center justify-center rounded border transition',
        state === 'on' && 'border-brand bg-brand text-white',
        state === 'partial' && 'border-brand/70 bg-brand/15 text-brand',
        state === 'off' && 'border-ink-600 bg-ink-900 text-transparent',
      )}
    >
      {state === 'on' ? (
        <Check className="size-2.5" strokeWidth={3.5} />
      ) : state === 'partial' ? (
        <Minus className="size-2.5" strokeWidth={3.5} />
      ) : null}
    </span>
  )
}

/**
 * 排除大类导航栏。
 *
 * - 点大类 = 整组词一次性加入 / 移出排除列表（后端只认扁平 exclude 数组，
 *   大类只是「这组词是否都在 exclude 里」的派生视图，所以无需改服务端）。
 * - 选中某个大类后，下方展开它的小类，可以单独勾选排除。
 */
export function CategoryNav({
  exclude,
  enabled,
  onChange,
}: {
  exclude: string[]
  /** 关键词过滤总开关，关掉时给个提示条 */
  enabled: boolean
  onChange: (next: string[]) => void
}) {
  const [active, setActive] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const custom = useMemo(() => customWords(exclude), [exclude])
  const states = useMemo(() => {
    const m = new Map<string, Tri>()
    for (const c of CATEGORIES) m.set(c.id, groupState(catWords(c), exclude))
    return m
  }, [exclude])

  const onCount = [...states.values()].filter((s) => s === 'on').length
  const partCount = [...states.values()].filter((s) => s === 'partial').length

  const activeCat: Category | undefined = CATEGORIES.find((c) => c.id === active)

  const clickCat = (cat: Category) => {
    const words = catWords(cat)
    const cur = groupState(words, exclude)
    // 部分选中时点一下变成「全选」，再点一下取消，符合常见的三态 checkbox 直觉
    onChange(toggleWords(exclude, words, cur !== 'on'))
    setActive(cat.id)
    setOpen(true)
  }

  const clickSub = (words: string[]) => {
    const cur = groupState(words, exclude)
    onChange(toggleWords(exclude, words, cur !== 'on'))
  }

  const clearCatalog = () => {
    const drop = new Set(CATEGORIES.flatMap(catWords))
    onChange(exclude.filter((w) => !drop.has(w)))
  }

  return (
    <nav className="border-t border-line/70">
      <div className="mx-auto flex max-w-[1400px] items-center gap-1.5 overflow-x-auto px-5 py-2">
        <span className="mr-1 hidden shrink-0 items-center gap-1 text-xs text-dim sm:inline-flex">
          <Ban className="size-3.5" />
          排除大类
        </span>

        {CATEGORIES.map((cat) => {
          const Icon = ICONS[cat.id] ?? Tag
          const st = states.get(cat.id) ?? 'off'
          const isActive = active === cat.id && open
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => clickCat(cat)}
              title={`${cat.desc}\n点一下整组排除（${catWords(cat).length} 个词）`}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition',
                st === 'on' && 'border-brand/55 bg-brand/12 text-brand',
                st === 'partial' && 'border-brand/30 bg-brand/5 text-fg/85',
                st === 'off' && 'border-line bg-ink-800 text-dim hover:border-ink-600 hover:text-fg',
                isActive && 'ring-2 ring-brand/25',
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              {cat.name}
              {st === 'on' ? <Check className="size-3 shrink-0" strokeWidth={3} /> : null}
              {st === 'partial' ? <Minus className="size-3 shrink-0" strokeWidth={3} /> : null}
            </button>
          )
        })}

        <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
          <span className="tabular hidden text-xs text-dim md:inline">
            {onCount > 0 ? `${onCount} 类全选` : ''}
            {partCount > 0 ? `${onCount > 0 ? ' · ' : ''}${partCount} 类部分` : ''}
            {custom.length > 0 ? ` · 自定义 ${custom.length}` : ''}
          </span>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              if (!open && !active) setActive(CATEGORIES[0]?.id ?? null)
              setOpen((v) => !v)
            }}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition',
              open
                ? 'border-ink-600 bg-ink-700 text-fg'
                : 'border-line bg-ink-800 text-dim hover:border-ink-600 hover:text-fg',
            )}
            title="展开小类，单独排除某几项"
          >
            细分小类
            <ChevronDown className={cn('size-3.5 transition', open && 'rotate-180')} />
          </button>
        </div>
      </div>

      {open && (
        <div className="fade-in mx-auto max-w-[1400px] px-5 pb-3">
          <div className="rounded-xl border border-line bg-ink-800/70 p-3">
            {!enabled && (
              <p className="mb-2 rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-600 dark:text-red-300">
                「启用关键词过滤」当前是关的，下面的勾选不会生效
              </p>
            )}

            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-dim">大类：</span>
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActive(c.id)}
                  className={cn(
                    'rounded-md px-2 py-1 text-xs transition',
                    active === c.id
                      ? 'bg-brand/15 text-brand'
                      : 'text-dim hover:bg-ink-700 hover:text-fg',
                  )}
                >
                  {c.name}
                </button>
              ))}
              <button
                type="button"
                onClick={clearCatalog}
                disabled={onCount === 0 && partCount === 0}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-dim transition hover:border-red-500/40 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"
                title="把目录里的所有词都移出排除列表（自定义关键词保留）"
              >
                <Eraser className="size-3" />
                清空大类勾选
              </button>
            </div>

            {activeCat ? (
              <>
                <p className="mb-2 text-xs text-dim">
                  {activeCat.name} · {activeCat.desc} · 共 {activeCat.subs.length} 个小类，点小类可单独排除
                </p>
                <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto thin-scroll">
                  {activeCat.subs.map((sub) => {
                    const st = groupState(sub.words, exclude)
                    return (
                      <button
                        key={sub.name}
                        type="button"
                        onClick={() => clickSub(sub.words)}
                        title={sub.words.join('、')}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition',
                          st === 'on' && 'border-brand/55 bg-brand/12 text-brand',
                          st === 'partial' && 'border-brand/30 bg-brand/5 text-fg/85',
                          st === 'off' &&
                            'border-line bg-ink-900 text-dim hover:border-ink-600 hover:text-fg',
                        )}
                      >
                        <TriBox state={st} />
                        {sub.name}
                        <span className="tabular text-xs text-dim">{sub.words.length}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="py-2 text-xs text-dim">点上面任一大类，查看它里面的小类</p>
            )}

            {custom.length > 0 && (
              <p className="mt-2 border-t border-line pt-2 text-xs text-dim">
                另有 {custom.length} 个自定义关键词不在大类目录里：
                <span className="text-fg">{custom.slice(0, 8).join('、')}</span>
                {custom.length > 8 ? ' …' : ''}
              </p>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
