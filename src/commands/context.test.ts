import { appendFileSync } from "node:fs"
import { join } from "node:path"
import { cli } from "cleye"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestProject, dedent } from "../lib/test-setup.js"

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

vi.mock("../lib/project.js", async () => {
  const actual = (await vi.importActual("../lib/project.js")) as Record<
    string,
    unknown
  >
  return { ...actual, loadProjectFrom: vi.fn() }
})

import * as cliMod from "../lib/cli.js"
import { loadProjectFrom } from "../lib/project.js"
import { contextCommand, formatContentSeparator } from "./context.js"

const testProject = createTestProject("context-cmd")

const BASIC_SETUP = {
  pmJson: {
    doctypes: {
      feature: { tag: "feat", dir: "context/features", intermediateDir: true },
      spec: { tag: "spec", dir: ".", parent: "feature" },
      task: { tag: "task", dir: ".", parent: "spec" },
    },
  },
  files: {
    "context/features/001.feat.user-auth/001.feat.user-auth.md": {
      title: "User authentication",
      status: "new",
      created_on: "2026-03-20",
    },
    "context/features/001.feat.user-auth/002.spec.login-flow.md": {
      parent: "1.feat.user-auth",
      title: "Login flow",
      status: "new",
      created_on: "2026-03-20",
    },
    "context/features/001.feat.user-auth/003.task.jwt-middleware.md": {
      parent: "2.spec.login-flow",
      title: "Add JWT middleware",
      status: "done",
      created_on: "2026-03-21",
    },
  },
} as const

function allOutput(): string {
  const infoCalls = vi
    .mocked(cliMod.info)
    .mock.calls.map(([msg]) => msg)
    .join("\n")
  const writeCalls = vi
    .mocked(cliMod.write)
    .mock.calls.map(([msg]) => msg)
    .join("")
  // Reconstruct output: info calls produce lines, write calls are inline
  // We interleave them in call order
  const calls: string[] = []
  const infoMock = vi.mocked(cliMod.info).mock
  const writeMock = vi.mocked(cliMod.write).mock
  let iInfo = 0
  let iWrite = 0
  const totalCalls =
    infoMock.invocationCallOrder.length + writeMock.invocationCallOrder.length
  for (let i = 0; i < totalCalls; i++) {
    const infoOrder =
      iInfo < infoMock.invocationCallOrder.length
        ? infoMock.invocationCallOrder[iInfo]
        : Infinity
    const writeOrder =
      iWrite < writeMock.invocationCallOrder.length
        ? writeMock.invocationCallOrder[iWrite]
        : Infinity
    if (infoOrder < writeOrder) {
      calls.push(infoMock.calls[iInfo][0] as string)
      iInfo++
    } else {
      calls.push(writeMock.calls[iWrite][0] as string)
      iWrite++
    }
  }
  return calls.join("\n")
}

describe("context command", () => {
  let dir: string

  beforeEach(() => {
    vi.clearAllMocks()
    const setup = testProject.setup(BASIC_SETUP)
    dir = setup.dir
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("outputs show block and document content for a leaf task", () => {
    // Add body content
    appendFileSync(
      join(dir, "context/features/001.feat.user-auth/001.feat.user-auth.md"),
      "\nFeature body content.\n",
    )
    appendFileSync(
      join(dir, "context/features/001.feat.user-auth/002.spec.login-flow.md"),
      "\nSpec body content.\n",
    )
    appendFileSync(
      join(
        dir,
        "context/features/001.feat.user-auth/003.task.jwt-middleware.md",
      ),
      "\nTask body content.\n",
    )

    cli({ name: "pm", commands: [contextCommand] }, undefined, ["context", "3"])

    const output = allOutput()
    // Show block header
    expect(output).toContain("003 task Add JWT middleware (done)")
    expect(output).toContain("Parents:")
    expect(output).toContain("feature 001 User authentication (new)")
    expect(output).toContain("spec 002 Login flow (new)")
    // Content separators
    expect(output).toContain(formatContentSeparator("001.feat.user-auth.md"))
    expect(output).toContain(formatContentSeparator("002.spec.login-flow.md"))
    expect(output).toContain(
      formatContentSeparator("003.task.jwt-middleware.md"),
    )
    // Raw content includes frontmatter and body
    expect(output).toContain("title: User authentication")
    expect(output).toContain("Feature body content.")
    expect(output).toContain("title: Login flow")
    expect(output).toContain("Spec body content.")
    expect(output).toContain("title: Add JWT middleware")
    expect(output).toContain("Task body content.")
  })

  it("outputs only one document for a root feature", () => {
    appendFileSync(
      join(dir, "context/features/001.feat.user-auth/001.feat.user-auth.md"),
      "\nRoot body.\n",
    )

    cli({ name: "pm", commands: [contextCommand] }, undefined, ["context", "1"])

    const output = allOutput()
    expect(output).toContain("001 feature User authentication (new)")
    expect(output).toContain(formatContentSeparator("001.feat.user-auth.md"))
    // Raw content includes frontmatter
    expect(output).toContain("title: User authentication")
    expect(output).toContain("Root body.")
    // Should not contain parent separators
    expect(output).not.toContain("002.spec")
  })

  it("handles missing parent in chain", () => {
    const setup = testProject.setup({
      pmJson: {
        doctypes: {
          feature: {
            tag: "feat",
            dir: "features",
            intermediateDir: true,
          },
          spec: { tag: "spec", dir: ".", parent: "feature" },
        },
      },
      files: {
        "features/002.feat.orphan/002.feat.orphan.md": {
          title: "Orphan",
          status: "new",
          parent: "999.feat.gone",
        },
      },
    })
    vi.mocked(loadProjectFrom).mockReturnValue(setup.project)
    vi.spyOn(process, "cwd").mockReturnValue(setup.dir)

    appendFileSync(
      join(setup.dir, "features/002.feat.orphan/002.feat.orphan.md"),
      "\nOrphan body.\n",
    )

    cli({ name: "pm", commands: [contextCommand] }, undefined, ["context", "2"])

    const output = allOutput()
    // Show block should mention missing parent
    expect(output).toContain("999 (not found)")
    // Content section for missing parent
    expect(output).toContain(formatContentSeparator("document 999 not found"))
    // Resolved document content
    expect(output).toContain("Orphan body.")
  })

  it("aborts on non-existent document", () => {
    expect(() =>
      cli({ name: "pm", commands: [contextCommand] }, undefined, [
        "context",
        "999",
      ]),
    ).toThrow("Document 999 not found")
  })

  it("aborts on invalid ID", () => {
    expect(() =>
      cli({ name: "pm", commands: [contextCommand] }, undefined, [
        "context",
        "abc",
      ]),
    ).toThrow("Invalid document ID")
  })
})

describe("formatContentSeparator", () => {
  it("pads to at least 60 characters", () => {
    const result = formatContentSeparator("001.feat.auth.md")
    expect(result.startsWith("== CONTENT OF 001.feat.auth.md ")).toBe(true)
    expect(result).toMatch(/=+$/)
    expect(result.length).toBeGreaterThanOrEqual(60)
  })

  it("extends beyond 60 for long filenames", () => {
    const longName = "001.feat.a-very-long-feature-name-that-exceeds-limits.md"
    const result = formatContentSeparator(longName)
    expect(result.startsWith(`== CONTENT OF ${longName} `)).toBe(true)
    expect(result.endsWith("=")).toBe(true)
    expect(result.length).toBeGreaterThanOrEqual(60)
  })
})
