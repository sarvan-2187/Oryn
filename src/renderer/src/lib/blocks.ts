/**
 * Flattens BlockNote's block tree to plain text for the FTS index.
 * Kept dependency-free and defensive: block shapes vary by type, and a note
 * that fails to flatten must still save.
 */
type Unknown = Record<string, unknown>

function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((item) => {
      const it = item as Unknown
      if (typeof it?.text === 'string') return it.text
      // Link nodes nest their own inline content.
      if (Array.isArray(it?.content)) return inlineText(it.content)
      return ''
    })
    .join('')
}

export function blocksToText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  const out: string[] = []
  const walk = (list: unknown[]): void => {
    for (const block of list) {
      const b = block as Unknown
      const line = inlineText(b?.content)
      if (line.trim()) out.push(line)
      if (Array.isArray(b?.children)) walk(b.children as unknown[])
    }
  }
  walk(blocks)
  return out.join('\n')
}

/** First non-empty line, used as the fallback note title. */
export function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .find((l) => l.trim())
      ?.trim()
      .slice(0, 120) ?? ''
  )
}
