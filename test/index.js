'use strict';

require('co-mocha');
require('co-supertest');

const router = require('../');
const Koa = require('koa');
const assert = require('assert');
const request = require('supertest');
const http = require('http');
const Joi = require('joi');
const methods = require('methods');
const slice = require('sliced');
const MiddlewareGenerator = require('./test-utils').MiddlewareGenerator;

function makeRouterApp(router) {
  const app = new Koa();
  app.use(router.middleware());
  return app;
}

function test(app) {
  return request(http.createServer(app.callback()));
}

describe('koa-joi-router', () => {
  it('exposes a function', (done) => {
    assert.equal('function', typeof router);
    done();
  });

  it('is a constructor', (done) => {
    const r = router();
    assert(r instanceof router);
    done();
  });

  it('exposes the Joi module', (done) => {
    assert.equal(router.Joi, Joi);
    done();
  });

  describe('routes', () => {
    it('is an array', (done) => {
      const r = router();
      assert(Array.isArray(r.routes), 'expected .routes to be an Array');
      done();
    });
  });

  describe('route()', () => {
    describe('spec argument', () => {
      it('is required', (done) => {
        const r = router();

        assert.throws(() => {
          r.route();
        }, /missing spec/);

        done();
      });

      describe('must contain', () => {
        it('path', (done) => {
          assert.throws(() => {
            router().route({
              method: [],
              handler: () => {}
            });
          }, /invalid route path/);
          done();
        });

        it('at least one method', (done) => {
          assert.throws(() => {
            router().route({
              path: '/',
              handler: () => {}
            });
          }, /missing route method/);

          assert.throws(() => {
            router().route({
              path: '/',
              method: [],
              handler: () => {}
            });
          }, /missing route method/);

          done();
        });

        it('handler', (done) => {
          assert.throws(() => {
            router().route({
              method: ['get'],
              path: '/'
            });
          }, /route handler/);
          done();
        });
      });

      describe('when defining validate', () => {
        it('honors the failure code specified', (done) => {
          const r = router();
          r.route({
            path: '/',
            method: 'get',
            handler: () => {},
            validate: {
              failure: 404
            }
          });

          assert.equal(404, r.routes[0].validate.failure);
          done();
        });
      });

      describe('method', () => {
        it('can be a string or array', (done) => {

          const tests = [
            ['get', 1],
            [['get'], 1],
            [['PUT', 'POST'], 1],
            [null, 0],
            [undefined, 0],
            [{}, 0],
            [['del', {}], 0]
          ];

          const r = router();
          const fn = () => {};

          tests.forEach((test) => {
            const method = test[1] === 0 ?
              assert.throws :
              assert.doesNotThrow;

            method(() => {
              r.route({
                method: test[0],
                path: '/',
                handler: fn
              });
            });
          });

          done();
        });
      });

      describe('path', () => {
        it('can be a string', (done) => {
          const r = router();
          const fn = () => {};

          assert.doesNotThrow(() => {
            r.get('/', fn);
          });

          done();
        });
      });

      describe('handler', () => {
        function testHandler(handler, expectedBody, done) {
          const r = router();

          r.route({
            method: 'get',
            path: '/',
            handler: handler
          });

          return test(makeRouterApp(r)).get('/')
            .expect(expectedBody, done);
        }

        it('can be a single middleware', (done) => {
          const middleware = new MiddlewareGenerator();

          testHandler(middleware.generate(), middleware.getExpectedBody(), done);
        });

        it('can be an array of multiple middleware', (done) => {
          const middleware = new MiddlewareGenerator();

          testHandler([
            middleware.generate(),
            middleware.generate()
          ], middleware.getExpectedBody(), done);
        });

        it('can be nested arrays of multiple middleware', (done) => {
          const middleware = new MiddlewareGenerator();

          testHandler([
            middleware.generate(), [
              middleware.generate(), [
                middleware.generate()
              ]
            ],
            middleware.generate()
          ], middleware.getExpectedBody(), done);
        });
      });
    });

    it('adds route to the routes array', (done) => {
      const r = router();
      assert.equal(0, r.routes.length);

      r.route({
        method: 'put',
        path: '/asdf/:id',
        handler: () => {}
      });

      assert.equal(1, r.routes.length);
      done();
    });

    it('adds routes to the routes array', (done) => {
      const r = router();
      assert.equal(0, r.routes.length);

      r.route([
        {
          method: 'put',
          path: '/asdf/:id',
          handler: () => {}
        },
        {
          method: 'get',
          path: '/asdf/:id',
          handler: () => {}
        }
      ]);

      assert.equal(2, r.routes.length);
      done();
    });

    it('exposes the route definition to the handler context', (done) => {
      const r = router();

      r.route({
        method: 'GET',
        path: '/a',
        validate: {
          query: Joi.object().keys({
            q: Joi.number().min(5).max(8).required()
          }).options({
            allowUnknown: true
          })
        },
        handler: async function handler(ctx) {
          ctx.status = 204;

          try {
            assert.equal('object', typeof ctx.state.route);

            assert(Array.isArray(ctx.state.route.method),
              'route.method should be an array');

            assert.equal(1, ctx.state.route.method.length);
            assert.equal('get', ctx.state.route.method[0]);
            assert.equal('/a', ctx.state.route.path);
            assert(ctx.state.route.validate.query, 'missing spec.validate.query');
            assert('function', typeof ctx.state.route.handler);
            assert.notEqual(handler, ctx.state.route.handler);
          } catch (err) {
            ctx.status = 500;
            ctx.body = err.stack;
          }
        }
      });

      const app = new Koa();
      app.use(r.middleware());
      test(app).get('/a?q=6').expect(204, (err, res) => {
        if (err) console.error(res.text);
        done(err);
      });
    });
  });

  describe('request.params', () => {
    it('are defined based off of the route definition', (done) => {
      const r = router();

      r.route({
        method: 'get',
        path: '/product/:id/:action',
        handler: async function(ctx, next) {
          assert(typeof ctx.params === 'object' && ctx.params !== null,
            'missing params');
          assert.equal(4, ctx.params.id);
          assert.equal('remove', ctx.params.action);
          ctx.status = 200;
        }
      });

      const app = new Koa();
      app.use(r.middleware());
      test(app).get('/product/4/remove').expect(200, done);
    });
  });

  describe('request.body', () => {
    describe('when expected type is', () => {

      describe('json', () => {
        describe('and valid json is sent', () => {
          it('is parsed as json', (done) => {
            const r = router();

            r.route({
              method: 'post',
              path: '/',
              handler: fn,
              validate: {
                type: 'json'
              }
            });

            function fn(ctx, next) {
              ctx.body = ctx.request.body.last + ' ' + ctx.request.body.first;
            }

            const app = new Koa();
            app.use(r.middleware());
            test(app).post('/')
            .send({
              last: 'Heckmann',
              first: 'Aaron'
            })
            .expect(200)
            .expect('Heckmann Aaron', done);
          });
        });

        describe('and non-json is sent', () => {
          it('fails', (done) => {
            const r = router();

            r.route({
              method: 'post',
              path: '/',
              handler: function(ctx) {
                ctx.status = 204;
              },
              validate: {
                type: 'json'
              }
            });

            const app = new Koa();
            app.use(r.middleware());

            test(app)
            .post('/')
            .type('form')
            .send({
              name: 'Pebble'
            })
            .expect(400, done);
          });

          describe('and validate.continueOnError is true', () => {
            it('runs the route and sets ctx.invalid', (done) => {
              const r = router();

              r.route({
                method: 'post',
                path: '/',
                validate: {
                  type: 'json',
                  continueOnError: true
                },
                handler: (ctx) => {
                  ctx.status = 200;
                  ctx.body = ctx.invalid.type.msg;
                }
              });

              const app = new Koa();
              app.use(r.middleware());

              test(app)
              .post('/')
              .type('form')
              .send({
                name: 'Pebble'
              })
              .expect(200)
              .expect('expected json', done);
            });
          });
        });

        describe('and invalid json is sent', () => {
          const invalid = '{' + JSON.stringify({
            name: 'Pebble'
          });

          it('fails', (done) => {
            const r = router();

            r.route({
              method: 'post',
              path: '/',
              handler: (ctx) => {
                ctx.status = 204;
              },
              validate: {
                type: 'json'
              }
            });

            const app = new Koa();
            app.use(r.middleware());

            test(app)
            .post('/')
            .type('json')
            .send(invalid)
            .expect(400, done);
          });

          describe('and validate.continueOnError is true', () => {
            it('runs the route and sets ctx.invalid', (done) => {
              const r = router();

              r.route({
                method: 'post',
                path: '/',
                validate: {
                  type: 'json',
                  continueOnError: true
                },
                handler: (ctx) => {
                  ctx.status = 200;
                  ctx.body = ctx.invalid &&
                    ctx.invalid.type &&
                    ctx.invalid.type.msg;
                }
              });

              const app = new Koa();
              app.use(r.middleware());

              test(app)
              .post('/')
              .type('json')
              .send(invalid)
              .expect(200)
              .expect(/^Unexpected token \{/, done);
            });
          });
        });
      });

      describe('form', () => {
        describe('and valid form data is sent', () => {
          it('is parsed as form data', (done) => {
            const r = router();

            r.route({
              method: 'post',
              path: '/',
              handler: fn,
              validate: {
                type: 'form'
              }
            });

            function fn(ctx) {
              ctx.body = ctx.request.body.last + ' ' + ctx.request.body.first;
            }

            const app = new Koa();
            app.use(r.middleware());

            test(app)
            .post('/')
            .send({
              last: 'Heckmann',
              first: 'Aaron'
            })
            .type('form')
            .expect(200)
            .expect('Heckmann Aaron')
            .end(done);
          });
        });

        describe('and non-form data is sent', () => {
          it('fails', (done) => {
            const r = router();

            r.route({
              method: 'post',
              path: '/',
              handler: (ctx) => {
                ctx.status = 204;
              },
              validate: {
                type: 'form'
              }
            });

            const app = new Koa();
            app.use(r.middleware());

            test(app)
            .post('/')
            .send({
              last: 'heckmann',
              first: 'aaron'
            })
            .type('json')
            .expect(400, done);
          });

          describe('and validate.continueOnError is true', () => {
            it('runs the route and sets ctx.invalid', (done) => {
              const r = router();

              r.route({
                method: 'post',
                path: '/',
                validate: {
                  type: 'form',
                  continueOnError: true
                },
                handler: (ctx) => {
                  ctx.status = 200;
                  ctx.body = ctx.invalid.type.msg;
                }
              });

              const app = new Koa();
              app.use(r.middleware());

              test(app)
              .post('/')
              .send({
                last: 'Heckmann',
                first: 'Aaron'
              })
              .type('json')
              .expect(200)
              .expect('expected x-www-form-urlencoded', done);
            });
          });
        });

        describe('and invalid form data is sent', () => {
          it('fails', (done) => {
            const r = router();

            r.route({
              method: 'post',
              path: '/',
              handler: (ctx) => {
                ctx.status = 204;
              },
              validate: {
                type: 'form'
              }
            });

            const app = new Koa();
            app.use(r.middleware());

            test(app)
            .post('/')
            .expect(400, done);
          });

          describe('and validate.continueOnError is true', () => {
            it('runs the route and sets ctx.invalid', (done) => {
              const r = router();

              r.route({
                method: 'post',
                path: '/',
                validate: {
                  type: 'form',
                  continueOnError: true
                },
                handler: (ctx) => {
                  ctx.status = 200;
                  ctx.body = ctx.invalid.type.msg;
                }
              });

              const app = new Koa();
              app.use(r.middleware());

              test(app)
              .post('/')
              .expect(200)
              .expect('expected x-www-form-urlencoded', done);
            });
          });
        });
      });

      describe('multipart', () => {
        it('is undefined', (done) => {
          const r = router();

          r.route({
            method: 'put',
            path: '/',
            type: 'multipart',
            handler: (ctx) => {
              ctx.status = undefined === ctx.request.body ?
                200 :
                500;
            },
            validate: {
              type: 'multipart'
            }
          });

          const app = new Koa();
          app.use(r.middleware());

          const b = new Buffer(1024);
          b.fill('a');

          test(app)
          .put('/')
          .attach('file1', b)
          .expect(200, done);
        });
      });
    });
  });

  describe('request.parts', () => {
    describe('when expected type is', () => {
      'stream multipart'.split(' ').forEach((type) => {
        describe(type, () => {
          it.only('is a co-busboy object', (done) => {
            const r = router();

            r.route({
              method: 'put',
              path: '/',
              handler: async function(ctx, next) {
                console.log('got to the handler');
                let part; // eslint-disable-line no-unused-vars
                while ((part = await ctx.request.parts)) {}
                console.log('finished awaiting co-body');
                ctx.body = ctx.request.parts.field.color;
              },
              validate: {
                type: type
              }
            });

            const app = new Koa();
            app.use(r.middleware());

            const b = new Buffer(1024);
            b.fill('a');

            test(app)
            .put('/')
            .attach('file1', b)
            .attach('color', new Buffer('green'))
            .expect(200, done);
          });
        });
      });

      describe('not specified', () => {
        it('is undefined', (done) => {
          const r = router();

          r.route({
            method: 'put',
            path: '/',
            handler: (ctx) => {
              ctx.status = undefined === ctx.request.parts ?
                200 :
                500;
            },
            validate: {}
          });

          const app = new Koa();
          app.use(r.middleware());

          const b = new Buffer(1024);
          b.fill('a');

          test(app)
          .put('/')
          .attach('file1', b)
          .expect(200, done);
        });
      });
    });
  });

  describe.skip('validation', () => {
    describe('of querystring', () => {
      describe('with', () => {
        const r = router();

        r.route({
          method: 'get',
          path: '/a',
          validate: {
            query: Joi.object().keys({
              q: Joi.number().min(5).max(8).required(),
              s: Joi.string().alphanum().length(6)
            }).options({
              allowUnknown: true
            })
          },
          handler: function(ctx) {
            ctx.body = ctx.request.query;
          }
        });

        const app = new Koa();
        app.use(r.middleware());

        it('missing querystring', (done) => {
          test(app).get('/a')
          .expect(400, done);
        });

        it('invalid q and invalid s', (done) => {
          test(app).get('/a?q=100&s=asdfhjkl')
          .expect(400, done);
        });

        it('invalid q and valid s', (done) => {
          test(app).get('/a?q=4&s=asdfgh')
          .expect(400, done);
        });

        it('valid q and invalid s', (done) => {
          test(app).get('/a?q=5&s=dfgh')
          .expect(400, done);
        });

        it('valid q and valid s', (done) => {
          test(app).get('/a?q=5&s=as9fgh')
          .end((err, res) => {
            if (err) return done(err);
            assert.equal(5, res.body.q);
            assert.equal('as9fgh', res.body.s);
            done(err);
          });
        });

        it('valid q and valid s + unspecified values', (done) => {
          test(app).get('/a?q=5&s=as9fgh&sort=10')
          .end((err, res) => {
            assert.equal(5, res.body.q);
            assert.equal('as9fgh', res.body.s);
            assert.equal(10, res.body.sort);
            done(err);
          });
        });
      });

      it('retains the casted values in the route (gh-6, gh-21)', (done) => {
        const r = router();

        r.route({
          method: 'get',
          path: '/a',
          validate: {
            query: Joi.object().keys({
              d: Joi.date().required(),
              n: Joi.number().required(),
              b: Joi.boolean().required()
            })
          },
          handler: (ctx) => {
            ctx.body = {
              query: ctx.request.query,
              date: {
                type: typeof ctx.request.query.d,
                instance: ctx.request.query.d instanceof Date
              },
              number: {
                type: typeof ctx.request.query.n
              },
              bool: {
                type: typeof ctx.request.query.b
              }
            };
          }
        });

        const app = new Koa();
        app.use(r.middleware());

        test(app).get('/a?d=7-27-2016&n=34&b=true')
        .end((err, res) => {
          assert.equal('object', res.body.date.type);
          assert.equal(true, res.body.date.instance);
          assert.equal('number', res.body.number.type);
          assert.equal('boolean', res.body.bool.type);
          done(err);
        });
      });
    });

    describe('of params', () => {
      describe('when using regex captures', () => {
        const r = router();

        r.route({
          method: 'get',
          path: '/id/(\\d+)-(\\d+)',
          validate: {
            params: Joi.object().keys({
              0: Joi.number().min(5).max(10),
              1: Joi.number().max(1000)
            })
          },
          handler: function(ctx) {
            ctx.body = ctx.request.params;
          }
        });

        const app = new Koa();
        app.use(r.middleware());

        it('with invalid first match', (done) => {
          test(app).get('/id/2-9')
          .expect(400, done);
        });

        it('with invalid second match', (done) => {
          test(app).get('/id/7-1001')
          .expect(400, done);
        });

        it('with valid matches', (done) => {
          test(app).get('/id/7-1000')
          .expect(200, done);
        });
      });

      describe('with', () => {
        const r = router();

        r.route({
          method: 'get',
          path: '/a/:quantity/:sku',
          validate: {
            params: Joi.object().keys({
              quantity: Joi.number().min(5).max(8).required(),
              sku: Joi.string().alphanum().length(6)
            })
          },
          handler: function(ctx) {
            ctx.body = ctx.request.params;
          }
        });

        const app = new Koa();
        app.use(r.middleware());

        it('invalid quantity and invalid sku', (done) => {
          test(app).get('/a/as/asdfgh')
          .expect(400, done);
        });

        it('invalid quantity and valid sku', (done) => {
          test(app).get('/a/4/asdfgh')
          .expect(400, done);
        });

        it('valid quantity and invalid sku', (done) => {
          test(app).get('/a/5/dfgh')
          .expect(400, done);
        });

        it('valid quantity and valid sku', (done) => {
          test(app).get('/a/5/as9fgh')
          .expect(200)
          .expect('Content-Type', /json/)
          .set('Accept', 'application/json')
          .end((err, res) => {
            if (err) return done(err);
            assert.equal(5, res.body.quantity);
            assert.equal('as9fgh', res.body.sku);
            done(err);
          });
        });
      });

      it('retains the casted values in the route', (done) => {
        const r = router();

        r.route({
          method: 'get',
          path: '/:field/:d/:n/:b',
          validate: {
            params: Joi.object().keys({
              d: Joi.date().required(),
              n: Joi.number().required(),
              b: Joi.boolean().required(),
              field: Joi.any()
            })
          },
          handler: async function(ctx) {
            const params = ctx.request.params.field === 'request' ?
              ctx.request.params :
              ctx.params;

            ctx.body = {
              params: params,
              date: {
                type: typeof params.d,
                instance: params.d instanceof Date
              },
              number: {
                type: typeof params.n
              },
              bool: {
                type: typeof params.b
              }
            };
          }
        });

        const app = new Koa();
        app.use(r.middleware());

        test(app).get('/request/7-27-2016/34/true')
        .end((err, res) => {
          if (err) return done(err);
          assert.equal('object', res.body.date.type);
          assert.equal(true, res.body.date.instance);
          assert.equal('number', res.body.number.type);
          assert.equal('boolean', res.body.bool.type);

          test(app).get('/params/7-27-2016/34/true')
          .end((err, res) => {
            assert.equal('object', res.body.date.type);
            assert.equal(true, res.body.date.instance);
            assert.equal('number', res.body.number.type);
            assert.equal('boolean', res.body.bool.type);
            done(err);
          });
        });
      });
    });

    describe('of headers', () => {
      const r = router();

      r.route({
        method: 'post',
        path: '/a/b',
        validate: {
          header:
            Joi.object({ 'x-for-fun': Joi.number().min(5).max(8).required() })
              .options({ allowUnknown: true })
        },
        handler: function(ctx) {
          ctx.status = 204;
        }
      });

      const app = new Koa();
      app.use(r.middleware());

      it('with missing header fails', (done) => {
        test(app).post('/a/b').expect(400, done);
      });

      it('with invalid header (min) fails', (done) => {
        test(app).post('/a/b').set('X-For-Fun', 4).expect(400, done);
      });

      it('with invalid header (max) fails', (done) => {
        test(app).post('/a/b').set('X-For-Fun', 9).expect(400, done);
      });

      it('with valid header works', (done) => {
        test(app).post('/a/b').set('X-For-Fun', 6).expect(204, done);
      });
    });

    describe('of body', () => {
      describe('when validate.type', () => {
        describe('is specified', () => {
          const tests = {
            json: 1,
            form: 1,
            stream: 0
          };

          Object.keys(tests).forEach((name) => {
            describe('with ' + name, () => {
              it(tests[name] ? 'works' : 'fails', (done) => {
                const r = router();

                const method = tests[name] ?
                  assert.doesNotThrow :
                  assert.throws;

                method(() => {
                  r.route({
                    method: 'post',
                    path: '/',
                    handler: () => {},
                    validate: {
                      body: Joi.object({ name: Joi.string() }),
                      type: name
                    }
                  });
                });

                done();
              });
            });
          });
        });

        describe('is not specified', () => {
          it('fails', (done) => {
            const r = router();

            assert.throws(() => {
              r.route({
                method: 'post',
                path: '/',
                handler: () => {},
                validate: {
                  body: Joi.object({ name: Joi.string() })
                }
              });
            }, /validate\.type must be declared/);

            done();
          });
        });
      });

      describe('with', () => {
        const r = router();

        r.route({
          method: 'post',
          path: '/a/b',
          validate: {
            body: Joi.object().keys({
              quantity: Joi.number().min(5).max(8).required(),
              sku: Joi.string()
            }),
            type: 'json'
          },
          handler: function(ctx) {
            ctx.status = 200;
          }
        });

        const app = new Koa();
        app.use(r.middleware());

        it('no posted values', (done) => {
          test(app).post('/a/b').expect(400, done);
        });

        it('invalid number and valid string', (done) => {
          test(app).post('/a/b')
          .send({
            quantity: 4,
            sku: 'x'
          })
          .expect(400, done);
        });

        it('valid number and invalid string', (done) => {
          test(app).post('/a/b')
          .send({
            quantity: 6,
            sku: { x: 'test' }
          })
          .expect(400, done);
        });

        it('valid number and missing non-required string', (done) => {
          test(app).post('/a/b')
          .send({ quantity: 6 })
          .expect(200, done);
        });

        it('valid values', (done) => {
          test(app).post('/a/b')
          .send({
            quantity: 6,
            sku: 'x'
          })
          .expect(200, done);
        });

        it('valid values + unspecified values', (done) => {
          test(app).post('/a/b')
          .send({
            quantity: 6,
            sku: 'x',
            a: 1
          })
          .expect(400, done);
        });
      });

      describe('when invalid data is submitted', () => {
        describe('and validate.continueOnError is true', () => {
          it('runs the route and sets ctx.invalid', (done) => {
            const r = router();

            r.route({
              method: 'post',
              path: '/',
              validate: {
                type: 'json',
                continueOnError: true,
                body: {
                  name: Joi.string().min(10)
                }
              },
              handler: function(ctx) {
                ctx.status = 200;
                ctx.body = !!ctx.invalid;
              }
            });

            const app = new Koa();
            app.use(r.middleware());

            test(app)
            .post('/')
            .send({ name: 'Pebble' })
            .expect(200)
            .expect('true', done);
          });
        });

      });
    });

    describe('of parts (uploads)', () => {
      it('works', (done) => {
        const r = router();

        r.route({
          method: 'post',
          path: '/',
          validate: {
            type: 'multipart'
          },
          handler: function(ctx) {
            ctx.status = 200;
          }
        });

        const app = new Koa();
        app.use(r.middleware());

        test(app).post('/').send({ hi: 'there' }).expect(400, (err) => {
          if (err) return done(err);

          const b = new Buffer(1024);
          b.fill('a');

          test(app).post('/')
          .attach('file1', b)
          .expect(200, done);
        });
      });
    });

    describe('of output', () => {
      describe('status code patterns', () => {
        it('allows single status codes', () => {
          const r = router();
          assert.doesNotThrow(() => {
            r.route({
              method: 'get',
              path: '/single',
              validate: {
                output: {
                  '200': { body: Joi.any().equal('asdr') }
                }
              },
              handler: () => {}
            });
          });
        });

        it('allows commas', () => {
          const r = router();
          assert.doesNotThrow(() => {
            r.route({
              method: 'get',
              path: '/commas',
              validate: {
                output: {
                  '201,202': { body: Joi.any().equal('band-reject') }
                }
              },
              handler: () => {}
            });
          });
        });

        it('allows spaces between status codes', () => {
          const r = router();
          assert.doesNotThrow(() => {
            r.route({
              method: 'post',
              path: '/spaces',
              validate: {
                output: {
                  '400, 401': { body: Joi.any().equal('low-pass') }
                }
              },
              handler: () => {}
            });
          });
        });

        it('allows ranges', () => {
          const r = router();
          assert.doesNotThrow(() => {
            r.route({
              method: 'post',
              path: '/ranges',
              validate: {
                output: {
                  '402-404': { body: Joi.any().equal('hi-pass') }
                }
              },
              handler: () => {}
            });
          });
        });

        it('allows combinations of integers, commas and ranges', function* () {
          const r = router();

          assert.doesNotThrow(() => {
            r.route({
              method: 'post',
              path: '/combo/:status',
              validate: {
                output: {
                  '500-502, 504 ,506-510,201': { body: Joi.any().equal('band-pass') }
                }
              },
              handler: function(ctx) {
                ctx.status = parseInt(ctx.params.status, 10);

                if (ctx.params.status === '200') {
                  ctx.body = { 'pass-thru': 1 };
                } else {
                  ctx.body = 'band-pass';
                }
              }
            });
          });

          const app = new Koa();
          app.use(r.middleware());

          yield test(app).post('/combo/500').expect('band-pass').expect(500).end();
          yield test(app).post('/combo/501').expect('band-pass').expect(501).end();
          yield test(app).post('/combo/504').expect('band-pass').expect(504).end();
          yield test(app).post('/combo/506').expect('band-pass').expect(506).end();
          yield test(app).post('/combo/510').expect('band-pass').expect(510).end();
          yield test(app).post('/combo/201').expect('band-pass').expect(201).end();
          yield test(app).post('/combo/200').expect(200).end();
        });

        it('allows the "*" to represent all status codes', function* () {
          const r = router();

          assert.doesNotThrow(() => {
            r.route({
              method: 'get',
              path: '/all',
              validate: {
                output: {
                  '*': { body: Joi.any().equal('all') }
                }
              },
              handler: function(ctx) {
                ctx.status = 201;
                ctx.body = 'all';
              }
            });
          });

          const app = new Koa();
          app.use(r.middleware());
          yield test(app).get('/all').expect('all').expect(201).end();
        });

        describe('throws on invalid pattern', () => {
          const tests = [
            { pattern: '100x' },
            { pattern: 'x100' },
            { pattern: '1,' },
            { pattern: ',1' },
            { pattern: '600' },
            { pattern: '99' },
            { pattern: '100-200-300' },
            { pattern: '100-200-' },
            { pattern: '100-' },
            { pattern: '-100' },
            { pattern: '-100-' },
            { pattern: ',' },
            { pattern: ',,' },
            { pattern: '-' }
          ];

          tests.forEach((test) => {
            it(test.pattern, (done) => {
              const r = router();
              const output = {};
              output[test.pattern] = { body: Joi.string() };

              assert.throws(() => {
                r.route({
                  method: 'get',
                  path: '/invalid',
                  validate: { output: output },
                  handler: () => {}
                });
              });

              done();
            });
          });
        });

        it('throws on non-digit, comma, dash or space', () => {
          const r = router();
          assert.throws(() => {
            r.route({
              method: 'get',
              path: '/invalid',
              validate: {
                output: {
                  '%': { body: Joi.string() }
                }
              },
              handler: () => {}
            });
          });
        });

        it('throws if any status code patterns overlap', () => {
          const r = router();

          assert.throws(() => {
            r.route({
              method: 'get',
              path: '/overlap/1',
              validate: {
                output: {
                  '200': { body: Joi.any().equal('all') },
                  '200, 201': { body: Joi.any().equal('all') }
                }
              },
              handler: function(ctx) {
                ctx.body = 'all';
              }
            });
          }, /200 <=> 200, 201/);

          assert.throws(() => {
            r.route({
              method: 'get',
              path: '/overlap/2',
              validate: {
                output: {
                  '400': { body: Joi.any().equal('all') },
                  '200-500': { body: Joi.any().equal('all') }
                }
              },
              handler: function(ctx) {
                ctx.body = 'all';
              }
            });
          }, /400 <=> 200-500/);

          assert.throws(() => {
            r.route({
              method: 'get',
              path: '/overlap/22',
              validate: {
                output: {
                  '200-500': { body: Joi.any().equal('all') },
                  '404': { body: Joi.any().equal('all') }
                }
              },
              handler: (ctx) => {
                ctx.body = 'all';
              }
            });
          }, /404 <=> 200-500/);

          assert.throws(() => {
            r.route({
              method: 'get',
              path: '/overlap/3',
              validate: {
                output: {
                  '201, 204-208': { body: Joi.any().equal('all') },
                  '200,204': { body: Joi.any().equal('all') }
                }
              },
              handler: (ctx) => {
                ctx.body = 'all';
              }
            });
          }, /201, 204-208 <=> 200,204/);

          assert.throws(() => {
            r.route({
              method: 'get',
              path: '/overlap/4',
              validate: {
                output: {
                  '400, 404': { body: Joi.any().equal('all') },
                  '200, 201-203, 206, 301-400': { body: Joi.any().equal('all') }
                }
              },
              handler: (ctx) => {
                ctx.body = 'all';
              }
            });
          }, /400, 404 <=> 200, 201-203, 206, 301-400/);

          assert.throws(() => {
            r.route({
              method: 'get',
              path: '/overlap/5',
              validate: {
                output: {
                  '*': { body: Joi.any().equal('all') },
                  '500': { body: Joi.any().equal('all') }
                }
              },
              handler: (ctx) => {
                ctx.body = 'all';
              }
            });
          }, /500 <=> \*/);
        });

        it('does not throw if status code patterns do not overlap', () => {
          const r = router();
          assert.doesNotThrow(() => {
            r.route({
              method: 'get',
              path: '/overlap/1',
              validate: {
                output: {
                  '200': { body: Joi.any().equal('all') },
                  '201, 202': { body: Joi.any().equal('all') },
                  '203-599': { body: Joi.any().equal('all') }
                }
              },
              handler: () => {}
            });
          });
        });
      });

      describe('fields', () => {
        it('throws when neither body nor headers is specified', () => {
          const r = router();
          assert.throws(() => {
            r.route({
              method: 'get',
              path: '/',
              validate: {
                output: { '200': {} }
              },
              handler: () => {}
            });
          });
        });

        it('does not throw if headers is specified but not body', () => {
          const r = router();
          assert.doesNotThrow(() => {
            r.route({
              method: 'get',
              path: '/',
              validate: {
                output: {
                  '200': { headers: { x: Joi.any() } }
                }
              },
              handler: () => {}
            });
          });
        });

        it('does not throw if body is specified but not headers', () => {
          const r = router();
          assert.doesNotThrow(() => {
            r.route({
              method: 'get',
              path: '/',
              validate: {
                output: {
                  '200': { body: { x: Joi.any() } }
                }
              },
              handler: () => {}
            });
          });
        });
      });

      describe('body,', () => {
        describe('when specified,', () => {
          const r = router();

          r.route({
            method: 'post',
            path: '/a/b',
            validate: {
              output: {
                '100-599': { body: { n: Joi.number().max(10).required() } }
              }
            },
            handler: (ctx) => {
              ctx.body = { n: '3' };
            }
          });

          r.route({
            method: 'post',
            path: '/body/missing',
            validate: {
              output: {
                '200': { body: Joi.number().required() }
              }
            },
            handler: (ctx) => {
              ctx.status = 200;
            }
          });

          r.route({
            method: 'post',
            path: '/body/invalid',
            validate: {
              output: {
                '*': {
                  body: Joi.object({
                    y: Joi.string().min(3)
                  })
                }
              }
            },
            handler: (ctx) => {
              ctx.body = {
                x: 'hi',
                y: 'asdf'
              };
            }
          });

          const app = new Koa();
          app.use(r.middleware());

          it('casts output values according to Joi rules', function* () {
            // n should be cast to a number
            yield test(app).post('/a/b').expect('{"n":3}').expect(200).end();
          });

          describe('but not included in response', () => {
            it('responds with a 500', function* () {
              yield test(app).post('/body/missing').expect(500).end();
            });
          });

          describe('when output is invalid', () => {
            it('responds with a 500', function* () {
              yield test(app).post('/body/invalid').expect(500).end();
            });
          });
        });

        describe('when not specified,', () => {
          const r = router();

          r.route({
            method: 'post',
            path: '/notouch',
            handler: (ctx) => {
              ctx.body = { n: '4' };
            }
          });

          const app = new Koa();
          app.use(r.middleware());

          it('is not touched', function* () {
            const o = yield test(app).post('/notouch').expect(200).end();
            assert.strictEqual(o.text, '{"n":"4"}');
          });
        });
      });

      describe('headers', () => {
        const headers = Joi.object({
          n: Joi.number().max(10).required()
        }).options({
          allowUnknown: true
        });

        describe('when specified', () => {
          const r = router();

          r.route({
            method: 'post',
            path: '/headers/cast',
            validate: {
              output: {
                '100-599': {
                  headers: headers
                }
              }
            },
            handler: (ctx) => {
              ctx.set('n', '3');
              ctx.body = 'RWC';
            }
          });

          r.route({
            method: 'post',
            path: '/headers/missing',
            validate: {
              output: {
                '200': {
                  headers: headers
                }
              }
            },
            handler: (ctx) => {
              ctx.set('nope', 5);
              ctx.body = 'RWC';
            }
          });

          r.route({
            method: 'post',
            path: '/headers/invalid',
            validate: {
              output: {
                '*': {
                  headers: headers
                }
              }
            },
            handler: (ctx) => {
              ctx.set('n', 100);
              ctx.body = 'RWC';
            }
          });

          const app = new Koa();
          app.use(r.middleware());

          it('casts output values according to Joi rules', function* () {
            // n should be cast to a number
            yield test(app).post('/headers/cast').expect('n', 3).expect(200).end();
          });

          describe('but not included in response', () => {
            it('responds with a 500', function* () {
              yield test(app).post('/headers/missing').expect(500).end();
            });
          });

          describe('when output is invalid', () => {
            it('responds with a 500', function* () {
              yield test(app).post('/headers/invalid').expect(500).end();
            });
          });
        });

        describe('when not specified', () => {
          const r = router();

          r.route({
            method: 'post',
            path: '/notouch',
            handler: (ctx) => {
              ctx.set('n', '3');
              ctx.body = 'RWC';
            }
          });

          const app = new Koa();
          app.use(r.middleware());

          it('is not touched', function* () {
            const o = yield test(app).post('/notouch').expect(200).end();
            assert.strictEqual(o.header.n, '3');
          });
        });
      });

      it('does not occur when no status code matches', function* () {
        const r = router();

        r.route({
          method: 'post',
          path: '/notouch',
          validate: {
            output: {
              '510': { body: { n: Joi.string() } }
            }
          },
          handler: (ctx) => {
            ctx.body = { n: 4 };
          }
        });

        const app = new Koa();
        app.use(r.middleware());

        const o = yield test(app).post('/notouch').expect(200).end();
        assert.strictEqual(o.text, '{"n":4}');
      });
    });

    describe('with multiple methods', () => {
      describe('and multiple middleware', () => {
        it('works', (done) => {
          async function a(ctx, next) {
            ctx.worked = true;
            await next();
          }

          function b(ctx) {
            ctx.body = {
              worked: !!ctx.worked
            };
          }

          const r = router();
          r.route({
            path: '/',
            method: ['post', 'put'],
            handler: [a, b],
            validate: {
              header:
                Joi.object({ yum: Joi.string().token() })
                  .options({ allowUnknown: true })
            }
          });

          const app = new Koa();
          app.use(r.middleware());

          test(app).put('/').set('yum', '&&').expect(400, (err) => {
            if (err) return done(err);
            test(app).post('/').set('yum', '&&').expect(400, (err) => {
              if (err) return done(err);
              test(app).post('/').set('yum', 'sdfa3_E').expect(200, done);
            });
          });
        });
      });
    });

    describe('methods', () => {
      function makeMethodRouter(method, path) {
        const r = router();
        r[method].apply(r, slice(arguments, 1));
        assert.equal(1, r.routes.length);

        const route = r.routes[0];
        assert.equal(path, route.path);
        assert.equal(method, route.method[0]);

        return r;
      }

      function testMethodRouter(r, expected, done) {
        const route = r.routes[0];
        const method = route.method[0];
        const req = test(makeRouterApp(r))[method](route.path);
        switch (method) {
          case 'connect':
            // CONNECT is used by proxy servers to establish tunnels
            req.end((err) => {
              if (err && err.code === 'ECONNRESET') {
                done();
              } else {
                done(err);
              }
            });
            break;
          case 'head':
            // HEAD must not return a body
            req.expect('', done);
            break;
          default:
            // Otherwise, test the request normally.
            req.expect(expected, done);
        }
      }

      it('exist', (done) => {
        const r = router();
        methods.forEach((method) => {
          assert.equal('function', typeof r[method], 'missing method: ' + method);
        });
        done();
      });

      methods.forEach((method) => {
        describe(method + '()', () => {
          it('supports path and handler', (done) => {
            const m = new MiddlewareGenerator();
            const r = makeMethodRouter(method, '/', m.generate());

            testMethodRouter(r, m.getExpectedBody(), done);
          });

          it('supports path and multiple handlers', (done) => {
            const m = new MiddlewareGenerator();
            const r = makeMethodRouter(method, '/', m.generate(), m.generate());

            testMethodRouter(r, m.getExpectedBody(), done);
          });

          it('supports path and nested handlers', (done) => {
            const m = new MiddlewareGenerator();
            const r = makeMethodRouter(method, '/', [
              m.generate(), [
                m.generate(), [
                  m.generate()
                ]
              ]
            ], m.generate());

            testMethodRouter(r, m.getExpectedBody(), done);
          });

          it('supports path, config and handler', (done) => {
            const m = new MiddlewareGenerator();
            const r = makeMethodRouter(method, '/', {
              meta: true
            }, m.generate());

            assert(r.routes[0].meta);

            testMethodRouter(r, m.getExpectedBody(), done);
          });

          it('supports path, config and multiple handlers', (done) => {
            const m = new MiddlewareGenerator();
            const r = makeMethodRouter(method, '/', {
              meta: true
            }, m.generate(), m.generate());

            assert(r.routes[0].meta);

            testMethodRouter(r, m.getExpectedBody(), done);
          });

          it('supports path, config, and nested handlers', (done) => {
            const m = new MiddlewareGenerator();
            const r = makeMethodRouter(method, '/', {
              meta: true
            }, [
              m.generate(), [
                m.generate(), [
                  m.generate()
                ]
              ]
            ], m.generate());

            assert(r.routes[0].meta);

            testMethodRouter(r, m.getExpectedBody(), done);
          });
        });
      });
    });
  });

  describe.skip('use()', () => {
    describe('runs middleware before routes', () => {
      it('when called before routes', function* () {
        const r = router();
        let middlewareRanFirst = false;

        r.use(async function(ctx, next) {
          middlewareRanFirst = true;
          await next();
        });

        r.get('/test', (ctx) => {
          ctx.body = String(middlewareRanFirst);
        });

        const app = new Koa();
        app.use(r.middleware());

        yield test(app).get('/test')
        .expect('true')
        .expect(200)
        .end();
      });

      it('when called after routes', function* () {
        const r = router();
        let middlewareRanFirst = false;

        r.get('/test', (ctx) => {
          ctx.body = String(middlewareRanFirst);
        });

        r.use(async function(ctx, next) {
          middlewareRanFirst = true;
          await next();
        });

        const app = new Koa();
        app.use(r.middleware());

        yield test(app).get('/test')
        .expect('true')
        .expect(200)
        .end();
      });
    });

    describe('accepts an optional path', () => {
      it('applies middleware only to that path', function* () {
        const r = router();
        let middlewareRanFirst = false;

        function route(ctx) {
          ctx.body = String(middlewareRanFirst);
        }

        r.get('/test', route);
        r.get('/nada', route);

        r.use('/nada', async function(ctx, next) {
          middlewareRanFirst = true;
          await next();
        });

        const app = new Koa();
        app.use(r.middleware());

        yield test(app).get('/test')
        .expect('false')
        .expect(200)
        .end();

        yield test(app).get('/nada')
        .expect('true')
        .expect(200)
        .end();
      });
    });
  });

  describe.skip('prefix()', () => {
    it('adds routes as children of the `path`', function* () {
      const app = new Koa();
      app.context.msg = 'fail';

      const r = router();

      r.use(async function(ctx, next) {
        ctx.msg = 'works';
        await next();
      });

      r.get('/', function(ctx) {
        ctx.body = ctx.msg;
      });

      r.get('/itworks', function(ctx) {
        ctx.body = 'it' + ctx.msg;
      });

      r.get('/testparam/:id', {
        validate: { params: { id: Joi.string().min(5) } }
      }, function(ctx) {
        ctx.body = 'it' + ctx.msg;
      });

      r.prefix('/user');

      app.use(r.middleware());

      yield test(app).get('/')
      .expect(404)
      .end();

      yield test(app).get('/user')
      .expect('works')
      .expect(200)
      .end();

      yield test(app).get('/user/')
      .expect('works')
      .expect(200)
      .end();

      yield test(app).get('/user/itworks')
      .expect('itworks')
      .expect(200)
      .end();

      yield test(app).get('/user/itworks/')
      .expect('itworks')
      .expect(200)
      .end();

      yield test(app).get('/user/testparam/itworks')
      .expect('itworks')
      .expect(200)
      .end();
    });
  });
});
