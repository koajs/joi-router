'use strict';

const assert = require('assert');
const debug = require('debug')('koa-joi-router');
const isGenFn = require('is-gen-fn');
const flatten = require('flatten');
const methods = require('methods');
const KoaRouter = require('@koa/router');
const busboy = require('await-busboy');
const parse = require('co-body');
const Joi = require('joi');
const slice = require('sliced');
const delegate = require('delegates');
const clone = require('clone');
const OutputValidator = require('./output-validator');

module.exports = Router;

// expose Joi for use in applications
Router.Joi = Joi;

function Router() {
  if (!(this instanceof Router)) {
    return new Router();
  }

  this.routes = [];
  this.router = new KoaRouter();
}

/**
 * Array of routes
 *
 * Router.prototype.routes;
 * @api public
 */

/**
 * Delegate methods to internal router object
 */

delegate(Router.prototype, 'router')
  .method('prefix')
  .method('use')
  .method('param');

/**
 * Return koa middleware
 * @return {Function}
 * @api public
 */

Router.prototype.middleware = function middleware() {
  return this.router.routes();
};

/**
 * Adds a route or array of routes to this router, storing the route
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
 *       header: Joi object
 *       params: Joi object (:id)
 *       query: Joi object (validate key/val pairs in the querystring)
 *       body: Joi object (the request payload body) (json or form)
 *       maxBody: '64kb' // (json, x-www-form-urlencoded only - not stream size)
 *                       // optional
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
  if (Array.isArray(spec)) {
    for (let i = 0; i < spec.length; i++) {
      this._addRoute(spec[i]);
    }
  } else {
    this._addRoute(spec);
  }

  return this;
};

/**
 * Adds a route to this router, storing the route
 * in `this.routes`.
 *
 * @param {Object} spec
 * @api private
 */

Router.prototype._addRoute = function addRoute(spec) {
  this._validateRouteSpec(spec);
  this.routes.push(spec);

  debug('add %s "%s"', spec.method, spec.path);

  const bodyParser = makeBodyParser(spec);
  const specExposer = makeSpecExposer(spec);
  const validator = makeValidator(spec);
  const preHandlers = spec.pre ? flatten(spec.pre) : [];
  const handlers = flatten(spec.handler);

  const args = [
    spec.path
  ].concat(preHandlers, [
    prepareRequest,
    specExposer,
    bodyParser,
    validator
  ], handlers);

  const router = this.router;

  spec.method.forEach((method) => {
    router[method].apply(router, args);
  });
};

/**
 * Validate the spec passed to route()
 *
 * @param {Object} spec
 * @api private
 */

Router.prototype._validateRouteSpec = function validateRouteSpec(spec) {
  assert(spec, 'missing spec');

  const ok = typeof spec.path === 'string' || spec.path instanceof RegExp;
  assert(ok, 'invalid route path');

  checkHandler(spec);
  checkPreHandler(spec);
  checkMethods(spec);
  checkValidators(spec);
};

/**
 * @api private
 */

function checkHandler(spec) {
  if (!Array.isArray(spec.handler)) {
    spec.handler = [spec.handler];
  }

  return flatten(spec.handler).forEach(isSupportedFunction);
}

/**
 * @api private
 */

function checkPreHandler(spec) {
  if (!spec.pre) {
    return;
  }

  if (!Array.isArray(spec.pre)) {
    spec.pre = [spec.pre];
  }

  return flatten(spec.pre).forEach(isSupportedFunction);
}

/**
 * @api private
 */

function isSupportedFunction(handler) {
  assert.equal('function', typeof handler, 'route handler must be a function');

  if (isGenFn(handler)) {
    throw new Error(`route handlers must not be GeneratorFunctions
       Please use "async function" or "function".`);
  }
}

/**
 * Validate the spec.method
 *
 * @param {Object} spec
 * @api private
 */

function checkMethods(spec) {
  assert(spec.method, 'missing route methods');

  if (typeof spec.method === 'string') {
    spec.method = spec.method.split(' ');
  }

  if (!Array.isArray(spec.method)) {
    throw new TypeError('route methods must be an array or string');
  }

  if (spec.method.length === 0) {
    throw new Error('missing route method');
  }

  spec.method.forEach((method, i) => {
    assert(typeof method === 'string', 'route method must be a string');
    spec.method[i] = method.toLowerCase();
  });
}

