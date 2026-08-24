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

vi.mock("../core/config.js", async () => {
  const actual = (await vi.importActual("../core/config.js")) as Record<
    string,
    unknown
  >
  return { ...actual, loadProjectFrom: vi.fn() }
})

import { loadProjectFrom } from "../core/config.js"
import * as cliMod from "../lib/cli.js"
import { showCommand } from "./show.js"

const testProject = createTestProject("show-cmd")

const PM_JSON = {
  directory: "docs",
  types: {
    feature: { tag: "feat" },
    task: { tag: "task" },
  },
}

function infoOutput(): string {
  return vi
    .mocked(cliMod.info)
    .mock.calls.map(([msg]) => msg)
    .join("\n")
}

describe("show command", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows a doc with a group-then-doc parent chain and its children", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/002.feat.auth.md": {
          parent: "10.stuff",
          title: "Auth",
          status: "new",
        },
        "docs/010.stuff/003.task.login.md": {
          parent: "2.feat.auth",
          title: "Login",
          status: "new",
        },
        "docs/010.stuff/004.task.logout.md": {
          parent: "2.feat.auth",
          title: "Logout",
          status: "new",
        },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "2"])
    expect(infoOutput()).toBe(
      dedent(`
      002 feature Auth (new)
      in docs/010.stuff/002.feat.auth.md

      Parents:
        group 010 stuff

      Children:
        task 003 Login (new)
        task 004 Logout (new)
      `),
    )

    vi.mocked(cliMod.info).mockClear()
    cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "3"])
    expect(infoOutput()).toBe(
      dedent(`
      003 task Login (new)
      in docs/010.stuff/003.task.login.md

      Parents:
        group 010 stuff
        feature 002 Auth (new)
      `),
    )
  })

  it("shows a group with its member children", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/010.stuff/011.task.a.md": {
          parent: "10.stuff",
          title: "A",
          status: "new",
        },
        "docs/012.feat.other.md": { title: "Other", status: "new" },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "10"])
    expect(infoOutput()).toBe(
      dedent(`
      010 group stuff
      in docs/010.stuff

      Children:
        task 011 A (new)
      `),
    )
  })

  it("accepts zero-padded IDs", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/001.feat.auth.md": { title: "Auth", status: "new" },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "001"])
    expect(infoOutput()).toContain("001 feature Auth")
  })

  it("aborts on non-existent document", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs"],
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    expect(() =>
      cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "999"]),
    ).toThrow("Document 999 not found")
  })

  it("aborts on invalid ID", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      dirs: ["docs"],
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    expect(() =>
      cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "abc"]),
    ).toThrow("Invalid document ID")
  })

  it("displays a missing parent in the parent chain", () => {
    const { dir, project } = testProject.setup({
      pmJson: PM_JSON,
      files: {
        "docs/002.feat.ghost.md": {
          title: "Ghost feature",
          status: "new",
          parent: "999.feat.missing",
        },
      },
    })
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [showCommand] }, undefined, ["show", "2"])
    expect(infoOutput()).toBe(
      dedent(`
      002 feature Ghost feature (new)
      in docs/002.feat.ghost.md

      Parents:
        999 (not found)
      `),
    )
  })
})
