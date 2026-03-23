// Prepends #!/usr/bin/env node to a file if not already present, and makes it executable.
const fs = require("fs")
const file = process.argv[2]
if (!file) { console.error("Usage: add-shebang.cjs <file>"); process.exit(1) }
const content = fs.readFileSync(file, "utf8")
if (!content.startsWith("#!")) {
  fs.writeFileSync(file, "#!/usr/bin/env node\n" + content)
}
fs.chmodSync(file, 0o755)
