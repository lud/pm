default: test

install: build schema
  ln -sf "$(pwd)/dist/main.js" ~/.local/bin/pm

uninstall:
  rm -f ~/.local/bin/pm

build:
  npm run build

format:
  biome format --fix

typecheck:
  npm run typecheck

schema:
  npx tsx tools/build-json-schema.ts

test:
  npm run test

test-coverage:
  npx vitest run --coverage

release bump: check
  npx tsx tools/release.ts {{bump}}

_git_status:
  git status

biome-check:
  biome check
biome-check-fix:
  biome check --fix

check: format test-coverage build schema biome-check typecheck _git_status