default: test

install: build schema
  cp dist/pm ~/.local/bin/pm

uninstall:
  rm -f ~/.local/bin/pm

build:
  npm run build

upgrade-bun:
  bun upgrade

format:
  prettier --write '**/*.{ts,tsx}'

typecheck:
  npm run typecheck

schema:
  echo "TODO BUILD SCHEMA"
  # npx tsx tools/build-json-schema.ts

test:
  npm run test

coverage:
  npx vitest run --coverage

_git_status:
  git status

check: test coverage schema typecheck format _git_status