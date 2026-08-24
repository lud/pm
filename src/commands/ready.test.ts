import { cli } from "cleye"
import { afterEach, describe, expect, it, vi } from "vitest"
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

vi.mock("../core/config.js", async () => {
  const actual = (await vi.importActual("../core/config.js")) as Record<
    string,
    unknown
  >
  return { ...actual, loadProjectFrom: vi.fn() }
})

import { loadProjectFrom } from "../core/config.js"
import * as cliMod from "../lib/cli.js"
import { nextCommand, readyCommand } from "./ready.js"

const testProject = createTestProject("ready-cmd")

const PM_JSON = {
  directory: "docs",
  types: {
    feature: { tag: "feat" },
    spec: { tag: "spec" },
    task: { tag: "task" },
  },
}

function infoOutput(): string {
  return vi
    .mocked(cliMod.info)
    .mock.calls.map(([msg]) => msg)
    .join("\n")
}

function warningOutput(): string[] {
  return vi.mocked(cliMod.warning).mock.calls.map(([msg]) => msg)
}

describe("ready command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("prints flat actionable docs with tag, padded ID, title, and status", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.alpha.md": { title: "Alpha", status: "new" },
        "docs/002.task.beta.md": { title: "Beta", status: "in-progress" },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [readyCommand] }, undefined, ["ready"])

    expect(infoOutput()).toBe(
      dedent(`
      feat 001 Alpha (new)
      task 002 Beta (in-progress)
      `),
    )
  })

  it("omits done documents", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.alpha.md": { title: "Alpha", status: "new" },
        "docs/002.task.beta.md": { title: "Beta", status: "done" },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [readyCommand] }, undefined, ["ready"])

    const output = infoOutput()
    expect(output).not.toContain("Beta")
    expect(output).toBe("feat 001 Alpha (new)")
  })

  it("shows a group above its actionable member with correct indent and no status", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/011.task.go.md": {
          parent: "10.stuff",
          title: "Go",
          status: "new",
        },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [readyCommand] }, undefined, ["ready"])

    expect(infoOutput()).toBe(
      dedent(`
      group 010 stuff
        task 011 Go (new)
      `),
    )
  })

  it("hides a blocked doc by default and shows it with --with-blocked", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.task.free.md": { title: "Free", status: "new" },
        "docs/002.task.stuck.md": { title: "Stuck", status: "blocked" },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [readyCommand] }, undefined, ["ready"])
    expect(infoOutput()).toBe("task 001 Free (new)")

    vi.clearAllMocks()
    cli({ name: "pm", commands: [readyCommand] }, undefined, [
      "ready",
      "--with-blocked",
    ])
    expect(infoOutput()).toBe(
      dedent(`
      task 001 Free (new)
      task 002 Stuck (blocked)
      `),
    )
  })

  it("hides a doc gated by an un-done depends by default", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.task.dep.md": { title: "Dep", status: "new" },
        "docs/002.task.waiting.md": {
          title: "Waiting",
          status: "new",
          depends: [1],
        },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [readyCommand] }, undefined, ["ready"])
    expect(infoOutput()).toBe("task 001 Dep (new)")
  })

  it("prints depends hygiene warnings before entries", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs/010.stuff"],
      files: {
        "docs/001.task.a.md": {
          title: "A",
          status: "new",
          depends: ["10.stuff"],
        },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [readyCommand] }, undefined, ["ready"])

    const warnings = warningOutput()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/group/i)
    expect(infoOutput()).toBe("task 001 A (new)")
  })

  it("marks the current document with [current]", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      pmCurrent: 1,
      files: {
        "docs/001.task.a.md": { title: "A", status: "new" },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [readyCommand] }, undefined, ["ready"])
    expect(infoOutput()).toBe("task 001 A (new) [current]")
  })

  it("marks a current group with [current]", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      pmCurrent: 10,
      files: {
        "docs/010.stuff/011.task.go.md": {
          parent: "10.stuff",
          title: "Go",
          status: "new",
        },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [readyCommand] }, undefined, ["ready"])
    expect(infoOutput()).toBe(
      dedent(`
      group 010 stuff [current]
        task 011 Go (new)
      `),
    )
  })

  it("shows message when all documents are done", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.alpha.md": { title: "Alpha", status: "done" },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [readyCommand] }, undefined, ["ready"])
    expect(infoOutput()).toBe("No actionable documents found.")
  })

  it("produces identical output via the next alias", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      pmCurrent: 1,
      files: {
        "docs/001.feat.alpha.md": { title: "Alpha", status: "new" },
        "docs/002.task.beta.md": { title: "Beta", status: "in-progress" },
      },
    })

    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)
    cli({ name: "pm", commands: [readyCommand] }, undefined, ["ready"])
    const readyOutput = infoOutput()

    vi.clearAllMocks()
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)
    cli({ name: "pm", commands: [nextCommand] }, undefined, ["next"])
    const nextOutput = infoOutput()

    expect(nextOutput).toBe(readyOutput)
    expect(readyOutput).toBe(
      dedent(`
      feat 001 Alpha (new) [current]
      task 002 Beta (in-progress)
      `),
    )
  })
})
