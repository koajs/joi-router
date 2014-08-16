
var assert = require('assert');
var debug = require('debug')('koa-joi-router');
var isGenFn = require('is-gen-fn');
var flatten = require('flatten');
var methods = require('methods');
var router = require('koa-router');
var busboy = require('co-busboy');
var parse = require('co-body');
var Joi = require('joi');
var slice = require('sliced');

module.exports = Router;

function Router(){
  if (!(this instanceof Router))
    return new Router();

  this.routes = [];
  this.router = new router();
}

/**
 * Array of routes
 * @api public
 */

Router.prototype.routes;

/**
 * Return koa middleware
 * @return {Function}
 * @api public
 */

Router.prototype.middleware = function middleware(){
  return this.router.middleware();
}

/**
 * Adds a route to this router, storing the route
 * in `this.routes`.
 *
 * Example:
 *
 *   var admin = router();
 *
 *   admin.route({
 *     method: 'get',
 *     path: '/do/stuff/:id',
 *     handler: function *(next){},
 *     validate: {
 *       headers: Joi object
 *       params: Joi object (:id)
 *       query: Joi object (validate key/val pairs in the querystring)
 *       body: Joi object (the request payload body) (json or form)
 *       maxBody: '64kb' // (json, x-www-form-urlencoded only - not stream size) optional
 *       type: 'json|form|multipart' (required when body is specified)
 *       failure: 400 // http error code to use
 *     },
 *     meta: { // this is ignored but useful for doc generators etc
 *       desc: 'We can use this for docs generation.'
 *       produces: ['application/json']
 *       model: {} // response object definition
 *     }
 *   })
 *
 * @param {Object} spec
 * @return {Router} self
 * @api public
 */

Router.prototype.route = function route(spec) {
  this._validateRouteSpec(spec);
  this.routes.push(spec);

  debug('add %s "%s"', spec.method, spec.path);

  var bodyParser = makeBodyParser(spec);
  var validator = makeValidator(spec);
  var handlers = flatten(spec.handler);

  var args = [
      spec.path
    , spec.method
    , assignParams
    , bodyParser
    , validator
  ].concat(handlers);

  this.router.register.apply(this.router, args);
  return this;
}

/**
 * Validate the spec passed to route()
 *
 * @param {Object} spec
 * @api private
 */

Router.prototype._validateRouteSpec = function validateRouteSpec(spec){
  assert(spec, 'missing spec');

  var ok = 'string' == typeof spec.path || spec.path instanceof RegExp;
  assert(ok, 'invalid route path');

  checkHandler(spec);
  checkMethods(spec);
  checkValidators(spec);
}

/**
 * @api private
 */

function checkHandler(spec){
  if (!Array.isArray(spec.handler))
    spec.handler = [spec.handler];

  return spec.handler.forEach(isGeneratorFunction);
}

/**
 * @api private
 */

function isGeneratorFunction(handler){
  assert(isGenFn(handler), 'route handler must be a GeneratorFunction');
}

/**
 * Validate the spec.method
 *
 * @param {Object} spec
 * @api private
 */

function checkMethods(spec){
  assert(spec.method, 'missing route methods');

  if ('string' == typeof spec.method)
    spec.method = spec.method.split(' ');

  if (!Array.isArray(spec.method))
    throw new TypeError('route methods must be an array or string');

  if (0 === spec.method.length)
    throw new Error('missing route method');

  spec.method.forEach(function(method, i) {
    assert('string' == typeof method, 'route method must be a string');
    spec.method[i] = method.toLowerCase();
  });
}

/**
 * Validate the spec.validators
 *
 * @param {Object} spec
 * @api private
 */

function checkValidators(spec){
  if (!spec.validate) return;

  if (spec.validate.body) {
    var text = 'validate.type must be declared when using validate.body';
    assert(/json|form/.test(spec.validate.type), text);
  }

  if (spec.validate.type) {
    var text = 'validate.type must be either json, form, multipart or stream';
    assert(/json|form|multipart|stream/i.test(spec.validate.type), text);
  }

  // default HTTP status code for failures
  if (!spec.validate.failure)
    spec.validate.failure = 400;
}

/**
 * Creates body parser middleware.
 *
 * @param {Object} spec
 * @return {GeneratorFunction}
 * @api private
 */

