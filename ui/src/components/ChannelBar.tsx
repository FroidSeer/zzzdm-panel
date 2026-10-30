import { useEffect, useRef, useState } from 'react'
import {
  BellRing,
  Building2,
  ChevronDown,
  FlaskConical,
  MessageSquare,
  Radio,
  Server,
} from 'lucide-react'
import type { ChannelName, Config } from '../types'
import { cn } from '../lib/utils'
import { Button } from './Button'
import { Field, inputCls, SwitchPill } from './Panel'

/**
 * 通道元信息。
 * `tile` 是启用后图标块的底色 —— 用通道自己的色相浅染，
 * 关掉时退回中性灰，一眼就能看出哪几个是活的。
 */
const META: Record<ChannelName, { icon: typeof Radio; name: string; desc: string; tile: string }> = {
  wecom: {
    icon: Building2,
    name: '企业微信',
    desc: '群机器人 · 图文合成一张卡片',
    tile: 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300',
  },
  serverchan: {
    icon: Server,
    name: 'Server酱',
    desc: '微信服务号 · markdown 图文',
    tile: 'bg-sky-500/12 text-sky-700 dark:bg-sky-400/12 dark:text-sky-300',
  },
  pushplus: {
    icon: BellRing,
    name: 'PushPlus',
    desc: '微信推送 · markdown 图文',
    tile: 'bg-amber-500/14 text-amber-800 dark:bg-amber-400/12 dark:text-amber-300',
  },
  mp: {
    icon: MessageSquare,
    name: '公众号',
    desc: '模板消息 · 纯文字（可放测试号）',
    tile: 'bg-violet-500/12 text-violet-700 dark:bg-violet-400/12 dark:text-violet-300',
  },
}

const ORDER: ChannelName[] = ['wecom', 'serverchan', 'pushplus', 'mp']

/** 公众号模板字段的标签（微信要求 first/keywordN/remark 这几段） */
const MP_FIELDS: { k: string; label: string; hint: string }[] = [
  { k: 'first', label: 'first 抬头', hint: '第一行大字' },
  { k: 'keyword1', label: 'keyword1', hint: '模板第一项' },
  { k: 'keyword2', label: 'keyword2', hint: '模板第二项' },
  { k: 'remark', label: 'remark 备注', hint: '最后一行' },
]

const PLACEHOLDERS = '{head} {name} {price} {shop} {price_note} {coupon} {value} {url}'

