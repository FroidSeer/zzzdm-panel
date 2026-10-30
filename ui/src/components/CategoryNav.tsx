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

/** 三态勾选框：已排除 / 部分排除 / 没排除。
 * 用红色而不是品牌橙：橙在这个产品里表示「主操作、选中」，而这里表达的是「被过滤掉」。 */
function TriBox({ state }: { state: Tri }) {
  return (
    <span
      className={cn(
        'flex size-3.5 shrink-0 items-center justify-center rounded border transition',
        state === 'on' && 'border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500',
        state === 'partial' && 'border-red-500/60 bg-red-500/15 text-red-700 dark:text-red-300',
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
    // 部分选中时点一下变成「全排除」，再点一下取消，符合常见的三态 checkbox 直觉。
    // 只切过滤状态，不顺手把下面那个大抽屉推开——之前一次点击干两件事，
    // 列表被顶下去半屏，用户找不到自己刚做了什么。
    onChange(toggleWords(exclude, words, cur !== 'on'))
    setActive(cat.id)
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
      {/*
       * 三段式：左标签（窄屏隐藏）｜中间可横向滚动的品类 chip｜右侧固定区。
       * 「细分小类」是打开抽屉的唯一入口，必须永远在视口内 —— 之前它跟在 chip 流末尾，
       * 窗口一窄就被推到 scrollWidth 外面（1000px 下 x=1106），用户找不到也就打不开抽屉。
       */}
      <div className="mx-auto flex max-w-[1400px] items-center gap-1.5 px-5 py-2">
        <span className="mr-1 hidden shrink-0 items-center gap-1 text-xs text-dim sm:inline-flex">
          <Ban className="size-3.5" />
          排除大类
        </span>

        {/* 可横向滚动区：滚动条收细 + 右内阴影，暗示「右边还有」 */}
        <div className="min-w-0 flex-1 overflow-x-auto shadow-[inset_-14px_0_14px_-14px_rgba(16,24,40,0.28)]">
          <div className="flex items-center gap-1.5 pe-3">
            {CATEGORIES.map((cat) => {
              const Icon = ICONS[cat.id] ?? Tag
              const st = states.get(cat.id) ?? 'off'
              const isActive = active === cat.id && open
              const off = st === 'off'
              return (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={st !== 'off'}
                  onClick={() => clickCat(cat)}
                  title={
                    off
                      ? `${cat.desc}\n点一下把整类的 ${catWords(cat).length} 个词加进排除列表`
                      : `${cat.desc}\n已排除${st === 'partial' ? '部分小类' : '整类'}，点一下全部放回`
                  }
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition',
                    off && 'border-line bg-ink-800 text-dim hover:border-ink-600 hover:text-fg',
                    st === 'on' &&
                      'border-red-500/50 bg-red-500/12 text-red-700 hover:border-red-500/70 dark:text-red-300',
                    st === 'partial' &&
                      'border-red-500/30 bg-red-500/5 text-red-700/85 dark:text-red-300/85',
                    isActive && 'ring-2 ring-ink-600',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className={cn(st === 'on' && 'line-through decoration-red-500/60')}>
                    {cat.name}
                  </span>
                  {st === 'on' ? <Ban className="size-3 shrink-0" strokeWidth={2.5} /> : null}
                  {st === 'partial' ? <Minus className="size-3 shrink-0" strokeWidth={3} /> : null}
                </button>
              )
            })}
          </div>
        </div>

        {/* 固定区：不参与滚动，任何宽度都在视口内 */}
        <div className="flex shrink-0 items-center gap-1.5 border-l border-line pl-2">
          <span className="tabular hidden text-xs text-dim xl:inline">
            {onCount + partCount > 0
              ? `已排除 ${onCount > 0 ? `${onCount} 类` : ''}${onCount > 0 && partCount > 0 ? ' · ' : ''}${
                  partCount > 0 ? `${partCount} 类部分` : ''
                }`
              : '未排除任何类'}
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
              'inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs whitespace-nowrap transition',
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
                      ? 'bg-brand/12 text-brand-ink'
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
                          st === 'on' &&
                            'border-red-500/50 bg-red-500/12 text-red-700 hover:border-red-500/70 dark:text-red-300',
                          st === 'partial' &&
                            'border-red-500/30 bg-red-500/5 text-red-700/85 dark:text-red-300/85',
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
