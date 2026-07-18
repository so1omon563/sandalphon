.PHONY: install format lint typecheck test coverage build validate package check

NPM ?= npm

install:
	$(NPM) ci

format:
	$(NPM) run format

lint:
	$(NPM) run lint

typecheck:
	$(NPM) run typecheck

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

check:
	$(NPM) run check