/**
 * Validate the spec.validators
 *
 * @param {Object} spec
 * @api private
 */

function checkValidators(spec) {
  if (!spec.validate) return;

  let text;
  if (spec.validate.body) {
    text = 'validate.type must be declared when using validate.body';
    assert(/json|form/.test(spec.validate.type), text);
  }

  if (spec.validate.type) {
    text = 'validate.type must be either json, form, multipart or stream';
    assert(/json|form|multipart|stream/i.test(spec.validate.type), text);
  }

  if (spec.validate.output) {
    spec.validate._outputValidator = new OutputValidator(spec.validate.output);
  }

  // default HTTP status code for failures
  if (!spec.validate.failure) {
    spec.validate.failure = 400;
  }
}

/**
 * Does nothing
 * @param  {[type]}   ctx  [description]
 * @param  {Function} next [description]
 * @return {async function}        [description]
 * @api private
 */

async function noopMiddleware(ctx, next) {
  return await next();
}

/**
 * Handles parser internal errors
 * @param  {Object} spec         [description]
 * @param  {function} parsePayload [description]
 * @return {async function}              [description]
 * @api private
 */

function wrapError(spec, parsePayload) {
  return async function errorHandler(ctx, next) {
    try {
      await parsePayload(ctx, next);
    } catch (err) {
      captureError(ctx, 'type', err);
      if (spec.validate.continueOnError) {
        return await next();
      } else {
        return ctx.throw(err);
      }
    }
  };
}

/**
 * Creates JSON body parser middleware.
 *
 * @param {Object} spec
 * @return {async function}
 * @api private
 */

function makeJSONBodyParser(spec) {
  const opts = spec.validate.jsonOptions || {};
  if (typeof opts.limit === 'undefined') {
    opts.limit = spec.validate.maxBody;
  }

  return async function parseJSONPayload(ctx, next) {
    if (!ctx.request.is('json')) {
      return ctx.throw(400, 'expected json');
    }

    // eslint-disable-next-line require-atomic-updates
    ctx.request.body = ctx.request.body || await parse.json(ctx, opts);
    await next();
  };
}

/**
 * Creates form body parser middleware.
 *
 * @param {Object} spec
 * @return {async function}
 * @api private
 */

function makeFormBodyParser(spec) {
  const opts = spec.validate.formOptions || {};
  if (typeof opts.limit === 'undefined') {
    opts.limit = spec.validate.maxBody;
  }
  return async function parseFormBody(ctx, next) {
    if (!ctx.request.is('urlencoded')) {
      return ctx.throw(400, 'expected x-www-form-urlencoded');
    }

    // eslint-disable-next-line require-atomic-updates
    ctx.request.body = ctx.request.body || await parse.form(ctx, opts);
    await next();
  };
}

/**
 * Creates stream/multipart-form body parser middleware.
 *
 * @param {Object} spec
 * @return {async function}
 * @api private
 */

function makeMultipartParser(spec) {
  const opts = spec.validate.multipartOptions || {};
  if (typeof opts.autoFields === 'undefined') {
    opts.autoFields = true;
  }
  return async function parseMultipart(ctx, next) {
    if (!ctx.request.is('multipart/*')) {
      return ctx.throw(400, 'expected multipart');
    }
    ctx.request.parts = busboy(ctx, opts);
    await next();
  };
}

/**
 * Creates body parser middleware.
 *
 * @param {Object} spec
 * @return {async function}
 * @api private
 */

function makeBodyParser(spec) {
  if (!(spec.validate && spec.validate.type)) return noopMiddleware;

  switch (spec.validate.type) {
    case 'json':
      return wrapError(spec, makeJSONBodyParser(spec));
    case 'form':
      return wrapError(spec, makeFormBodyParser(spec));
    case 'stream':
    case 'multipart':
      return wrapError(spec, makeMultipartParser(spec));
    default:
      throw new Error(`unsupported body type: ${spec.validate.type}`);
  }
}

/**
 * @api private
 */

function captureError(ctx, type, err) {
  // expose Error message to JSON.stringify()
  err.msg = err.message;
  if (!ctx.invalid) ctx.invalid = {};
  ctx.invalid[type] = err;
}

/**
 * Creates validator middleware.
 *
 * @param {Object} spec
 * @return {async function}
 * @api private
 */

