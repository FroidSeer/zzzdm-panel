/**
 * 白天 / 夜间两套主题。
 *
 * 实现方式：只切换 <html> 上的 `.dark` 类，颜色全部由 index.css 里的
 * CSS 变量决定（Tailwind 编译出的工具类引用的就是这些变量），
 * 所以组件里不需要写任何 `dark:` 前缀。
 */

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'zzzdm-theme'

/** 读当前主题：本地存过就用存的，否则跟随系统 */
export function readTheme(): Theme {
  // ?theme=dark / ?theme=light 优先（index.html 的首帧脚本也读它，保持一致）
  try {
    const q = new URLSearchParams(location.search).get('theme')
    if (q === 'light' || q === 'dark') return q
  } catch {
    /* ignore */
  }
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  } catch {
    /* 隐私模式下 localStorage 可能不可用 */
  }
  return 'dark'
}

export function applyTheme(t: Theme) {
  const el = document.documentElement
  el.classList.toggle('dark', t === 'dark')
  el.style.colorScheme = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* ignore */
  }
}

/** [当前主题, 切换] */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => readTheme())
  useEffect(() => {
    applyTheme(theme)
  }, [theme])
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return [theme, toggle]
}
