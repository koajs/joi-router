#koa-joi-router

Easy, rich and fully validated [koa](http://koajs.com) routing.

#### TODO BADGES (travis-ci, coveralls)

#### Features:

- built in input validation using [joi](https://github.com/hapijs/joi)
- built in body parsing using [co-body](https://github.com/visionmedia/co-body) and [co-busboy](https://github.com/cojs/busboy)
- built on [koa-router](https://github.com/alexmingoia/koa-router)
- [exposed route definitions](#routes) for later analysis
- configurable
- string paths
- regexp paths
- multiple paths
- multiple methods
- multiple middleware
- meta data support

```js
var koa = require('koa')
var router = require('koa-joi-router')
var Joi = require('joi')

var public = router()

public.get('/', function*(){
  this.body = 'hello joi-router!'
})

public.route({
  method: 'post'
, path: '/signup'
, validate: {
    body: {
      name: Joi.string().max(100)
    , email: Joi.string().lowercase().email()
    , password: Joi.string().max(100)
    }
  , type: 'form'
  }
, handler: function*(){
    yield createUser(this.request.body)
    this.status = 201
  }
})

var app = koa()
app.use(public.middleware())
app.listen()
```

## Use
`koa-joi-router` returns a constructor which you use to define your routes.
The design is such that you construct multiple router instances, one for
each section of your application.

```js
var router = require('koa-joi-router')
var pub = router()
var admin = router()
var auth = router()
```

### .route()

Adds a new route to the router.

```js
var router = require('koa-joi-router')
var public = router()

public.route({
  method: 'post'
, path: '/signup'
, validate: {
    headers: joiObject
  , query: joiObject
  , params: joiObject
  , body: joiObject
  , maxBody: '64kb'
  , type: 'form'
  , failure: 400
  }
, handler: function*(){
    yield createUser(this.request.body)
    this.status = 201
  }
, meta: { this: { is: 'ignored' }}
})
```

##### options

- `method`: **required** HTTP method like "get", "post", "put", etc
- `path`: **required** either a string or `RegExp`
- `validate`
  - `headers`: object which conforms to [joi](https://github.com/hapijs/joi) validation
  - `query`: object which conforms to [joi](https://github.com/hapijs/joi) validation
  - `params`: object which conforms to [joi](https://github.com/hapijs/joi) validation
  - `body`: object which conforms to [joi](https://github.com/hapijs/joi) validation
  - `maxBody`:
  - `output`: output validator object which conforms to [joi](https://github.com/hapijs/joi) validation
  - `type`: if validating the request body, this is **required**. either `form`, `json` or `multipart`
  - `failure`: HTTP response code to use when validation fails. defaults to `400`.
- `handler`: **required** GeneratorFunction
- `meta`: meta data about this route.

### ctx.request additions

When using `validate.type`, `koa-joi-router` adds a few new properties
to `ctx.request` to faciliate input validation.

##### json
When the input type is set to `json`, providing the input passes validation,
`ctx.request.body` will be set to the parsed input.

```js
admin.route({
  method: 'post'
, path: '/blog'
, validate: { type: 'json' }
, handler: function *(){
    console.log(this.request.body) // the incoming json as an object
  }
})
```

##### form

When the input type is set to `form`, providing the input passes validation,
`ctx.request.body` will be set to the parsed input.

```js
admin.route({
  method: 'post'
, path: '/blog'
, validate: { type: 'form' }
, handler: function *(){
    console.log(this.request.body) // the incoming form as an object
  }
})
```

##### multipart

When the input type is set to `multipart`, providing the input passes validation,
`ctx.request.parts` will be set to a [co-busboy](https://github.com/cojs/busboy)
object.

```js
admin.route({
  method: 'post'
, path: '/blog'
, validate: { type: 'multipart' }
, handler: function *(){
    var parts = yield this.request.parts
    var part

    while (part = yield parts) {
      // do something with the incoming part stream
      part.pipe(someOtherStream)
    }

    console.log(parts.field.name) // form data
  }
})
```

##### non-validated input

_Note:_ if you do not specify a value for `validate.type` then the
incoming body will not be parsed or validated. It is up to you to
parse the incoming data however you see fit.

```js
admin.route({
  method: 'post'
, path: '/blog'
, validate: { }
, handler: function *(){
    console.log(this.request.body, this.request.parts) // undefined undefined
  }
})
```

#### .routes

Each router exposes it's route definitions through it's `routes` property.
This is helpful when you'd like to introspect the previous definitions and
take action e.g. to generate API documentation etc.

```js
var router = require('koa-joi-router')
var admin = router();
admin.post('/thing', { validate: { type: 'multipart' }}, handler)

console.log(admin.routes)
// [ { path: '/thing',
//     method: [ 'post' ],
//     handler: [ [Function] ],
//     validate: { type: 'multipart' } } ]
```


### .middleware()

Generates routing middleware to be used with `koa`. If this middleware is
never added to your `koa` application, your routes will not work.

```js
var router = require('koa-joi-router')
var public = router()

public.get('/home', homepage)

var app = koa()
app.use(public.middleware()) // wired up
app.listen()
```

### HTTP methods

`koa-joi-router` supports the traditional `router.get()`, `router.post()` type APIs
as well. Here's an example:

```js
var router = require('koa-joi-router')
var admin = router();

// signature: router.method(path [, config], handler [, handler])

admin.put('/thing', handler)
admin.get('/thing', middleware, handler)
admin.post('/thing', config, handler)
admin.del('/thing', config, middleware, handler)
```

### HTTP 405 and 501 support

### Tests

To run the tests, clone this repo, navigate to this project and run `make test` or `make test-cov`.

## Sponsored by

[Pebble Technology!](https://getpebble.com)

## LICENSE

[MIT](/LICENSE)
