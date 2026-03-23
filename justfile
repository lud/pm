default: test

install: build schema
  ln -sf "$(pwd)/dist/main.js" ~/.local/bin/pm

uninstall:
  rm -f ~/.local/bin/pm

build:
  npm run build

format:
  prettier --write '**/*.{ts,tsx}'

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

check: format test-coverage build schema typecheck _git_status