export function ChannelBar({
  cfg,
  onChange,
  onTest,
  testing,
}: {
  cfg: Config
  onChange: (patch: Partial<Config>) => void
  onTest: (name: ChannelName) => void
  testing: ChannelName | ''
}) {
  const [open, setOpen] = useState(false)
  const [expand, setExpand] = useState<ChannelName | ''>('')
  const box = useRef<HTMLDivElement>(null)

  // 点到外面或按 Esc 就收起
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const ch = cfg.channels
  const active = ORDER.filter((n) => ch?.[n]?.enabled)

  // 触发器上直接写清楚「推到哪」，不再只给一个含义不明的数字
  const label =
    active.length === 0
      ? '未启用通道'
      : active.length === 1
        ? META[active[0]].name
        : `${META[active[0]].name} +${active.length - 1}`
  const activeNames = active.map((n) => META[n].name).join('、')

  /** 改某个通道的配置：只替换那个通道的对象，其余原样带过去 */
  const setChan = (name: ChannelName, patch: Record<string, unknown>) => {
    if (!ch) return
    onChange({ channels: { ...ch, [name]: { ...ch[name], ...patch } } as Config['channels'] })
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`推送通道：${activeNames || '未启用'}`}
        title={active.length ? `推送到：${activeNames}` : '还没有启用任何推送通道'}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-lg border pr-2 pl-2.5 text-sm transition',
          open
            ? 'border-brand/50 bg-brand/8 ring-2 ring-brand/15'
            : 'border-line bg-ink-700 hover:border-ink-600 hover:bg-ink-600',
        )}
      >
        <Radio
          className={cn('size-4 shrink-0 transition-colors', active.length ? 'text-brand-text' : 'text-dim')}
        />
        {/* 窄屏也写通道名：只留一个数字就成了「通道 1」那种谁也看不懂的状态 */}
        <span
          className={cn(
            'max-w-[6.5rem] truncate text-sm',
            active.length ? 'text-fg' : 'text-dim',
          )}
        >
          {label}
        </span>
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-dim transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="fade-up absolute top-12 left-0 z-50 w-[392px] max-w-[calc(100vw-2.5rem)] origin-top-left overflow-hidden rounded-xl border border-line bg-ink-800 shadow-[0_18px_44px_-16px_rgba(16,24,40,0.28),0_2px_8px_-2px_rgba(16,24,40,0.06)] sm:left-auto sm:right-0 sm:origin-top-right dark:shadow-[0_18px_44px_-16px_rgba(0,0,0,0.72),0_2px_8px_-2px_rgba(0,0,0,0.4)]">
          <div className="flex items-baseline justify-between gap-2 border-b border-line/70 px-3.5 pt-3 pb-2.5">
            <span className="text-[13px] font-semibold text-fg">推送通道</span>
            <span className="text-xs text-dim">
              {active.length ? `已启用 ${active.length} / ${ORDER.length}` : '都还没启用'}
            </span>
          </div>

          <div className="thin-scroll max-h-[70vh] overflow-y-auto p-1.5">
            {ORDER.map((name) => {
              const meta = META[name]
              const conf = ch?.[name]
              const on = !!conf?.enabled
              const Icon = meta.icon
              const isOpen = expand === name
              const toggle = () => setExpand(isOpen ? '' : name)
              return (
                <div
                  key={name}
                  className={cn(
                    'rounded-lg transition-colors',
                    on ? 'bg-brand/8 ring-1 ring-brand/10 ring-inset' : 'hover:bg-ink-900',
                  )}
                >
                  <div className="flex items-center gap-3 px-2 py-2">
                    <span
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-[10px] transition-colors',
                        on ? meta.tile : 'bg-ink-700 text-dim',
                      )}
                    >
                      <Icon className="size-[18px]" strokeWidth={1.9} />
                    </span>

                    <button
                      type="button"
                      onClick={toggle}
                      aria-expanded={isOpen}
                      className="group flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-fg">
                          {meta.name}
                        </span>
                        <span className="block truncate text-[11.5px] leading-snug text-dim">
                          {meta.desc}
                        </span>
                      </span>
                      <ChevronDown
                        className={cn(
                          'size-3.5 shrink-0 text-dim transition-transform group-hover:text-fg',
                          isOpen && 'rotate-180',
                        )}
                      />
                    </button>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${on ? '停用' : '启用'}${meta.name}`}
                      onClick={() => setChan(name, { enabled: !on })}
                      title={on ? '停用' : '启用'}
                      className="-mr-1 shrink-0 rounded-full p-1"
                    >
                      <SwitchPill checked={on} />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mr-2 mb-2 ml-14 rounded-lg bg-ink-950/70 p-3">
                      {name === 'wecom' && (
                        <p className="text-xs leading-relaxed text-dim">
                          沿用下方「推送设置」里的 webhook key。发出的是合成卡片：
                          商品图 + 价格 + 品名 + 二维码，一条消息一张图。
                        </p>
                      )}

                      {name === 'serverchan' && (
                        <Field label="SendKey" hint="sct.ftqq.com 获取">
                          <input
                            value={ch?.serverchan?.key ?? ''}
                            onChange={(e) => setChan(name, { key: e.target.value })}
                            placeholder="SCT..."
                            className={inputCls}
                          />
                        </Field>
                      )}

                      {name === 'pushplus' && (
                        <Field label="token" hint="pushplus.plus 获取">
                          <input
                            value={ch?.pushplus?.token ?? ''}
                            onChange={(e) => setChan(name, { token: e.target.value })}
                            placeholder="32 位 token"
                            className={inputCls}
                          />
                        </Field>
                      )}

                      {name === 'mp' && (
                        <div className="space-y-2">
                          {(
                            [
                              ['appid', 'AppID', '公众号后台 → 开发 → 基本配置'],
                              ['secret', 'AppSecret', '同上，注意保密'],
                              ['openid', '接收人 openid', '关注者 openid，测试号可一键取'],
                              ['template_id', '模板 ID', '模板消息 → 我的模板'],
                            ] as const
                          ).map(([k, label, hint]) => (
                            <Field key={k} label={label} hint={hint}>
                              <input
                                value={ch?.mp?.[k] ?? ''}
                                onChange={(e) => setChan(name, { [k]: e.target.value })}
                                placeholder={label}
                                className={inputCls}
                              />
                            </Field>
                          ))}
                          <div className="pt-1">
                            <span className="mb-1 block text-xs text-dim">
                              字段模板（可用 {PLACEHOLDERS}）
                            </span>
                            <div className="space-y-1.5">
                              {MP_FIELDS.map((f) => (
                                <div key={f.k} className="flex items-center gap-2">
                                  <span className="w-20 shrink-0 text-xs text-dim">{f.label}</span>
                                  <input
                                    value={ch?.mp?.fields?.[f.k] ?? ''}
                                    onChange={(e) =>
                                      setChan(name, {
                                        fields: { ...ch?.mp?.fields, [f.k]: e.target.value },
                                      })
                                    }
                                    placeholder={f.hint}
                                    className={cn(inputCls, 'h-8 text-xs')}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-2.5 flex items-center justify-between gap-3">
                        <span className="text-[11.5px] leading-snug text-dim">
                          {on ? '已启用，可先测一条' : '启用后才能测试'}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!on}
                          loading={testing === name}
                          onClick={() => onTest(name)}
                        >
                          <FlaskConical className="size-3.5" />
                          发一条测试
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <p className="border-t border-line/70 px-3.5 py-2.5 text-[11px] leading-relaxed text-dim">
            企业微信限速 20 条/分钟；Server酱与 PushPlus 走 markdown 图文，图片为外链 URL。
          </p>
        </div>
      )}
    </div>
  )
}
