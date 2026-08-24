import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { cli } from "cleye"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestProject } from "../lib/test-setup.js"

vi.mock("../lib/cli.js", async () => {
  const actual = (await vi.importActual("../lib/cli.js")) as Record<
    string,
    unknown
  >
  return {
    ...actual,
    write: vi.fn(),
    writeln: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    abort: vi.fn(() => {
      throw new Error("abort")
    }),
    abortError: vi.fn((msg: string) => {
      throw new Error(msg)
    }),
  }
})

import * as cliMod from "../lib/cli.js"
import { infoCommand } from "./info.js"

const testProject = createTestProject("info-cmd")

function infoLines(): string[] {
  return vi.mocked(cliMod.info).mock.calls.map(([msg]) => msg)
}

function warningLines(): string[] {
  return vi.mocked(cliMod.warning).mock.calls.map(([msg]) => msg)
}

function run(): void {
  cli({ name: "pm", commands: [infoCommand] }, undefined, ["info"])
}

describe("info command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("with a full v2 config", () => {
    let dir: string

    beforeEach(() => {
      vi.clearAllMocks()
      const setup = testProject.setup({
        pmJson: {
          directory: "docs",
          defaultStatus: "new",
          doneStatuses: ["done"],
          blockedStatuses: ["blocked"],
          types: {
            feature: { tag: "feat" },
            decision: {
              tag: "adr",
              doneStatuses: ["accepted", "rejected"],
            },
          },
        },
        dirs: ["docs"],
      })
      dir = setup.dir
      vi.spyOn(process, "cwd").mockReturnValue(dir)
    })

    it("prints the project directory", () => {
      run()
      expect(infoLines()).toContain(`Project: ${dir}`)
    })

    it("prints the resolved documents directory", () => {
      run()
      expect(infoLines()).toContain(`Directory: docs (${join(dir, "docs")})`)
    })

    it("lists each type with its effective status configuration", () => {
      run()
      const lines = infoLines()
      expect(lines).toContain("  feature (feat)")
      expect(lines).toContain("  decision (adr)")
      const featureIdx = lines.indexOf("  feature (feat)")
      const decisionIdx = lines.indexOf("  decision (adr)")
      // effective values, resolved from globals + per-type overrides
      expect(lines.slice(featureIdx + 1, featureIdx + 4)).toContain(
        "      default: new  done: done  blocked: blocked",
      )
      expect(lines.slice(decisionIdx + 1, decisionIdx + 4)).toContain(
        "      default: new  done: accepted, rejected  blocked: blocked",
      )
    })

    it("prints the fallback statuses for undeclared types", () => {
      run()
      expect(infoLines()).toContain(
        "Undeclared types use: default: new  done: done  blocked: blocked",
      )
    })

    it("prints no warnings", () => {
      run()
      expect(warningLines()).toEqual([])
    })
  })

  describe("with no declared types", () => {
    beforeEach(() => {
      vi.clearAllMocks()
      const setup = testProject.setup({
        pmJson: { directory: "docs" },
        dirs: ["docs"],
      })
      vi.spyOn(process, "cwd").mockReturnValue(setup.dir)
    })

    it("prints Types: (none)", () => {
      run()
      expect(infoLines()).toContain("Types: (none)")
    })
  })

  describe("with a legacy (doctypes) config", () => {
    beforeEach(() => {
      vi.clearAllMocks()
      const setup = testProject.setup({
        pmJson: {
          directory: "docs",
          doctypes: {
            feature: { tag: "feat", dir: "docs", intermediateDir: true },
          },
        },
        dirs: ["docs"],
      })
      vi.spyOn(process, "cwd").mockReturnValue(setup.dir)
    })

    it("still reports the type resolved from the legacy doctypes field", () => {
      run()
      expect(infoLines().some((l) => l.includes("feature (feat)"))).toBe(true)
    })

    it("prints warnings about the legacy config", () => {
      run()
      const warnings = warningLines()
      expect(warnings.some((w) => w.includes('Legacy "doctypes"'))).toBe(true)
    })
  })

  describe("when no project exists", () => {
    beforeEach(() => {
      vi.clearAllMocks()
      const emptyDir = testProject.dir()
      vi.spyOn(process, "cwd").mockReturnValue(emptyDir)
    })

    it("aborts with an error", () => {
      expect(() => run()).toThrow(/Could not locate pm\.json/)
      expect(cliMod.abortError).toHaveBeenCalled()
    })
  })
})

describe("info command — guides", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows built-in guide description and path for known type names", () => {
    vi.clearAllMocks()
    const setup = testProject.setup({
      pmJson: { directory: "docs", types: { feature: { tag: "feat" } } },
      dirs: ["docs"],
    })
    vi.spyOn(process, "cwd").mockReturnValue(setup.dir)
    run()
    const lines = infoLines()
    expect(
      lines.some((l) => /^ {6}guide: .*type-guides\/feature\.md$/.test(l)),
    ).toBe(true)
    // the description line sits right above the guide path line
    const guideIdx = lines.findIndex((l) => l.includes("type-guides/feature"))
    expect(lines[guideIdx - 1]).toMatch(/^ {6}\S/)
  })

  it("shows a project-override guide and honours guide: false", () => {
    vi.clearAllMocks()
    const setup = testProject.setup({
      pmJson: {
        directory: "docs",
        types: {
          feature: { tag: "feat", guide: "my-feature-guide.md" },
          spec: { tag: "spec", guide: false },
        },
      },
      dirs: ["docs"],
    })
    writeFileSync(
      join(setup.dir, "my-feature-guide.md"),
      "---\ndescription: Custom feature doctrine\n---\n",
    )
    vi.spyOn(process, "cwd").mockReturnValue(setup.dir)
    run()
    const lines = infoLines()
    expect(lines).toContain("      Custom feature doctrine")
    expect(lines).toContain("      guide: my-feature-guide.md")
    expect(lines.filter((l) => l.includes("guide:"))).toHaveLength(1)
  })

  it("aborts when an explicit guide path does not resolve", () => {
    vi.clearAllMocks()
    const setup = testProject.setup({
      pmJson: {
        directory: "docs",
        types: { feature: { tag: "feat", guide: "gone.md" } },
      },
      dirs: ["docs"],
    })
    vi.spyOn(process, "cwd").mockReturnValue(setup.dir)
    expect(() => run()).toThrow(/Guide for type "feature" not found/)
  })
})
