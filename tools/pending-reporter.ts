/**
 * Vitest reporter that lists pending tests (it.todo / it.skip, including
 * dynamic skips) after the run, so contract tests waiting on future steps
 * stay visible without failing the suite. Registered in vitest.config.ts
 * alongside the default reporter.
 */
import { relative } from "node:path"
import type { Reporter, TestModule } from "vitest/node"

const YELLOW = "\x1b[33m"
const RESET = "\x1b[0m"

export default class PendingReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const lines: string[] = []

    for (const mod of testModules) {
      const file = relative(process.cwd(), mod.moduleId)
      for (const test of mod.children.allTests()) {
        const mode = test.options.mode
        const isStatic = mode === "skip" || mode === "todo"
        const isDynamic = !isStatic && test.result().state === "skipped"
        if (!isStatic && !isDynamic) continue

        const label = (isStatic ? mode : "skip").toUpperCase()
        const loc = test.location ? `:${test.location.line}` : ""
        lines.push(`${YELLOW}${label}${RESET} ${file}${loc} — ${test.fullName}`)
      }
    }

    if (lines.length > 0) {
      console.log(`\n${lines.join("\n")}`)
      console.log(
        `${YELLOW}${lines.length} pending test(s) (todo/skip)${RESET}`,
      )
    }
  }
}
