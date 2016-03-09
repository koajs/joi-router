#joi-router

Easy, rich and fully validated [koa](http://koajs.com) routing.

[![Build Status](https://travis-ci.org/koajs/joi-router.svg?branch=master)](https://travis-ci.org/koajs/joi-router)
[![Coverage Status](https://img.shields.io/coveralls/koajs/joi-router.svg)](https://coveralls.io/r/koajs/joi-router)
[![npm](http://img.shields.io/npm/v/koa-joi-router.svg)](https://www.npmjs.org/package/koa-joi-router)

#### Features:

- built in input validation using [joi](https://github.com/hapijs/joi)
- built in [output validation](#validating-output) using [joi](https://github.com/hapijs/joi)
- built in body parsing using [co-body](https://github.com/visionmedia/co-body) and [co-busboy](https://github.com/cojs/busboy)
- built on the great [koa-router](https://github.com/alexmingoia/koa-router)
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

```js
var koa = require('koa');
var router = require('koa-joi-router');
var Joi = router.Joi;

var public = router();

public.get('/', function*(){
  this.body = 'hello joi-router!';
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
  handler: function*(){
    var user = yield createUser(this.request.body);
    this.status = 201;
    this.body = {
      userId: user.id,
      name: user.name
    };
  }
});

var app = koa();
app.use(public.middleware());
app.listen();
```

## Usage
`koa-joi-router` returns a constructor which you use to define your routes.
The design is such that you construct multiple router instances, one for
each section of your application which you then add as koa middleware.

```js
var router = require('koa-joi-router');
var Joi = router.Joi;

var pub = router();
var admin = router();
var auth = router();

// add some routes ..

var app = koa();
koa.use(pub.middleware());
koa.use(admin.middleware());
koa.use(auth.middleware());
```

## Module properties

### .Joi

It is **HIGHLY RECOMMENDED** you use this bundled version of Joi
to avoid bugs related to passing an object created with a different
release of Joi into the router.

```js
var koa = require('koa');
var router = require('koa-joi-router');
var Joi = router.Joi;
```

## Router instance methods

### .route()

Adds a new route to the router. `route()` accepts an object or array of objects describing everything about
the routes behavior.

```js
var router = require('koa-joi-router');
var public = router();

var routes = [
  {
    method: 'post',
    path: '/users',
    handler: function*(){}
  },
  {
    method: 'get',
    path: '/users',
    handler: function*(){}
  }
];

public.route(routes);
```

or

```js
var router = require('koa-joi-router');
var public = router();

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
  handler: function*(){
    yield createUser(this.request.body);
    this.status = 201;
  },
  meta: { this: { is: 'ignored' }}
});
```

##### .route() options

- `method`: **required** HTTP method like "get", "post", "put", etc
- `path`: **required** string
- `validate`
  - `header`: object which conforms to [Joi](https://github.com/hapijs/joi) validation
  - `query`: object which conforms to [Joi](https://github.com/hapijs/joi) validation
  - `params`: object which conforms to [Joi](https://github.com/hapijs/joi) validation
  - `body`: object which conforms to [Joi](https://github.com/hapijs/joi) validation
  - `maxBody`: max incoming body size for forms or json input
  - `failure`: HTTP response code to use when input validation fails. default `400`
  - `type`: if validating the request body, this is **required**. either `form`, `json` or `multipart`
  - `output`: see [output validation](#validating-output)
  - `continueOnError`: if validation fails, this flags determines if `koa-joi-router` should [continue processing](#handling-errors) the middleware stack or stop and respond with an error immediately. useful when you want your route to handle the error response. default `false`
- `handler`: **required** GeneratorFunction
- `meta`: meta data about this route. `koa-joi-router` ignores this but stores it along with all other route data

### .get(),post(),put(),del() etc - HTTP methods

`koa-joi-router` supports the traditional `router.get()`, `router.post()` type APIs
as well.

```js
var router = require('koa-joi-router');
var admin = router();

// signature: router.method(path [, config], handler [, handler])

admin.put('/thing', handler);
admin.get('/thing', middleware, handler);
admin.post('/thing', config, handler);
admin.del('/thing', config, middleware, handler);
```

### .use()

When you need to run middleware before all routes, OR, if you just need to run
middleware before a specific path, this method is for you.

To run middleware before all routes, pass your middleware directly:

```js
var router = require('koa-joi-router');
var users = router();

users.get('/something', handler);
users.use(runThisBeforeAllRoutes);
```

It doesn't matter if you define your routes before or after you call `.use()`,
the middleware passed to `.use()` will run before your routes and only when
the path matches.

To run middleware before a specific route, also pass the optional `path`:

```js
var router = require('koa-joi-router');
var users = router();

users.get('/:id', handler);
users.use('/:id', runThisBeforeHandler);
```

### .prefix()

Defines a route prefix for all defined routes. This is handy in "mounting" scenarios.

```js
var router = require('koa-joi-router');
var users = router();

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
var router = require('koa-joi-router');
var public = router();

public.get('/home', homepage);

var app = koa();
app.use(public.middleware()); // wired up
app.listen();
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
  handler: function *(){
    console.log(this.request.body); // the incoming json as an object
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
  handler: function *(){
    console.log(this.request.body) // the incoming form as an object
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
If successful, `ctx.request.parts` will be set to a
[co-busboy](https://github.com/cojs/busboy) object.

```js
admin.route({
  method: 'post',
  path: '/blog',
  validate: { type: 'multipart' },
  handler: function *(){
    var parts = yield this.request.parts;
    var part;

    while (part = yield parts) {
      // do something with the incoming part stream
      part.pipe(someOtherStream);
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
  handler: function *(){
    console.log(this.request.body, this.request.parts); // undefined undefined
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
take action e.g. to generate API documentation etc.

```js
var router = require('koa-joi-router');
var admin = router();
admin.post('/thing', { validate: { type: 'multipart' }}, handler);

console.log(admin.routes);
// [ { path: '/thing',
//     method: [ 'post' ],
//     handler: [ [Function] ],
//     validate: { type: 'multipart' } } ]
```

## Path RegExps

Sometimes you need `RegExp`-like syntax support for your route definitions.
Because [path-to-regexp](https://github.com/pillarjs/path-to-regexp)
supports it, so do we!

```js
var router = require('koa-joi-router');
var admin = router();
admin.get('/blog/:year(\\d{4})-:day(\\d{2})-:article(\\d{3})', function*(){});
```

## Multiple methods support

Defining a route for multiple HTTP methods in a single shot is supported.

```js
var router = require('koa-joi-router');
var admin = router();
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
var router = require('koa-joi-router');
var admin = router();
admin.route({
  path: '/',
  method: ['POST', 'PUT'],
  handler: [ yourMiddleware, yourHandler ]
});
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
  handler: function *(){
    if (this.invalid) {
      console.log(this.invalid.header);
      console.log(this.invalid.query);
      console.log(this.invalid.params);
      console.log(this.invalid.body);
      console.log(this.invalid.type);
    }

    this.body = yield render('add', { errors: this.invalid });
  }
});
```

## Development

### Running tests

- `make test` runs tests
- `make test-cov` runs tests + test coverage
- `make open-cov` opens test coverage results in your browser

## Sponsored by

[Pebble Technology!](https://www.pebble.com)

## LICENSE

[MIT](https://github.com/koajs/joi-router/blob/master/LICENSE)
