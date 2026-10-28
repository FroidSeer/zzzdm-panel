export interface Post {
  id: number
  time: string
  text: string
  links: string[]
  photos: string[]
  url: string
}

export interface Stats {
  total: number
  kept: number
  excluded: number
  /** latest 截断后实际展示的条数 */
  shown?: number
  /** 展示范围内已推送过的条数 */
  pushed?: number
}

export interface LogEntry {
  t: string
  m: string
}

export interface Config {
  key: string
  proxy: string
  tz?: number
  exclude: string[]
  latest: number
  filter_enabled: boolean
  push_images?: boolean
  auto_refresh_sec: number
  auto_push?: boolean
  /** 服务端每日定时 "HH:MM"，空 = 关闭 */
  daily_time?: string
  /** 手动推送默认跳过已推送过的 */
  skip_pushed?: boolean
}

export interface Stats {
  total: number
  kept: number
  excluded: number
  /** latest 截断后实际展示的条数 */
  shown?: number
  /** 展示范围内已推送过的条数 */
  pushed?: number
}

export interface Snapshot {
  posts: Post[]
  excluded: Post[]
  stats: Stats
  /** 已推送记录：帖子 id → 推送时间 */
  pushed?: Record<string, string>
  last_fetch: string | null
  last_error: string
  fetch_warn?: string
  pushing: boolean
  job?: { last_run: string; running: boolean }
  log: LogEntry[]
  config: Config
}

export interface FetchResult {
  ok: boolean
  error?: string
  warn?: string
  stats?: Stats
}

export interface PushResult {
  ok: boolean
  sent?: string
  error?: string
  stats?: Stats
}
export function linkKind(url: string): 'buy' | 'post' | 'detail' | 'other' {
  if (/u\.jd\.com|item\.jd\.com|taobao|tmall|tb\.cn|pinduoduo|p\.pinduoduo/.test(url)) return 'buy'
  if (url.includes('t.me/zzzdm/')) return 'post'
  if (url.includes('zzzdm.com')) return 'detail'
  return 'other'
}

export function linkLabel(url: string): string {
  const kind = linkKind(url)
  if (kind === 'buy') return '立即购买'
  if (kind === 'post') return '原帖'
  if (kind === 'detail') return '详情'
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return '链接'
  }
}
