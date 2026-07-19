.PHONY: install format lint typecheck assets test coverage build validate package release-candidate check

NPM ?= npm

install:
	$(NPM) ci

format:
	$(NPM) run format

lint:
	$(NPM) run lint

typecheck:
	$(NPM) run typecheck

assets:
	$(NPM) run assets:generate

test:
	$(NPM) test

coverage:
	$(NPM) run test:coverage

build:
	$(NPM) run build

validate:
	$(NPM) run validate:plugin

package:
	$(NPM) run package:plugin

release-candidate:
	$(NPM) run release:candidate

check:
	$(NPM) run check
