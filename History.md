8.0.0 / 2021-04-26
==================

- https://github.com/koajs/joi-router/compare/9fa16b6b1..0aa5c45de5
- major bump of @koa/router from 8 to 10 - https://github.com/koajs/router/pull/77/files
  - impact: `router.get('*', ....)` becomes `router.get('(.*)') ....)`

7.0.0 / 2019-12-07
==================

- https://github.com/koajs/joi-router/compare/91f0a42e24c4..9fa16b6b1
- major bump @hapi/joi@15 -> joi@17
  - impact: changes validation error messaging. example: https://github.com/koajs/joi-router/commit/fad66d8acbb51a5ddeb5b961b0d5d3cb9646bf65

6.0.1 / 2019-12-07
==================

- bump deps

6.0.0 / 2019-04-27
==================

  * deps; [semver-major] bump @hapi/joi from 14.x -> 15.x
  * deps; bump eslint, supertest and switch from istanbul to nyc
  * lint; lint all JS #65, switch from pebble to eslint:recommended, remove eslint-plugin-standard
  * refactored; makeBodyParser #86 by swarthy

5.3.0 / 2019-03-04
==================

  * deps; bump await-busboy, koa-router, clone, co-body, debug
  * docs; update description of .use() API by wdanxna
  * tests; fix head response body check

5.2.0 / 2019-01-12
==================

 * added; pre-handler support #66 by swarthy 
 * added; allow form and json parsing options to be configured #75 by nojacko
 * fixed; always fill ctx.invalid even when continueOnError is false #70 by alvarowolfx
 * fixed; do not parse the body if already present #76 by oprogramador
 * deps; update joi to 14.0.6 #77 by pke
 * docs; parsing options #75 by nojacko

5.1.0 / 2018-01-02
==================

 * added; router.param() - #45 by pixeldrew
 * updated; to co-body 5.1.1
 * updated; to koa-router 7.3.0
 * updated; to debug 2.6.9
 * docs; clarified - #42 by paul42
 * docs; clarified - #40 by nicodinh

5.0.0 / 2017-03-09
==================

 * breaking; now requires node >= 7.6
 * added; async/await support
 * removed; generator support
 * removed; makefile in favor of npm scripts
 * deps; use await-busboy
 * deps; updated
 * docs; updated

4.0.0 / 2016-07-28
==================

 * fixed; params casting #26
 * changed; retain casted query values #25
 * removed; support for node < 4.x
 * use aheckmann/koa-router fork with params bugfix #24
 * updated; to Joi 9.0.4
 * updated; to co-body to 4.2.0
 * updated; to co-busboy to 1.3.1
 * updated; to delegates to 1.0.0
 * updated; to flatten to 1.0.2
 * updated; to methods to 1.1.2
 * docs; add koa-docs link

3.1.1 / 2016-04-27
==================

 * fixed; support node 0.12 & friends

3.1.0 / 2016-04-27
==================

 * added; route definition introspection via ctx.state.route #16 [BrainsoftLtd](https://github.com/BrainsoftLtd)
 * added; nested middleware support #14 [reyawn](https://github.com/reyawn)
 * docs; fix typo #13 [simplyianm](https://github.com/simplyianm)

3.0.0 / 2015-12-09
==================

 * BREAKING; support custom output validation per resp status code
 * added; .route() now also supports an array of routes: #7 (martinmicunda)

2.1.2 / 2015-10-10
==================

 * updated; koa-router: 5.2.3

2.1.1 / 2015-09-08
==================

 * play nice with old versions of npm

2.1.0 / 2015-09-08
==================

 * changed; use aheckmann/koa-router (until koa-router merges upstream fixes https://github.com/alexmingoia/koa-router/pull/169)
 * updated; and clean up dependencies
 * added .use() and .prefix() support
 * tests; better exercise of koa-router variations
 * tests; run tests before lint
 * add mocha env to eslint config #3 from wilmoore/eslint-mocha-env
 * add eslint

2.0.0 / 2015-08-18
==================

 * bump koa-router to 5.1.2 (RexExp are no longer first class citizens)
 * bump debug to 2.2.0
 * bump co-body to 4.0.0
 * bump joi to 6.6.1
 * bump busboy, sliced and methods deps
 * update docs
 * expose Joi module
 * support node 0.12 and iojs

1.3.1 / 2015-02-07
==================

 * fixed header validation documentation
 * refactor
 * use yield* next

1.3.0 / 2014-09-20
==================

 * rename proceed option -> continueOnError

1.2.0 / 2014-09-20
==================

 * added; support for continueOnError
 * updated; dependencies

1.1.1 / 2014-08-17
==================

 * updated docs
 * tests; for RegExp support

1.1.0 / 2014-08-15
==================

 * added; output validation support

1.0.0 / 2014-08-06
==================

 * first release
