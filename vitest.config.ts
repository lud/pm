import { defineConfig } from "vitest/config"
import PendingReporter from "./tools/pending-reporter.js"

export default defineConfig({
  test: {
    reporters: ["default", new PendingReporter()],
    includeTaskLocation: true,
    // the developer shell may set PMFILE (project-file override, e.g. via
    // .envrc to run pm on pm itself) — tests always use the default name
    env: { PMFILE: "" },
  },
})
