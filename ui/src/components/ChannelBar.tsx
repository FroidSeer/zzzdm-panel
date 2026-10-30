import { useEffect, useRef, useState } from 'react'
import {
  BellRing,
  Building2,
  Check,
  ChevronDown,
  FlaskConical,
  MessageSquare,
  Radio,
  Server,
} from 'lucide-react'
import type { ChannelName, Config } from '../types'
import { cn } from '../lib/utils'
import { Button } from './Button'
import { Field, inputCls } from './Panel'

/** 通道元信息：图标、名字、一句话说明、是否需要额外字段 */
const META: Record<
  ChannelName,
  { icon: typeof Radio; name: string; desc: string; tone: string }
> = {
  wecom: {
    icon: Building2,
    name: '企业微信',
    desc: '群机器人 · 图文合成一张卡片',
    tone: 'text-emerald-600 dark:text-emerald-400',
  },
  serverchan: {
    icon: Server,
    name: 'Server酱',
    desc: '微信服务号 · markdown 图文',
    tone: 'text-sky-600 dark:text-sky-400',
  },
  pushplus: {
    icon: BellRing,
    name: 'PushPlus',
    desc: '微信推送 · markdown 图文',
    tone: 'text-amber-600 dark:text-amber-400',
  },
  mp: {
    icon: MessageSquare,
    name: '公众号',
    desc: '模板消息 · 纯文字（可放测试号）',
    tone: 'text-violet-600 dark:text-violet-400',
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

  // 点到外面就收起
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const ch = cfg.channels
  const active = ORDER.filter((n) => ch?.[n]?.enabled)

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
        title="选择推送通道"
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition',
          open
            ? 'border-brand/60 bg-brand/10 text-brand'
            : 'border-line bg-ink-700 text-dim hover:border-ink-600 hover:bg-ink-600 hover:text-fg',
        )}
      >
        <Radio className="size-4" />
        <span className="hidden sm:inline">通道</span>
        <span
          className={cn(
            'tabular rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
            active.length ? 'bg-brand/15 text-brand' : 'bg-ink-600 text-dim',
          )}
        >
          {active.length}
        </span>
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="fade-up absolute top-12 right-0 z-50 w-[380px] rounded-xl border border-line bg-ink-800 p-3 shadow-2xl shadow-black/20">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">
              推送通道
            </span>
            <span className="text-[10.5px] text-dim/70">可多选，各推一遍</span>
          </div>

          <div className="thin-scroll max-h-[70vh] space-y-1.5 overflow-y-auto pr-0.5">
            {ORDER.map((name) => {
              const meta = META[name]
              const conf = ch?.[name]
              const on = !!conf?.enabled
              const Icon = meta.icon
              const isOpen = expand === name
              return (
                <div
                  key={name}
                  className={cn(
                    'rounded-lg border transition',
                    on ? 'border-brand/35 bg-ink-950' : 'border-line bg-ink-950/60',
                  )}
                >
                  <div className="flex items-center gap-2.5 p-2.5">
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-md bg-ink-700',
                        on ? meta.tone : 'text-dim/60',
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpand(isOpen ? '' : name)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
                        {meta.name}
                        {on && <Check className="size-3 text-brand" />}
                      </span>
                      <span className="block truncate text-[10.5px] text-dim/70">{meta.desc}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChan(name, { enabled: !on })}
                      title={on ? '停用' : '启用'}
                      className={cn(
                        'relative h-5 w-9 shrink-0 rounded-full transition',
                        on ? 'brand-gradient' : 'bg-ink-600',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 size-4 rounded-full bg-white shadow transition-all',
                          on ? 'left-4.5' : 'left-0.5',
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpand(isOpen ? '' : name)}
                      className="text-dim/60 hover:text-fg"
                    >
                      <ChevronDown className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')} />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-line/70 px-2.5 pt-2 pb-2.5">
                      {name === 'wecom' && (
                        <p className="text-[11px] leading-relaxed text-dim/80">
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
                            <span className="mb-1 block text-[10.5px] text-dim">
                              字段模板（可用 {PLACEHOLDERS}）
                            </span>
                            <div className="space-y-1.5">
                              {MP_FIELDS.map((f) => (
                                <div key={f.k} className="flex items-center gap-2">
                                  <span className="w-20 shrink-0 text-[10.5px] text-dim/80">{f.label}</span>
                                  <input
                                    value={ch?.mp?.fields?.[f.k] ?? ''}
                                    onChange={(e) =>
                                      setChan(name, { fields: { ...ch?.mp?.fields, [f.k]: e.target.value } })
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

                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-dim/60">
                          {on ? '已启用，点右侧可先测一条' : '启用后才能测试'}
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

          <p className="mt-2 px-1 text-[10px] leading-relaxed text-dim/60">
            企业微信限速 20 条/分钟；Server酱与 PushPlus 走 markdown 图文，图片为外链 URL。
          </p>
        </div>
      )}
    </div>
  )
}
