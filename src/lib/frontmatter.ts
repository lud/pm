import * as yaml from "yaml"

const FM_REGEX = /^---\n([\s\S]*?)---(\n|$)/

export function parseFrontmatter(content: string): {
  data: Record<string, unknown>
  body: string
} {
  const match = FM_REGEX.exec(content)
  if (!match) return { data: {}, body: content }
  const data = (yaml.parse(match[1]) as Record<string, unknown>) ?? {}
  const body = content.slice(match[0].length)
  return { data, body }
}

export function hasFrontmatter(content: string): boolean {
  return FM_REGEX.test(content)
}

export function formatFrontmatter(data: Record<string, unknown>): string {
  return `---\n${yaml.stringify(data).trimEnd()}\n---\n`
}

export function prependFrontmatter(
  data: Record<string, unknown>,
  body: string,
): string {
  return formatFrontmatter(data) + body
}

export function setFrontmatterProperty(
  content: string,
  key: string,
  value: unknown,
): string {
  const { data, body } = parseFrontmatter(content)
  return prependFrontmatter({ ...data, [key]: value }, body)
}

export function setFrontmatterProperties(
  content: string,
  properties: Record<string, unknown>,
): string {
  const { data, body } = parseFrontmatter(content)
  return prependFrontmatter({ ...data, ...properties }, body)
}