function makeBodyParser(spec) {
  return function* parsePayload(next) {
    if (!(spec.validate && spec.validate.type)) return yield next;

    switch (spec.validate.type) {
      case 'json':
        if (!this.request.is('json'))
          return this.throw(400, 'expected json');
        var opts = { limit: spec.validate.maxBody };
        this.request.body = yield parse.json(this, opts);
        break;

      case 'form':
        if (!this.request.is('urlencoded'))
          return this.throw(400, 'expected x-www-form-urlencoded');
        var opts = { limit: spec.validate.maxBody };
        this.request.body = yield parse.form(this, opts);
        break;

      case 'stream':
      case 'multipart':
        if (!this.request.is('multipart/*'))
          return this.throw(400, 'expected multipart');
        var opts = spec.validate.multipartOptions || {}; // TODO document this
        opts.autoFields = true;
        this.request.parts = busboy(this, opts);
        break;
    }

    yield next;
  }
}

/**
 * Creates validator middleware.
 *
 * @param {Object} spec
 * @return {GeneratorFunction}
 * @api private
 */

function makeValidator(spec) {
  var props = 'header query params body'.split(' ');

  return function* validator(next) {
    if (!spec.validate) return yield next;

    for (var i = 0; i < props.length; ++i) {
      var prop = props[i];
      if (spec.validate[prop]) {
        yield validateInput(prop, this.request, spec.validate);
      }
    }

    yield next;

    if (spec.validate.output) {
      yield validateOutput(spec);
    }
  }
}

/**
 * Middleware which creates `request.params`.
 *
 * @api private
 */

function* assignParams(next){
  this.request.params = toObject(this.params);
  yield next;
}

/**
 * Converts an object-like object into a real object.
 * This is necessary to convert koa-route params
 * objects into real objects so that they are compatible
 * with Joi.
 *
 * @param {Array} arr
 * @return {Object}
 * @api private
 */

function toObject(arr) {
  var ret = {};
  var keys = Object.keys(arr);
  for (var i = 0; i < keys.length; ++i) {
    ret[keys[i]] = arr[keys[i]];
  }
  return ret;
};

/**
 * Creates an input validation thunk for the given
 * request data.
 *
 * @param {String} prop
 * @param {koa.Request} request
 * @param {Object} validate
 * @api private
 */

function validateInput(prop, request, validate) {
  return function(cb) {
    debug('validating %s', prop);

    Joi.validate(request[prop], validate[prop], function(err, val) {
      if (err) {
        err.status = validate.failure;
        return cb(err);
      }

      // update our request w/ the casted values
      request[prop] = val;
      cb();
    });
  }
}

/**
 * Creates an output validation thunk for response body.
 *
 * @param {Object} spec
 * @api private
 */

function validateOutput(spec) {
  return function(cb) {
    debug('validating output');
    var ctx = this;

    Joi.validate(ctx.body, spec.validate.output, function(err, val) {
      if (err) {
        err.status = 500;
        return cb(err);
      }

      // update our request w/ the casted values
      ctx.body = val;
      cb();
    });
  }
}

/**
 * Routing shortcuts for all HTTP methods
 *
 * Example:
 *
 *    var admin = router();
 *
 *    admin.get('/user', function *() {
 *      this.body = this.session.user;
 *    })
 *
 *    var validator = Joi().object().keys({ name: Joi.string() });
 *    var config = { validate: { body: validator }};
 *
 *    admin.post('/user', config, function *(){
 *      console.log(this.body);
 *    })
 *
 *    admin.post('/account', function *(){
 *       // ...
 *    });
 *
 * @param {String} path
 * @param {Object} [config] optional
 * @param {GeneratorFunction} handler
 * @return {App} self
 */

methods.forEach(function(method) {
  method = method.toLowerCase();

  Router.prototype[method] = function(path) {
    // apth, handler1, hadnler2, ...
    // path, config, hadnler1
    // path config, handler1, handler2, ...

    var fns;
    var config;

    switch (typeof arguments[1]) {
      case 'function':
        config = {};
        fns = slice(arguments, 1);
        break;
      case 'object':
        config = arguments[1];
        fns = slice(arguments, 2);
        break;
    }

    var spec = {
        path: path
      , method: method
      , handler: fns
    }

    Object.keys(config).forEach(function(key) {
      spec[key] = config[key];
    });

    this.route(spec);
    return this;
  }
});

