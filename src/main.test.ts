import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"

const cliMock = vi.fn(() => ({
  command: "list",
  _: [],
  showHelp: vi.fn(),
}))

vi.mock("cleye", async (importOriginal) => {
  const actual = await importOriginal<typeof import("cleye")>()
  return { ...actual, cli: cliMock }
})

const packageJsonPath = fileURLToPath(
  new URL("../package.json", import.meta.url),
)
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
  version: string
}

describe("main CLI", () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("uses the package version for --version", async () => {
    await import("./main.js")

    expect(cliMock).toHaveBeenCalledWith(
      expect.objectContaining({ version: packageJson.version }),
    )
  })
})
