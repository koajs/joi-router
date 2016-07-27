'use strict';

require('co-mocha');
require('co-supertest');

var router = require('../');
var koa = require('koa');
var assert = require('assert');
var request = require('supertest');
var http = require('http');
var Joi = require('joi');
var methods = require('methods');
var slice = require('sliced');
var MiddlewareGenerator = require('./test-utils').MiddlewareGenerator;

function makeRouterApp(router) {
  var app = koa();
  app.use(router.middleware());
  return app;
}

function test(app) {
  return request(http.createServer(app.callback()));
}

describe('koa-joi-router', function() {
  it('exposes a function', function(done) {
    assert.equal('function', typeof router);
    done();
  });

  it('is a constructor', function(done) {
    var r = router();
    assert(r instanceof router);
    done();
  });

  it('exposes the Joi module', function(done) {
    assert.equal(router.Joi, Joi);
    done();
  });

  describe('routes', function() {
    it('is an array', function(done) {
      var r = router();
      assert(Array.isArray(r.routes), 'expected .routes to be an Array');
      done();
    });
  });

  describe('route()', function() {
    describe('spec argument', function() {
      it('is required', function(done) {
        var r = router();

        assert.throws(function() {
          r.route();
        }, /missing spec/);

        done();
      });

      describe('must contain', function() {
        it('path', function(done) {
          assert.throws(function() {
            router().route({
              method: [],
              handler: function() {}
            });
          }, /invalid route path/);
          done();
        });

        it('at least one method', function(done) {
          assert.throws(function() {
            router().route({
              path: '/',
              handler: function*() {}
            });
          }, /missing route method/);

          assert.throws(function() {
            router().route({
              path: '/',
              method: [],
              handler: function*() {}
            });
          }, /missing route method/);

          done();
        });

        it('handler', function(done) {
          assert.throws(function() {
            router().route({
              method: ['get'],
              path: '/'
            });
          }, /route handler/);
          done();
        });
      });

      describe('when defining validate', function() {
        it('honors the failure code specified', function(done) {
          var r = router();
          r.route({
            path: '/',
            method: 'get',
            handler: function*() {},
            validate: {
              failure: 404
            }
          });

          assert.equal(404, r.routes[0].validate.failure);
          done();
        });
      });

      describe('method', function() {
        it('can be a string or array', function(done) {

          var tests = [
            ['get', 1],
            [['get'], 1],
            [['PUT', 'POST'], 1],
            [null, 0],
            [undefined, 0],
            [{}, 0],
            [['del', {}], 0]
          ];

          var r = router();
          var fn = function*() {};

          tests.forEach(function(test) {
            var method = test[1] === 0 ?
              assert.throws :
              assert.doesNotThrow;

            method(function() {
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

      describe('path', function() {
        it('can be a string', function(done) {
          var r = router();
          var fn = function*() {};

          assert.doesNotThrow(function() {
            r.get('/', fn);
          });

          done();
        });
      });

      describe('handler', function() {
        function testHandler(handler, expectedBody, done) {
          var r = router();

          r.route({
            method: 'get',
            path: '/',
            handler: handler
          });

          return test(makeRouterApp(r)).get('/')
            .expect(expectedBody, done);
        }

        it('can be a single middleware', function(done) {
          var middleware = new MiddlewareGenerator();

          testHandler(middleware.generate(), middleware.getExpectedBody(), done);
        });

        it('can be an array of multiple middleware', function(done) {
          var middleware = new MiddlewareGenerator();

          testHandler([
            middleware.generate(),
            middleware.generate()
          ], middleware.getExpectedBody(), done);
        });

        it('can be nested arrays of multiple middleware', function(done) {
          var middleware = new MiddlewareGenerator();

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

    it('adds route to the routes array', function(done) {
      var r = router();
      assert.equal(0, r.routes.length);

      r.route({
        method: 'put',
        path: '/asdf/:id',
        handler: function*() {}
      });

      assert.equal(1, r.routes.length);
      done();
    });

    it('adds routes to the routes array', function(done) {
      var r = router();
      assert.equal(0, r.routes.length);

      r.route([
        {
          method: 'put',
          path: '/asdf/:id',
          handler: function*() {}
        },
        {
          method: 'get',
          path: '/asdf/:id',
          handler: function*() {}
        }
      ]);

      assert.equal(2, r.routes.length);
      done();
    });

    it('exposes the route definition to the handler context', function(done) {
      var r = router();

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
        handler: function* handler() {
          this.status = 204;

          try {
            assert.equal('object', typeof this.state.route);

            assert(Array.isArray(this.state.route.method),
              'route.method should be an array');

            assert.equal(1, this.state.route.method.length);
            assert.equal('get', this.state.route.method[0]);
            assert.equal('/a', this.state.route.path);
            assert(this.state.route.validate.query, 'missing spec.validate.query');
            assert('function', typeof this.state.route.handler);
            assert.notEqual(handler, this.state.route.handler);
          } catch (err) {
            this.status = 500;
            this.body = err.stack;
          }
        }
      });

      var app = koa();
      app.use(r.middleware());
      test(app).get('/a?q=6').expect(204, function(err, res) {
        if (err) console.error(res.text);
        done(err);
      });
    });
  });

  describe('request.params', function() {
    it('are defined based off of the route definition', function(done) {
      var r = router();

      r.route({
        method: 'get',
        path: '/product/:id/:action',
        handler: function*() {
          assert(typeof this.params === 'object' && this.params !== null,
            'missing params');
          assert.equal(4, this.params.id);
          assert.equal('remove', this.params.action);
          this.status = 200;
        }
      });

      var app = koa();
      app.use(r.middleware());
      test(app).get('/product/4/remove').expect(200, done);
    });
  });

  describe('request.body', function() {
    describe('when expected type is', function() {

      describe('json', function() {
        describe('and valid json is sent', function() {
          it('is parsed as json', function(done) {
            var r = router();

            r.route({
              method: 'post',
              path: '/',
              handler: fn,
              validate: {
                type: 'json'
              }
            });

            function* fn() {
              this.body = this.request.body.last + ' ' + this.request.body.first;
            }

            var app = koa();
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

        describe('and non-json is sent', function() {
          it('fails', function(done) {
            var r = router();

            r.route({
              method: 'post',
              path: '/',
              handler: function*() {
                this.status = 204;
              },
              validate: {
                type: 'json'
              }
            });

            var app = koa();
            app.use(r.middleware());

            test(app)
            .post('/')
            .type('form')
            .send({
              name: 'Pebble'
            })
            .expect(400, done);
          });

          describe('and validate.continueOnError is true', function() {
            it('runs the route and sets ctx.invalid', function(done) {
              var r = router();

              r.route({
                method: 'post',
                path: '/',
                validate: {
                  type: 'json',
                  continueOnError: true
                },
                handler: function*() {
                  this.status = 200;
                  this.body = this.invalid.type.msg;
                }
              });

              var app = koa();
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

        describe('and invalid json is sent', function() {
          var invalid = '{' + JSON.stringify({
            name: 'Pebble'
          });

          it('fails', function(done) {
            var r = router();

            r.route({
              method: 'post',
              path: '/',
              handler: function*() {
                this.status = 204;
              },
              validate: {
                type: 'json'
              }
            });

            var app = koa();
            app.use(r.middleware());

            test(app)
            .post('/')
            .type('json')
            .send(invalid)
            .expect(400, done);
          });

          describe('and validate.continueOnError is true', function() {
            it('runs the route and sets ctx.invalid', function(done) {
              var r = router();

              r.route({
                method: 'post',
                path: '/',
                validate: {
                  type: 'json',
                  continueOnError: true
                },
                handler: function*() {
                  this.status = 200;
                  this.body = this.invalid &&
                    this.invalid.type &&
                    this.invalid.type.msg;
                }
              });

              var app = koa();
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

      describe('form', function() {
        describe('and valid form data is sent', function() {
          it('is parsed as form data', function(done) {
            var r = router();

            r.route({
              method: 'post',
              path: '/',
              handler: fn,
              validate: {
                type: 'form'
              }
            });

            function* fn() {
              this.body = this.request.body.last + ' ' + this.request.body.first;
            }

            var app = koa();
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

        describe('and non-form data is sent', function() {
          it('fails', function(done) {
            var r = router();

            r.route({
              method: 'post',
              path: '/',
              handler: function*() {
                this.status = 204;
              },
              validate: {
                type: 'form'
              }
            });

            var app = koa();
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

          describe('and validate.continueOnError is true', function() {
            it('runs the route and sets ctx.invalid', function(done) {
              var r = router();

              r.route({
                method: 'post',
                path: '/',
                validate: {
                  type: 'form',
                  continueOnError: true
                },
                handler: function*() {
                  this.status = 200;
                  this.body = this.invalid.type.msg;
                }
              });

              var app = koa();
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

        describe('and invalid form data is sent', function() {
          it('fails', function(done) {
            var r = router();

            r.route({
              method: 'post',
              path: '/',
              handler: function*() {
                this.status = 204;
              },
              validate: {
                type: 'form'
              }
            });

            var app = koa();
            app.use(r.middleware());

            test(app)
            .post('/')
            .expect(400, done);
          });

          describe('and validate.continueOnError is true', function() {
            it('runs the route and sets ctx.invalid', function(done) {
              var r = router();

              r.route({
                method: 'post',
                path: '/',
                validate: {
                  type: 'form',
                  continueOnError: true
                },
                handler: function*() {
                  this.status = 200;
                  this.body = this.invalid.type.msg;
                }
              });

              var app = koa();
              app.use(r.middleware());

              test(app)
              .post('/')
              .expect(200)
              .expect('expected x-www-form-urlencoded', done);
            });
          });
        });
      });

      describe('multipart', function() {
        it('is undefined', function(done) {
          var r = router();

          r.route({
            method: 'put',
            path: '/',
            type: 'multipart',
            handler: function* () {
              this.status = undefined === this.request.body ?
                200 :
                500;
            },
            validate: {
              type: 'multipart'
            }
          });

          var app = koa();
          app.use(r.middleware());

          var b = new Buffer(1024);
          b.fill('a');

          test(app)
          .put('/')
          .attach('file1', b)
          .expect(200, done);
        });
      });
    });
  });

  describe('request.parts', function() {
    describe('when expected type is', function() {
      'stream multipart'.split(' ').forEach(function(type) {
        describe(type, function() {
          it('is a co-busboy object', function(done) {
            var r = router();

            r.route({
              method: 'put',
              path: '/',
              handler: function* () {
                var part; // eslint-disable-line no-unused-vars
                while ((part = yield this.request.parts)) {}
                this.body = this.request.parts.field.color;
              },
              validate: {
                type: type
              }
            });

            var app = koa();
            app.use(r.middleware());

            var b = new Buffer(1024);
            b.fill('a');

            test(app)
            .put('/')
            .attach('file1', b)
            .attach('color', new Buffer('green'))
            .expect(200, done);
          });
        });
      });

      describe('not specified', function() {
        it('is undefined', function(done) {
          var r = router();

          r.route({
            method: 'put',
            path: '/',
            handler: function* () {
              this.status = undefined === this.request.parts ?
                200 :
                500;
            },
            validate: {}
          });

          var app = koa();
          app.use(r.middleware());

          var b = new Buffer(1024);
          b.fill('a');

          test(app)
          .put('/')
          .attach('file1', b)
          .expect(200, done);
        });
      });
    });
  });

  describe('validation', function() {
    describe('of querystring', function() {
      describe('with', function() {
        var r = router();

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
          handler: function*() {
            this.body = this.request.query;
          }
        });

        var app = koa();
        app.use(r.middleware());

        it('missing querystring', function(done) {
          test(app).get('/a')
          .expect(400, done);
        });

        it('invalid q and invalid s', function(done) {
          test(app).get('/a?q=100&s=asdfhjkl')
          .expect(400, done);
        });

        it('invalid q and valid s', function(done) {
          test(app).get('/a?q=4&s=asdfgh')
          .expect(400, done);
        });

        it('valid q and invalid s', function(done) {
          test(app).get('/a?q=5&s=dfgh')
          .expect(400, done);
        });

        it('valid q and valid s', function(done) {
          test(app).get('/a?q=5&s=as9fgh')
          .end(function(err, res) {
            if (err) return done(err);
            assert.equal(5, res.body.q);
            assert.equal('as9fgh', res.body.s);
            done(err);
          });
        });

        it('valid q and valid s + unspecified values', function(done) {
          test(app).get('/a?q=5&s=as9fgh&sort=10')
          .end(function(err, res) {
            assert.equal(5, res.body.q);
            assert.equal('as9fgh', res.body.s);
            assert.equal(10, res.body.sort);
            done(err);
          });
        });
      });
    });

    describe('of params', function() {
      describe('when using regex captures', function() {
        var r = router();

        r.route({
          method: 'get',
          path: '/id/(\\d+)-(\\d+)',
          validate: {
            params: Joi.object().keys({
              0: Joi.number().min(5).max(10),
              1: Joi.number().max(1000)
            })
          },
          handler: function*() {
            this.body = this.request.params;
          }
        });

        var app = koa();
        app.use(r.middleware());

        it('with invalid first match', function(done) {
          test(app).get('/id/2-9')
          .expect(400, done);
        });

        it('with invalid second match', function(done) {
          test(app).get('/id/7-1001')
          .expect(400, done);
        });

        it('with valid matches', function(done) {
          test(app).get('/id/7-1000')
          .expect(200, done);
        });
      });

      describe('with', function() {
        var r = router();

        r.route({
          method: 'get',
          path: '/a/:quantity/:sku',
          validate: {
            params: Joi.object().keys({
              quantity: Joi.number().min(5).max(8).required(),
              sku: Joi.string().alphanum().length(6)
            })
          },
          handler: function*() {
            this.body = this.request.params;
          }
        });

        var app = koa();
        app.use(r.middleware());

        it('invalid quantity and invalid sku', function(done) {
          test(app).get('/a/as/asdfgh')
          .expect(400, done);
        });

        it('invalid quantity and valid sku', function(done) {
          test(app).get('/a/4/asdfgh')
          .expect(400, done);
        });

        it('valid quantity and invalid sku', function(done) {
          test(app).get('/a/5/dfgh')
          .expect(400, done);
        });

        it('valid quantity and valid sku', function(done) {
          test(app).get('/a/5/as9fgh')
          .expect(200)
          .expect('Content-Type', /json/)
          .set('Accept', 'application/json')
          .end(function(err, res) {
            if (err) return done(err);
            assert.equal(5, res.body.quantity);
            assert.equal('as9fgh', res.body.sku);
            done(err);
          });
        });
      });
    });

    describe('of headers', function() {
      var r = router();

      r.route({
        method: 'post',
        path: '/a/b',
        validate: {
          header:
            Joi.object({ 'x-for-fun': Joi.number().min(5).max(8).required() })
              .options({ allowUnknown: true })
        },
        handler: function*() {
          this.status = 204;
        }
      });

      var app = koa();
      app.use(r.middleware());

      it('with missing header fails', function(done) {
        test(app).post('/a/b').expect(400, done);
      });

      it('with invalid header (min) fails', function(done) {
        test(app).post('/a/b').set('X-For-Fun', 4).expect(400, done);
      });

      it('with invalid header (max) fails', function(done) {
        test(app).post('/a/b').set('X-For-Fun', 9).expect(400, done);
      });

      it('with valid header works', function(done) {
        test(app).post('/a/b').set('X-For-Fun', 6).expect(204, done);
      });
    });

    describe('of body', function() {
      describe('when validate.type', function() {
        describe('is specified', function() {
          var tests = {
            json: 1,
            form: 1,
            stream: 0
          };

          Object.keys(tests).forEach(function(name) {
            describe('with ' + name, function() {
              it(tests[name] ? 'works' : 'fails', function(done) {
                var r = router();

                var method = tests[name] ?
                  assert.doesNotThrow :
                  assert.throws;

                method(function() {
                  r.route({
                    method: 'post',
                    path: '/',
                    handler: function*() {},
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

        describe('is not specified', function() {
          it('fails', function(done) {
            var r = router();

            assert.throws(function() {
              r.route({
                method: 'post',
                path: '/',
                handler: function*() {},
                validate: {
                  body: Joi.object({ name: Joi.string() })
                }
              });
            }, /validate\.type must be declared/);

            done();
          });
        });
      });

      describe('with', function() {
        var r = router();

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
          handler: function*() {
            this.status = 200;
          }
        });

        var app = koa();
        app.use(r.middleware());

        it('no posted values', function(done) {
          test(app).post('/a/b').expect(400, done);
        });

        it('invalid number and valid string', function(done) {
          test(app).post('/a/b')
          .send({
            quantity: 4,
            sku: 'x'
          })
          .expect(400, done);
        });

        it('valid number and invalid string', function(done) {
          test(app).post('/a/b')
          .send({
            quantity: 6,
            sku: { x: 'test' }
          })
          .expect(400, done);
        });

        it('valid number and missing non-required string', function(done) {
          test(app).post('/a/b')
          .send({ quantity: 6 })
          .expect(200, done);
        });

        it('valid values', function(done) {
          test(app).post('/a/b')
          .send({
            quantity: 6,
            sku: 'x'
          })
          .expect(200, done);
        });

        it('valid values + unspecified values', function(done) {
          test(app).post('/a/b')
          .send({
            quantity: 6,
            sku: 'x',
            a: 1
          })
          .expect(400, done);
        });
      });

      describe('when invalid data is submitted', function() {
        describe('and validate.continueOnError is true', function() {
          it('runs the route and sets ctx.invalid', function(done) {
            var r = router();

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
              handler: function*() {
                this.status = 200;
                this.body = !!this.invalid;
              }
            });

            var app = koa();
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

    describe('of parts (uploads)', function() {
      it('works', function(done) {
        var r = router();

        r.route({
          method: 'post',
          path: '/',
          validate: {
            type: 'multipart'
          },
          handler: function*() {
            this.status = 200;
          }
        });

        var app = koa();
        app.use(r.middleware());

        test(app).post('/').send({ hi: 'there' }).expect(400, function(err) {
          if (err) return done(err);

          var b = new Buffer(1024);
          b.fill('a');

          test(app).post('/')
          .attach('file1', b)
          .expect(200, done);
        });
      });
    });

    describe('of output', function() {
      describe('status code patterns', function() {
        it('allows single status codes', function() {
          var r = router();
          assert.doesNotThrow(function() {
            r.route({
              method: 'get',
              path: '/single',
              validate: {
                output: {
                  '200': { body: Joi.any().equal('asdr') }
                }
              },
              handler: function*() {}
            });
          });
        });

        it('allows commas', function() {
          var r = router();
          assert.doesNotThrow(function() {
            r.route({
              method: 'get',
              path: '/commas',
              validate: {
                output: {
                  '201,202': { body: Joi.any().equal('band-reject') }
                }
              },
              handler: function*() {}
            });
          });
        });

        it('allows spaces between status codes', function() {
          var r = router();
          assert.doesNotThrow(function() {
            r.route({
              method: 'post',
              path: '/spaces',
              validate: {
                output: {
                  '400, 401': { body: Joi.any().equal('low-pass') }
                }
              },
              handler: function*() {}
            });
          });
        });

        it('allows ranges', function() {
          var r = router();
          assert.doesNotThrow(function() {
            r.route({
              method: 'post',
              path: '/ranges',
              validate: {
                output: {
                  '402-404': { body: Joi.any().equal('hi-pass') }
                }
              },
              handler: function*() {}
            });
          });
        });

        it('allows combinations of integers, commas and ranges', function*() {
          var r = router();

          assert.doesNotThrow(function() {
            r.route({
              method: 'post',
              path: '/combo/:status',
              validate: {
                output: {
                  '500-502, 504 ,506-510,201': { body: Joi.any().equal('band-pass') }
                }
              },
              handler: function*() {
                this.status = parseInt(this.params.status, 10);

                if (this.params.status === '200') {
                  this.body = { 'pass-thru': 1 };
                } else {
                  this.body = 'band-pass';
                }
              }
            });
          });

          var app = koa();
          app.use(r.middleware());

          yield test(app).post('/combo/500').expect('band-pass').expect(500).end();
          yield test(app).post('/combo/501').expect('band-pass').expect(501).end();
          yield test(app).post('/combo/504').expect('band-pass').expect(504).end();
          yield test(app).post('/combo/506').expect('band-pass').expect(506).end();
          yield test(app).post('/combo/510').expect('band-pass').expect(510).end();
          yield test(app).post('/combo/201').expect('band-pass').expect(201).end();
          yield test(app).post('/combo/200').expect(200).end();
        });

        it('allows the "*" to represent all status codes', function*() {
          var r = router();

          assert.doesNotThrow(function() {
            r.route({
              method: 'get',
              path: '/all',
              validate: {
                output: {
                  '*': { body: Joi.any().equal('all') }
                }
              },
              handler: function*() {
                this.status = 201;
                this.body = 'all';
              }
            });
          });

          var app = koa();
          app.use(r.middleware());
          yield test(app).get('/all').expect('all').expect(201).end();
        });

        describe('throws on invalid pattern', function() {
          var tests = [
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

          tests.forEach(function(test) {
            it(test.pattern, function(done) {
              var r = router();
              var output = {};
              output[test.pattern] = { body: Joi.string() };

              assert.throws(function() {
                r.route({
                  method: 'get',
                  path: '/invalid',
                  validate: { output: output },
                  handler: function*() {}
                });
              });

              done();
            });
          });
        });

        it('throws on non-digit, comma, dash or space', function() {
          var r = router();
          assert.throws(function() {
            r.route({
              method: 'get',
              path: '/invalid',
              validate: {
                output: {
                  '%': { body: Joi.string() }
                }
              },
              handler: function*() {}
            });
          });
        });

        it('throws if any status code patterns overlap', function() {
          var r = router();

          assert.throws(function() {
            r.route({
              method: 'get',
              path: '/overlap/1',
              validate: {
                output: {
                  '200': { body: Joi.any().equal('all') },
                  '200, 201': { body: Joi.any().equal('all') }
                }
              },
              handler: function*() {
                this.body = 'all';
              }
            });
          }, /200 <=> 200, 201/);

          assert.throws(function() {
            r.route({
              method: 'get',
              path: '/overlap/2',
              validate: {
                output: {
                  '400': { body: Joi.any().equal('all') },
                  '200-500': { body: Joi.any().equal('all') }
                }
              },
              handler: function*() {
                this.body = 'all';
              }
            });
          }, /400 <=> 200-500/);

          assert.throws(function() {
            r.route({
              method: 'get',
              path: '/overlap/22',
              validate: {
                output: {
                  '200-500': { body: Joi.any().equal('all') },
                  '404': { body: Joi.any().equal('all') }
                }
              },
              handler: function*() {
                this.body = 'all';
              }
            });
          }, /404 <=> 200-500/);

          assert.throws(function() {
            r.route({
              method: 'get',
              path: '/overlap/3',
              validate: {
                output: {
                  '201, 204-208': { body: Joi.any().equal('all') },
                  '200,204': { body: Joi.any().equal('all') }
                }
              },
              handler: function*() {
                this.body = 'all';
              }
            });
          }, /201, 204-208 <=> 200,204/);

          assert.throws(function() {
            r.route({
              method: 'get',
              path: '/overlap/4',
              validate: {
                output: {
                  '400, 404': { body: Joi.any().equal('all') },
                  '200, 201-203, 206, 301-400': { body: Joi.any().equal('all') }
                }
              },
              handler: function*() {
                this.body = 'all';
              }
            });
          }, /400, 404 <=> 200, 201-203, 206, 301-400/);

          assert.throws(function() {
            r.route({
              method: 'get',
              path: '/overlap/5',
              validate: {
                output: {
                  '*': { body: Joi.any().equal('all') },
                  '500': { body: Joi.any().equal('all') }
                }
              },
              handler: function*() {
                this.body = 'all';
              }
            });
          }, /500 <=> \*/);
        });

        it('does not throw if status code patterns do not overlap', function() {
          var r = router();
          assert.doesNotThrow(function() {
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
              handler: function*() {}
            });
          });
        });
      });

      describe('fields', function() {
        it('throws when neither body nor headers is specified', function() {
          var r = router();
          assert.throws(function() {
            r.route({
              method: 'get',
              path: '/',
              validate: {
                output: { '200': {} }
              },
              handler: function*() {}
            });
          });
        });

        it('does not throw if headers is specified but not body', function() {
          var r = router();
          assert.doesNotThrow(function() {
            r.route({
              method: 'get',
              path: '/',
              validate: {
                output: {
                  '200': { headers: { x: Joi.any() } }
                }
              },
              handler: function*() {}
            });
          });
        });

        it('does not throw if body is specified but not headers', function() {
          var r = router();
          assert.doesNotThrow(function() {
            r.route({
              method: 'get',
              path: '/',
              validate: {
                output: {
                  '200': { body: { x: Joi.any() } }
                }
              },
              handler: function*() {}
            });
          });
        });
      });

      describe('body,', function() {
        describe('when specified,', function() {
          var r = router();

          r.route({
            method: 'post',
            path: '/a/b',
            validate: {
              output: {
                '100-599': { body: { n: Joi.number().max(10).required() } }
              }
            },
            handler: function*() {
              this.body = { n: '3' };
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
            handler: function*() {
              this.status = 200;
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
            handler: function*() {
              this.body = {
                x: 'hi',
                y: 'asdf'
              };
            }
          });

          var app = koa();
          app.use(r.middleware());

          it('casts output values according to Joi rules', function*() {
            // n should be cast to a number
            yield test(app).post('/a/b').expect('{"n":3}').expect(200).end();
          });

          describe('but not included in response', function() {
            it('responds with a 500', function*() {
              yield test(app).post('/body/missing').expect(500).end();
            });
          });

          describe('when output is invalid', function() {
            it('responds with a 500', function*() {
              yield test(app).post('/body/invalid').expect(500).end();
            });
          });
        });

        describe('when not specified,', function() {
          var r = router();

          r.route({
            method: 'post',
            path: '/notouch',
            handler: function*() {
              this.body = { n: '4' };
            }
          });

          var app = koa();
          app.use(r.middleware());

          it('is not touched', function*() {
            var o = yield test(app).post('/notouch').expect(200).end();
            assert.strictEqual(o.text, '{"n":"4"}');
          });
        });
      });

      describe('headers', function() {
        var headers = Joi.object({
          n: Joi.number().max(10).required()
        }).options({
          allowUnknown: true
        });

        describe('when specified', function() {
          var r = router();

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
            handler: function*() {
              this.set('n', '3');
              this.body = 'RWC';
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
            handler: function*() {
              this.set('nope', 5);
              this.body = 'RWC';
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
            handler: function*() {
              this.set('n', 100);
              this.body = 'RWC';
            }
          });

          var app = koa();
          app.use(r.middleware());

          it('casts output values according to Joi rules', function*() {
            // n should be cast to a number
            yield test(app).post('/headers/cast').expect('n', 3).expect(200).end();
          });

          describe('but not included in response', function() {
            it('responds with a 500', function*() {
              yield test(app).post('/headers/missing').expect(500).end();
            });
          });

          describe('when output is invalid', function() {
            it('responds with a 500', function*() {
              yield test(app).post('/headers/invalid').expect(500).end();
            });
          });
        });

        describe('when not specified', function() {
          var r = router();

          r.route({
            method: 'post',
            path: '/notouch',
            handler: function*() {
              this.set('n', '3');
              this.body = 'RWC';
            }
          });

          var app = koa();
          app.use(r.middleware());

          it('is not touched', function*() {
            var o = yield test(app).post('/notouch').expect(200).end();
            assert.strictEqual(o.header.n, '3');
          });
        });
      });

      it('does not occur when no status code matches', function*() {
        var r = router();

        r.route({
          method: 'post',
          path: '/notouch',
          validate: {
            output: {
              '510': { body: { n: Joi.string() } }
            }
          },
          handler: function*() {
            this.body = { n: 4 };
          }
        });

        var app = koa();
        app.use(r.middleware());

        var o = yield test(app).post('/notouch').expect(200).end();
        assert.strictEqual(o.text, '{"n":4}');
      });
    });

    describe('with multiple methods', function() {
      describe('and multiple middleware', function() {
        it('works', function(done) {
          function* a(next) {
            this.worked = true;
            yield next;
          }

          function* b() {
            this.body = {
              worked: !!this.worked
            };
          }

          var r = router();
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

          var app = koa();
          app.use(r.middleware());

          test(app).put('/').set('yum', '&&').expect(400, function(err) {
            if (err) return done(err);
            test(app).post('/').set('yum', '&&').expect(400, function(err) {
              if (err) return done(err);
              test(app).post('/').set('yum', 'sdfa3_E').expect(200, done);
            });
          });
        });
      });
    });

    describe('methods', function() {
      function makeMethodRouter(method, path) {
        var r = router();
        r[method].apply(r, slice(arguments, 1));
        assert.equal(1, r.routes.length);

        var route = r.routes[0];
        assert.equal(path, route.path);
        assert.equal(method, route.method[0]);

        return r;
      }

      function testMethodRouter(r, expected, done) {
        var route = r.routes[0];
        var method = route.method[0];
        var req = test(makeRouterApp(r))[method](route.path);
        switch (method) {
          case 'connect':
            // CONNECT is used by proxy servers to establish tunnels
            req.end(function(err) {
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

      it('exist', function(done) {
        var r = router();
        methods.forEach(function(method) {
          assert.equal('function', typeof r[method], 'missing method: ' + method);
        });
        done();
      });

      methods.forEach(function(method) {
        describe(method + '()', function() {
          it('supports path and handler', function(done) {
            var m = new MiddlewareGenerator();
            var r = makeMethodRouter(method, '/', m.generate());

            testMethodRouter(r, m.getExpectedBody(), done);
          });

          it('supports path and multiple handlers', function(done) {
            var m = new MiddlewareGenerator();
            var r = makeMethodRouter(method, '/', m.generate(), m.generate());

            testMethodRouter(r, m.getExpectedBody(), done);
          });

          it('supports path and nested handlers', function(done) {
            var m = new MiddlewareGenerator();
            var r = makeMethodRouter(method, '/', [
              m.generate(), [
                m.generate(), [
                  m.generate()
                ]
              ]
            ], m.generate());

            testMethodRouter(r, m.getExpectedBody(), done);
          });

          it('supports path, config and handler', function(done) {
            var m = new MiddlewareGenerator();
            var r = makeMethodRouter(method, '/', {
              meta: true
            }, m.generate());

            assert(r.routes[0].meta);

            testMethodRouter(r, m.getExpectedBody(), done);
          });

          it('supports path, config and multiple handlers', function(done) {
            var m = new MiddlewareGenerator();
            var r = makeMethodRouter(method, '/', {
              meta: true
            }, m.generate(), m.generate());

            assert(r.routes[0].meta);

            testMethodRouter(r, m.getExpectedBody(), done);
          });

          it('supports path, config, and nested handlers', function(done) {
            var m = new MiddlewareGenerator();
            var r = makeMethodRouter(method, '/', {
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

  describe('use()', function() {
    describe('runs middleware before routes', function() {
      it('when called before routes', function*() {
        var r = router();
        var middlewareRanFirst = false;

        r.use(function*(next) {
          middlewareRanFirst = true;
          yield next;
        });

        r.get('/test', function*() {
          this.body = String(middlewareRanFirst);
        });

        var app = koa();
        app.use(r.middleware());

        yield test(app).get('/test')
        .expect('true')
        .expect(200)
        .end();
      });

      it('when called after routes', function*() {
        var r = router();
        var middlewareRanFirst = false;

        r.get('/test', function*() {
          this.body = String(middlewareRanFirst);
        });

        r.use(function*(next) {
          middlewareRanFirst = true;
          yield next;
        });

        var app = koa();
        app.use(r.middleware());

        yield test(app).get('/test')
        .expect('true')
        .expect(200)
        .end();
      });
    });

    describe('accepts an optional path', function() {
      it('applies middleware only to that path', function*() {
        var r = router();
        var middlewareRanFirst = false;

        function* route() {
          this.body = String(middlewareRanFirst);
        }

        r.get('/test', route);
        r.get('/nada', route);

        r.use('/nada', function*(next) {
          middlewareRanFirst = true;
          yield next;
        });

        var app = koa();
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

  describe('prefix()', function() {
    it('adds routes as children of the `path`', function*() {
      var app = koa();
      app.context.msg = 'fail';

      var r = router();

      r.use(function*(next) {
        this.msg = 'works';
        yield next;
      });

      r.get('/', function*() {
        this.body = this.msg;
      });

      r.get('/itworks', function*() {
        this.body = 'it' + this.msg;
      });

      r.get('/testparam/:id', {
        validate: { params: { id: Joi.string().min(5) } }
      }, function*() {
        this.body = 'it' + this.msg;
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
