/** 排除关键词的文件读写工具：纯函数、无框架依赖，便于单测与被任意组件复用。 */

/** 从文本解析关键词：txt / md / csv 都吃
 *  - 全局剔除 HTML 注释（<!-- … -->，md 的说明文字就用它写，导入时整段忽略）
 *  - 逐行处理：跳过 Markdown 标题行（# …）与注释行（// ;）
 *  - 去掉列表符（- * + 1.）、引用符（>）与强调/代码标记（` * _ ~）
 *  - 一行可以写多个词，按逗号/顿号/分号/空白切开
 */
export function parseKeywords(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const body = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '')
  for (const raw of body.split('\n')) {
    if (/^\s{0,3}#{1,6}\s/.test(raw)) continue
    if (/^\s*(?:\/\/|;)/.test(raw)) continue
    const line = raw
      .replace(/^\s{0,3}(?:>\s*|[-*+•]\s+|\d+[.)]\s+)/, '')
      .replace(/[`*_~]/g, '')
      .trim()
    if (!line || line.startsWith('#')) continue
    for (const part of line.split(/[,，、;；\s]+/)) {
      const w = part.trim()
      if (w && !seen.has(w)) {
        seen.add(w)
        out.push(w)
      }
    }
  }
  return out
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 生成导出文件内容：两种格式互相都能被 parseKeywords 原样读回
 *  - md：说明放在 HTML 注释里，渲染出来干净，导入时整段忽略
 *  - txt：说明用 # 注释行，记事本里也看得懂
 */
export function buildKeywordsFile(words: string[], fmt: 'txt' | 'md'): string {
  const head =
    fmt === 'md'
      ? [
          '# 排除关键词',
          '',
          '<!--',
          `共 ${words.length} 个词，一行一个。`,
          '以 # / // / ; 开头的行为注释；HTML 注释块之间的说明整段忽略。',
          `导出自 zzzdm 推送面板 · ${stamp()}`,
          '-->',
          '',
        ].join('\n')
      : [
          `# 排除关键词 · ${words.length} 个`,
          '# 一行一个词；以 # / // / ; 开头的行为注释，导入时自动忽略',
          `# 导出自 zzzdm 推送面板 · ${stamp()}`,
          '',
        ].join('\n')
  return head + words.join('\n') + '\n'
}

/** 文件名里的时间戳：冒号与空格换成 -，Windows 文件名合法 */
export function keywordsFileName(n: number, fmt: 'txt' | 'md'): string {
  return `排除关键词-${n}个-${stamp().replace(/[: ]/g, '-')}.${fmt}`
}

/** 触发浏览器下载（带 BOM，Windows 记事本打开中文不乱码） */
export function downloadText(name: string, text: string, mime: string): void {
  const blob = new Blob(['\uFEFF' + text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
