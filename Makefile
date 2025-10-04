.PHONY: install
install:
	npm install

# Populate vital-articles.json
.PHONY: fetch-vital
fetch-vital:
	node --experimental-strip-types fetch-vital-articles.ts

# Recompile on file change
.PHONY: watch
watch: install
	node_modules/.bin/tsc --watch

# Compile frontend assets and publish to GitHub Pages
.PHONY: deploy
deploy: install
	[[ -z "$$(git status --porcelain)" ]]
	git branch -D gh-pages &> /dev/null || true
	git checkout -b gh-pages
	node_modules/.bin/tsc
	rm .gitignore
	git add -A
	git commit -m 'Compile assets for GitHub Pages' -n
	git branch -u origin/gh-pages
	git push -f
	git checkout master
	git branch -D gh-pages
