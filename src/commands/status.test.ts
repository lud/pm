import { cli } from "cleye"
import { afterEach, describe, expect, it, vi } from "vitest"
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

vi.mock("../lib/project.js", async () => {
  const actual = (await vi.importActual("../lib/project.js")) as Record<
    string,
    unknown
  >
  return { ...actual, loadProjectFrom: vi.fn() }
})

import * as cliMod from "../lib/cli.js"
import { loadProjectFrom } from "../lib/project.js"
import { statusCommand } from "./status.js"

const testProject = createTestProject("status-cmd")

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
    "context/features/001.feat.user-auth/004.task.session-store.md": {
      parent: "2.spec.login-flow",
      title: "Session store",
      status: "new",
      created_on: "2026-03-21",
    },
  },
} as const

const MULTI_STATUS_SETUP = {
  pmJson: {
    doctypes: {
      feature: { tag: "feat", dir: "context/features", intermediateDir: true },
      spec: { tag: "spec", dir: ".", parent: "feature" },
      task: { tag: "task", dir: ".", parent: "spec" },
    },
  },
  files: {
    "context/features/001.feat.auth/001.feat.auth.md": {
      title: "Authentication",
      status: "in-progress",
    },
    "context/features/001.feat.auth/002.spec.login.md": {
      parent: "1.feat.auth",
      title: "Login flow",
      status: "specified",
    },
    "context/features/001.feat.auth/003.spec.signup.md": {
      parent: "1.feat.auth",
      title: "Signup flow",
      status: "new",
    },
    "context/features/001.feat.auth/004.task.jwt.md": {
      parent: "2.spec.login",
      title: "JWT middleware",
      status: "done",
    },
    "context/features/001.feat.auth/006.task.session.md": {
      parent: "2.spec.login",
      title: "Session store",
      status: "in-progress",
    },
    "context/features/001.feat.auth/007.task.hash.md": {
      parent: "3.spec.signup",
      title: "Password hashing",
      status: "new",
    },
    "context/features/001.feat.auth/008.task.validate.md": {
      parent: "3.spec.signup",
      title: "Input validation",
      status: "done",
    },
    "context/features/005.feat.payments/005.feat.payments.md": {
      title: "Payments",
      status: "new",
    },
  },
} as const

function infoLines(): string[] {
  return vi.mocked(cliMod.info).mock.calls.map(([msg]) => msg)
}

describe("status command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows status summary for basic project", () => {
    vi.clearAllMocks()
    const { dir, project } = testProject.setup(BASIC_SETUP)
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [statusCommand] }, undefined, ["status"])
    const lines = infoLines()
    const output = lines.join("\n")
    expect(output).toContain("feature")
    expect(output).toContain("new")
  })

  it("shows status breakdown for multi-status project", () => {
    vi.clearAllMocks()
    const { dir, project } = testProject.setup(MULTI_STATUS_SETUP)
    vi.spyOn(process, "cwd").mockReturnValue(dir)
    vi.mocked(loadProjectFrom).mockReturnValue(project)

    cli({ name: "pm", commands: [statusCommand] }, undefined, ["status"])
    const lines = infoLines()
    const output = lines.join("\n")
    // multi-status fixture has multiple status values
    expect(output).toContain("feature")
  })
})
