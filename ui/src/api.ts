import { useCallback, useEffect, useRef, useState } from 'react'
import type { Config, FetchResult, PushResult, Snapshot, Stats } from './types'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

/**
 * 只挑出真正要改的配置字段发出去。
 * 之前整份 cfg 跟着每个请求走，多标签页会互相覆盖对方刚改的关键词。
 */
function diffConfig(cfg: Config, base: Config | null): Partial<Config> {
  if (!base) return { ...cfg }
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(cfg) as (keyof Config)[]) {
    const a = cfg[k]
    const b = base[k]
    const same = Array.isArray(a) && Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b
    if (!same) out[k] = a
  }
  return out as Partial<Config>
}

export function useApi() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState<'' | 'fetch' | 'push'>('')
  const baseCfg = useRef<Config | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await post<Snapshot>('/api/state', {})
      if (data?.config) baseCfg.current = data.config
      setSnap(data)
    } catch {
      /* server momentarily unavailable; keep last snapshot */
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const fetchNow = useCallback(
    async (cfg: Config) => {
      setBusy('fetch')
      try {
        const r = await post<FetchResult>('/api/fetch', diffConfig(cfg, baseCfg.current))
        await refresh()
        return r
      } catch (e) {
        return { ok: false, error: String(e) } as FetchResult
      } finally {
        setBusy('')
      }
    },
    [refresh],
  )

  const pushNow = useCallback(
    async (cfg: Config, opts?: { ids?: number[]; skipPushed?: boolean; force?: boolean }) => {
      setBusy('push')
      try {
        const body: Record<string, unknown> = { ...diffConfig(cfg, baseCfg.current) }
        if (opts?.ids?.length) body.ids = opts.ids
        if (opts?.skipPushed !== undefined) body.skip_pushed = opts.skipPushed
        if (opts?.force) body.force = true
        const r = await post<PushResult>('/api/push', body)
        await refresh()
        return r
      } catch (e) {
        return { ok: false, error: String(e) } as PushResult
      } finally {
        setBusy('')
      }
    },
    [refresh],
  )

  const saveConfig = useCallback(async (cfg: Config) => {
    try {
      const r = await post<{ ok: boolean }>('/api/config', diffConfig(cfg, baseCfg.current))
      if (r.ok) baseCfg.current = cfg
      return !!r.ok
    } catch {
      return false
    }
  }, [])

  /** 清空已推送记录：ids 省略时全清 */
  const clearPushed = useCallback(
    async (ids?: number[]) => {
      try {
        const r = await post<{ ok: boolean }>('/api/unpush', ids?.length ? { ids } : {})
        await refresh()
        return !!r.ok
      } catch {
        return false
      }
    },
    [refresh],
  )

  /** 只按当前关键词重算已抓到的帖子，不重新联网 */
  const refilter = useCallback(async () => {
    try {
      const r = await post<{ ok: boolean; error: string; stats?: Stats }>('/api/refilter', {})
      await refresh()
      return r
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }, [refresh])

  /** 通道自检：发一条测试消息 */
  const testChannel = useCallback(
    async (name: string, cfg: Config) => {
      try {
        const r = await post<{ ok: boolean; error?: string }>('/api/test_channel', {
          name,
          ...diffConfig(cfg, baseCfg.current),
        })
        return r
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },
    [],
  )

  return { snap, busy, refresh, fetchNow, pushNow, saveConfig, clearPushed, refilter, testChannel }
}
