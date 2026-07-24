.PHONY: install format lint typecheck assets test coverage build companion-install companion-uninstall companion-status companion-start companion-stop companion-recover validate package release-candidate check

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

companion-install:
	$(NPM) run companion:install

companion-uninstall:
	$(NPM) run companion:uninstall

companion-status:
	$(NPM) run companion:status

companion-start:
	$(NPM) run companion:start

companion-stop:
	$(NPM) run companion:stop

companion-recover:
	$(NPM) run companion:recover

validate:
	$(NPM) run validate:plugin

package:
	$(NPM) run package:plugin

release-candidate:
	$(NPM) run release:candidate

check:
	$(NPM) run check