function makeValidator(spec) {
  const props = 'header query params body'.split(' ');

  return async function validator(ctx, next) {
    if (!spec.validate) return await next();

    let err;

    for (let i = 0; i < props.length; ++i) {
      const prop = props[i];

      if (spec.validate[prop]) {
        if (spec.validate[prop] instanceof Joi.constructor && typeof (spec.validate[prop]['validate']||null) === 'function') {
          err = validateInput(prop, null, ctx, spec.validate);
          if (err) {
            captureError(ctx, prop, err);
            if (!spec.validate.continueOnError) return ctx.throw(err);
          }
        } else {
          for (let field of Object.keys(spec.validate[prop])) {
            err = validateInput(prop, field, ctx, spec.validate);
            if (err) {
              captureError(ctx, prop, err);
              if (!spec.validate.continueOnError) return ctx.throw(err);
            }
          }
        }
      }
    }

    await next();

    if (spec.validate._outputValidator) {
      debug('validating output');

      err = spec.validate._outputValidator.validate(ctx);
      if (err) {
        err.status = 500;
        return ctx.throw(err);
      }
    }
  };
}

/**
 * Exposes route spec
 * @param {Object} spec The route spec
 * @returns {async Function} Middleware
 * @api private
 */
function makeSpecExposer(spec) {
  const defn = clone(spec);
  return async function specExposer(ctx, next) {
    ctx.state.route = defn;
    await next();
  };
}

/**
 * Middleware which creates `request.params`.
 *
 * @api private
 */

async function prepareRequest(ctx, next) {
  ctx.request.params = ctx.params;
  await next();
}

/**
 * Validates request[prop] data with the defined validation schema.
 *
 * @param {String} prop
 * @param {koa.Request} request
 * @param {Object} validate
 * @returns {Error|undefined}
 * @api private
 */

function validateInput(prop, field, ctx, validate) {
  debug('validating %s : %s', prop, field);
  const request = ctx.request;
  let res;
  if (validate[prop] instanceof Joi.constructor && typeof (validate[prop]['validate']||null) === 'function') {
    res = validate[prop].validate(request[prop], (validate.validateOptions || {}));
  } else {
    res = validate[prop][field].validate(request[prop][field], (validate.validateOptions || {}));
  }

  if (res.error) {
    res.error.status = validate.failure;
    return res.error;
  }

  // update our request w/ the casted values
  switch (prop) {
    case 'header': // request.header is getter only, cannot set it
    case 'query': // setting request.query directly causes casting back to strings
      Object.keys(res.value||{}).forEach((key) => {
        request[prop][key] = res.value[key];
      });
      break;
    case 'body':
      request[prop][field] = res.value;
      break;
    case 'params':
      if (field !== null) {
        request.params[field] = ctx.params[field] = res.value;
      } else {
        request.params = ctx.params = res.value;
      }
      break;
  }
}

/**
 * Routing shortcuts for all HTTP methods
 *
 * Example:
 *
 *    var admin = router();
 *
 *    admin.get('/user', async function(ctx) {
 *      ctx.body = ctx.session.user;
 *    })
 *
 *    var validator = Joi().object().keys({ name: Joi.string() });
 *    var config = { validate: { body: validator }};
 *
 *    admin.post('/user', config, async function(ctx){
 *      console.log(ctx.body);
 *    })
 *
 *    async function commonHandler(ctx){
 *      // ...
 *    }
 *    admin.post('/account', [commonHandler, async function(ctx){
 *      // ...
 *    }]);
 *
 * @param {String} path
 * @param {Object} [config] optional
 * @param {async function|async function[]} handler(s)
 * @return {App} self
 */

methods.forEach((method) => {
  method = method.toLowerCase();

  Router.prototype[method] = function(path) {
    // path, handler1, handler2, ...
    // path, config, handler1
    // path, config, handler1, handler2, ...
    // path, config, [handler1, handler2], handler3, ...

    let fns;
    let config;

    if (typeof arguments[1] === 'function' || Array.isArray(arguments[1])) {
      config = {};
      fns = slice(arguments, 1);
    } else if (typeof arguments[1] === 'object') {
      config = arguments[1];
      fns = slice(arguments, 2);
    }

    const spec = {
      path: path,
      method: method,
      handler: fns
    };

    Object.assign(spec, config);

    this.route(spec);
    return this;
  };
});
