#joi-router

Easy, rich and fully validated [koa][] routing.

[![NPM version][npm-image]][npm-url]
[![build status][travis-image]][travis-url]
[![Test coverage][codecov-image]][codecov-url]
[![David deps][david-image]][david-url]
[![npm download][download-image]][download-url]

[npm-image]: https://img.shields.io/npm/v/koa-joi-router.svg?style=flat-square
[npm-url]: https://npmjs.org/package/koa-joi-router
[travis-image]: https://img.shields.io/travis/koajs/joi-router.svg?style=flat-square
[travis-url]: https://travis-ci.org/koajs/joi-router
[codecov-image]: https://codecov.io/github/koajs/joi-router/coverage.svg?branch=master
[codecov-url]: https://codecov.io/github/koajs/joi-router?branch=master
[david-image]: https://img.shields.io/david/koajs/joi-router.svg?style=flat-square
[david-url]: https://david-dm.org/koajs/joi-router
[download-image]: https://img.shields.io/npm/dm/koa-joi-router.svg?style=flat-square
[download-url]: https://npmjs.org/package/koa-joi-router
[co]: https://github.com/tj/co
[koa]: http://koajs.com
[co-body]: https://github.com/visionmedia/co-body
[await-busboy]: https://github.com/aheckmann/await-busboy
[joi]: https://github.com/hapijs/joi
[koa-router]: https://github.com/alexmingoia/koa-router
[generate API documentation]: https://github.com/a-s-o/koa-docs
[path-to-regexp]: https://github.com/pillarjs/path-to-regexp

#### Features:

- built in input validation using [joi][]
- built in [output validation](#validating-output) using [joi][]
- built in body parsing using [co-body][] and [await-busboy][]
- built on the great [koa-router][]
- [exposed route definitions](#routes) for later analysis
- string path support
- [regexp-like path support](#path-regexps)
- [multiple method support](#multiple-methods-support)
- [multiple middleware support](#multiple-middleware-support)
- [continue on error support](#handling-errors)
- [router prefixing support](#prefix)
- [router level middleware support](#use)
- meta data support
- HTTP 405 and 501 support

#### Node compatibility

NodeJS `>= 7.6` is required.

#### Example

```js
const koa = require('koa');
const router = require('koa-joi-router');
const Joi = router.Joi;

const public = router();

public.get('/', async (ctx) => {
  ctx.body = 'hello joi-router!';
});

public.route({
  method: 'post',
  path: '/signup',
  validate: {
    body: {
      name: Joi.string().max(100),
      email: Joi.string().lowercase().email(),
      password: Joi.string().max(100),
      _csrf: Joi.string().token()
    },
    type: 'form',
    output: {
      200: {
        body: {
          userId: Joi.string(),
          name: Joi.string()
        }
      }
    }
  },
  handler: async (ctx) => {
    const user = await createUser(ctx.request.body);
    ctx.status = 201;
    ctx.body = user;
  }
});

const app = koa();
app.use(public.middleware());
app.listen();
```

## Usage
`koa-joi-router` returns a constructor which you use to define your routes.
The design is such that you construct multiple router instances, one for
each section of your application which you then add as koa middleware.

```js
const router = require('koa-joi-router');
const Joi = router.Joi;

const pub = router();
const admin = router();
const auth = router();

// add some routes ..
pub.get('/some/path', async () => {});
admin.get('/admin', async () => {});
auth.post('/auth', async () => {});

const app = koa();
koa.use(pub.middleware());
koa.use(admin.middleware());
koa.use(auth.middleware());
app.listen();
```

## Module properties

### .Joi

It is **HIGHLY RECOMMENDED** you use this bundled version of Joi
to avoid bugs related to passing an object created with a different
release of Joi into the router.

```js
const koa = require('koa');
const router = require('koa-joi-router');
const Joi = router.Joi;
```

## Router instance methods

### .route()

Adds a new route to the router. `route()` accepts an object or array of objects
describing route behavior.

```js
const router = require('koa-joi-router');
const public = router();

public.route({
  method: 'post',
  path: '/signup',
  validate: {
    header: joiObject,
    query: joiObject,
    params: joiObject,
    body: joiObject,
    maxBody: '64kb',
    output: { '400-600': { body: joiObject } },
    type: 'form',
    failure: 400,
    continueOnError: false
  },
  handler: async (ctx) => {
    await createUser(ctx.request.body);
    ctx.status = 201;
  },
  meta: { 'this': { is: 'stored internally with the route definition' }}
});
```

or

```js
const router = require('koa-joi-router');
const public = router();

const routes = [
  {
    method: 'post',
    path: '/users',
    handler: async (ctx) => {}
  },
  {
    method: 'get',
    path: '/users',
    handler: async (ctx) => {}
  }
];

public.route(routes);
```

##### .route() options

- `method`: **required** HTTP method like "get", "post", "put", etc
- `path`: **required** string
- `validate`
  - `header`: object which conforms to [Joi][] validation
  - `query`: object which conforms to [Joi][] validation
  - `params`: object which conforms to [Joi][] validation
  - `body`: object which conforms to [Joi][] validation
  - `maxBody`: max incoming body size for forms or json input
  - `failure`: HTTP response code to use when input validation fails. default `400`
  - `type`: if validating the request body, this is **required**. either `form`, `json` or `multipart`
  - `output`: see [output validation](#validating-output)
  - `continueOnError`: if validation fails, this flags determines if `koa-joi-router` should [continue processing](#handling-errors) the middleware stack or stop and respond with an error immediately. useful when you want your route to handle the error response. default `false`
- `handler`: **required** async function or function
- `meta`: meta data about this route. `koa-joi-router` ignores this but stores it along with all other route data

### .get(),post(),put(),del() etc - HTTP methods

`koa-joi-router` supports the traditional `router.get()`, `router.post()` type APIs
as well.

```js
const router = require('koa-joi-router');
const admin = router();

// signature: router.method(path [, config], handler [, handler])

admin.put('/thing', handler);
admin.get('/thing', middleware, handler);
admin.post('/thing', config, handler);
admin.del('/thing', config, middleware, handler);
```

### .use()

When you need to run middleware before all routes, OR, if you just need to run
middleware before a specific path, this method is for you.

```js
const router = require('koa-joi-router');
const users = router();

users.get('/something', async (ctx, next) => {
  console.log('this logs before your /something handlers');
  await next();
  console.log('this logs after your /something handlers');
});

users.use(async (ctx, next) => {
  console.log('this logs before all other handlers');
  await next();
  console.log('this logs after all other handlers');
});
```

It doesn't matter if you define your routes before or after you call `.use()`,
the middleware passed to `.use()` will run before your routes and only when
the path matches.

To run middleware before a specific route, also pass the optional `path`:

```js
const router = require('koa-joi-router');
const users = router();

users.get('/:id', handler);
users.use('/:id', runThisBeforeHandler);
```

### .prefix()

Defines a route prefix for all defined routes. This is handy in "mounting" scenarios.

```js
const router = require('koa-joi-router');
const users = router();

users.get('/:id', handler);
// GET /users/3 -> 404
// GET /3 -> 200

users.prefix('/user');
// GET /users/3 -> 200
// GET /3 -> 404
```

### .middleware()

Generates routing middleware to be used with `koa`. If this middleware is
never added to your `koa` application, your routes will not work.

```js
const router = require('koa-joi-router');
const public = router();

public.get('/home', homepage);

const app = koa();
app.use(public.middleware()); // wired up
app.listen();
```

## Additions to ctx.state

The route definition for the currently matched route is available
via `ctx.state.route`. This object is not the exact same route
definition object which was passed into koa-joi-router, nor is it
used internally - any changes made to this object will
not have an affect on your running application but is available
to meet your introspection needs.

```js
const router = require('koa-joi-router');
const public = router();
public.get('/hello', async (ctx) => {
  console.log(ctx.state.route);
});
```

## Additions to ctx.request

When using the `validate.type` option, `koa-joi-router` adds a few new properties
to `ctx.request` to faciliate input validation.

### ctx.request.body

The `ctx.request.body` property will be set when either of the following
`validate.type`s are set:

- json
- form

#### json

When `validate.type` is set to `json`, the incoming data must be JSON. If it is not,
validation will fail and the response status will be set to 400 or the value of
`validate.failure` if specified. If successful, `ctx.request.body` will be set to the
parsed request input.

```js
admin.route({
  method: 'post',
  path: '/blog',
  validate: { type: 'json' },
  handler: async (ctx) => {
    console.log(ctx.request.body); // the incoming json as an object
  }
});
```

#### form

When `validate.type` is set to `form`, the incoming data must be form data
(x-www-form-urlencoded). If it is not, validation will fail and the response
status will be set to 400 or the value of `validate.failure` if specified.
If successful, `ctx.request.body` will be set to the parsed request input.

```js
admin.route({
  method: 'post',
  path: '/blog',
  validate: { type: 'form' },
  handler: async (ctx) => {
    console.log(ctx.request.body) // the incoming form as an object
  }
});
```

### ctx.request.parts

The `ctx.request.parts` property will be set when either of the following
`validate.type`s are set:

- multipart

#### multipart

When `validate.type` is set to `multipart`, the incoming data must be multipart data.
If it is not, validation will fail and the response
status will be set to 400 or the value of `validate.failure` if specified.
If successful, `ctx.request.parts` will be set to an
[await-busboy][] object.

```js
admin.route({
  method: 'post',
  path: '/blog',
  validate: { type: 'multipart' },
  handler: async (ctx) => {
    const parts = ctx.request.parts;
    let part;

    try {
      while ((part = await parts)) {
        // do something with the incoming part stream
        part.pipe(someOtherStream);
      }
    } catch (err) {
      // handle the error
    }

    console.log(parts.field.name); // form data
  }
});
```

## Handling non-validated input

_Note:_ if you do not specify a value for `validate.type`, the
incoming payload will not be parsed or validated. It is up to you to
parse the incoming data however you see fit.

```js
admin.route({
  method: 'post',
  path: '/blog',
  validate: { },
  handler: async (ctx) => {
    console.log(ctx.request.body, ctx.request.parts); // undefined undefined
  }
})
```

## Validating output

Validating the output body and/or headers your service generates on a
per-status-code basis is supported. This comes in handy when contracts
between your API and client are strict e.g. any change in response
schema could break your downstream clients. In a very active codebase, this
feature buys you stability. If the output is invalid, an HTTP status 500
will be used.

Let's look at some examples:

### Validation of an individual status code

```js
router.route({
  method: 'post',
  path: '/user',
  validate: {
    output: {
      200: { // individual status code
        body: {
          userId: Joi.string(),
          name: Joi.string()
        }
      }
    }
  },
  handler: handler
});
```

### Validation of multiple individual status codes

```js
router.route({
  method: 'post',
  path: '/user',
  validate: {
    output: {
      '200,201': { // multiple individual status codes
        body: {
          userId: Joi.string(),
          name: Joi.string()
        }
      }
    }
  },
  handler: handler
});
```

### Validation of a status code range

```js
router.route({
  method: 'post',
  path: '/user',
  validate: {
    output: {
      '200-299': { // status code range
        body: {
          userId: Joi.string(),
          name: Joi.string()
        }
      }
    }
  },
  handler: handler
});
```

### Validation of multiple individual status codes and ranges combined

You are free to mix and match ranges and individual status codes.

```js
router.route({
  method: 'post',
  path: '/user',
  validate: {
    output: {
      '200,201,300-600': { // mix it up
        body: {
          userId: Joi.string(),
          name: Joi.string()
        }
      }
    }
  },
  handler: handler
});
```

### Validation of output headers

Validating your output headers is also supported via the `headers` property:

```js
router.route({
  method: 'post',
  path: '/user',
  validate: {
    output: {
      '200,201': {
        body: {
          userId: Joi.string(),
          name: Joi.string()
        },
        headers: Joi.object({ // validate headers too
          authorization: Joi.string().required()
        }).options({
          allowUnknown: true
        })
      },
      '500-600': {
        body: { // this rule only runs when a status 500 - 600 is used
          error_code: Joi.number(),
          error_msg: Joi.string()
        }
      }
    }
  },
  handler: handler
});
```

## Router instance properties

### .routes

Each router exposes it's route definitions through it's `routes` property.
This is helpful when you'd like to introspect the previous definitions and
take action e.g. to [generate API documentation][] etc.

```js
const router = require('koa-joi-router');
const admin = router();
admin.post('/thing', { validate: { type: 'multipart' }}, handler);

console.log(admin.routes);
// [ { path: '/thing',
//     method: [ 'post' ],
//     handler: [ [Function] ],
//     validate: { type: 'multipart' } } ]
```

## Path RegExps

Sometimes you need `RegExp`-like syntax support for your route definitions.
Because [path-to-regexp][]
supports it, so do we!

```js
const router = require('koa-joi-router');
const admin = router();
admin.get('/blog/:year(\\d{4})-:day(\\d{2})-:article(\\d{3})', asycn (ctx, next) => { .. });
```

## Multiple methods support

Defining a route for multiple HTTP methods in a single shot is supported.

```js
const router = require('koa-joi-router');
const admin = router();
admin.route({
  path: '/',
  method: ['POST', 'PUT'],
  handler: fn
});
```

## Multiple middleware support

Often times you may need to add additional, route specific middleware to a
single route.

```js
const router = require('koa-joi-router');
const admin = router();
admin.route({
  path: '/',
  method: ['POST', 'PUT'],
  handler: [ yourMiddleware, yourHandler ]
});
```

## Nested middleware support

You may want to bundle and nest middleware in different ways for reuse and
organization purposes.

```js
const router = require('koa-joi-router');
const admin = router();
const commonMiddleware = [ yourMiddleware, someOtherMiddleware ];
admin.route({
  path: '/',
  method: ['POST', 'PUT'],
  handler: [ commonMiddleware, yourHandler ]
});
```

This also works with the .get(),post(),put(),del(), etc HTTP method helpers.

```js
const router = require('koa-joi-router');
const admin = router();
const commonMiddleware = [ yourMiddleware, someOtherMiddleware ];
admin.get('/', commonMiddleware, yourHandler);
```

## Handling errors

By default, `koa-joi-router` stops processing the middleware stack when either
input validation fails. This means your route will not be reached. If
this isn't what you want, for example, if you're writing a web app which needs
to respond with custom html describing the errors, set the `validate.continueOnError`
flag to true. You can find out if validation failed by checking `ctx.invalid`.

```js
admin.route({
  method: 'post',
  path: '/add',
  validate: {
    type: 'form',
    body: {
      id: Joi.string().length(10)
    },
    continueOnError: true
  },
  handler: async (ctx) => {
    if (ctx.invalid) {
      console.log(ctx.invalid.header);
      console.log(ctx.invalid.query);
      console.log(ctx.invalid.params);
      console.log(ctx.invalid.body);
      console.log(ctx.invalid.type);
    }

    ctx.body = await render('add', { errors: ctx.invalid });
  }
});
```

## Development

### Running tests

- `npm test` runs tests + code coverage + lint
- `npm run lint` runs lint only
- `npm run lint-fix` runs lint and attempts to fix syntax issues
- `npm run test-cov` runs tests + test coverage
- `npm run open-cov` opens test coverage results in your browser
- `npm run test-only` runs tests only

## LICENSE

[MIT](https://github.com/koajs/joi-router/blob/master/LICENSE)

