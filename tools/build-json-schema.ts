import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { StrictProjectConfigSchema } from "../src/core/config.js"

// The published schema is the strict v2 one: editors flag legacy keys,
// while the loader stays tolerant.
const jsonSchema = z.toJSONSchema(StrictProjectConfigSchema, {
  target: "draft-2020-12",
  io: "input",
})

const outPath = join(import.meta.dirname, "../resources/pm-project.schema.json")
writeFileSync(outPath, `${JSON.stringify(jsonSchema, null, 2)}\n`)

console.log(`Written ${outPath}`)
