import * as yaml from "yaml"

export type PropertyFilter = {
  key: string
  value: unknown
}

export function parsePropertyFlag(
  input: string,
  flagName: string,
): PropertyFilter {
  const colonIdx = input.indexOf(":")
  if (colonIdx === -1) {
    throw new Error(
      `Invalid ${flagName} format: "${input}". Expected key:value`,
    )
  }

  const key = input.slice(0, colonIdx).trim()
  if (key.length === 0) {
    throw new Error(
      `Invalid ${flagName} format: "${input}". Missing key before ':'`,
    )
  }

  const rawValue = input.slice(colonIdx + 1)
  return { key, value: parsePropertyValue(rawValue) }
}

export function parsePropertyFlags(
  inputs: string[] | undefined,
  flagName: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const input of inputs ?? []) {
    const { key, value } = parsePropertyFlag(input, flagName)
    result[key] = value
  }
  return result
}

export function parsePropertyFilters(
  inputs: string[] | undefined,
  flagName: string,
): PropertyFilter[] {
  return (inputs ?? []).map((input) => parsePropertyFlag(input, flagName))
}

function parsePropertyValue(raw: string): unknown {
  try {
    const yamlScalar = yaml.parse(raw)
    if (typeof yamlScalar === "boolean") {
      return yamlScalar
    }
  } catch {
    // Keep invalid YAML-like values as plain strings.
  }

  const numeric = Number(raw)
  if (raw.length > 0 && Number.isFinite(numeric) && String(numeric) === raw) {
    return numeric
  }

  return raw
}
