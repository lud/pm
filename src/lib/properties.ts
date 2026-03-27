import * as yaml from "yaml"

export type PropertyValue = string | boolean | number
export type PropertyFlag = {
  key: string
  value: PropertyValue
  raw: string
}

export function parsePropertyFlag(
  input: string,
  flagName: string,
): PropertyFlag {
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
  return { key, value: parsePropertyValue(rawValue), raw: input }
}

export function parsePropertyFlags(
  inputs: string[] | undefined,
  flagName: string,
): Record<string, PropertyValue> {
  return flagsToRecord(
    (inputs ?? []).map((input) => parsePropertyFlag(input, flagName)),
  )
}

export function flagsToRecord(
  flags: PropertyFlag[],
): Record<string, PropertyValue> {
  const result: Record<string, PropertyValue> = {}
  for (const { key, value } of flags) {
    result[key] = value
  }
  return result
}

export function parsePropertyFilters(
  inputs: string[] | undefined,
  flagName: string,
): PropertyFlag[] {
  return (inputs ?? []).map((input) => parsePropertyFlag(input, flagName))
}

function parsePropertyValue(raw: string): PropertyValue {
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
