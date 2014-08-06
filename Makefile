
test:
	@NODE_ENV=test ./node_modules/.bin/mocha -A --harmony-generators

test-cov:
	@NODE_ENV=test node --harmony-generators \
		node_modules/.bin/istanbul cover \
		./node_modules/.bin/_mocha \
		-- -u exports \
		-A

open-cov:
	open coverage/lcov-report/index.html

.PHONY: test test-cov open-cov
