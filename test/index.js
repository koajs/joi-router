
var router = require('../');
var koa = require('koa');
var assert = require('assert');
var request = require('supertest');
var http = require('http');
var Joi = require('joi');
var methods = require('methods');

function test(app){
  return request(http.createServer(app.callback()))
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
            router().route({ method: [], handler: function(){}})
          }, /invalid route path/)
          done();
        });

        it('at least one method', function(done) {
          assert.throws(function() {
            router().route({ path: '/', handler: function*(){}})
          }, /missing route method/)

          assert.throws(function() {
            router().route({ path: '/', method: [], handler: function*(){}})
          }, /missing route method/)

          done();
        });

        it('handler', function(done) {
          assert.throws(function() {
            router().route({ method: ['get'], path: '/' })
          }, /route handler/)
          done();
        });
      });

      describe('when defining validate', function() {
        it('honors the failure code specified', function(done) {
          var r = router();
          r.route({
              path: '/'
            , method: 'get'
            , handler:function*(){}
            , validate: { failure: 404 }
          })

          assert.equal(404, r.routes[0].validate.failure);
          done();
        });
      });

      describe('method', function() {
        it('can be a string or array', function(done) {

          var tests = [
              ['get', 1]
            , [['get'], 1]
            , [['PUT','POST'], 1]
            , [null, 0]
            , [undefined, 0]
            , [{}, 0]
            , [['del', {}], 0]
          ];

          var r = router();
          var fn = function*(){};

          tests.forEach(function(test) {
            var method = 0 === test[1]
              ? assert.throws
              : assert.doesNotThrow

            method(function() {
              r.route({ method: test[0], path: '/', handler: fn })
            })
          });

          done();
        });
      });
    });

    it('adds routes to the routes array', function(done) {
      var r = router();
      assert.equal(0, r.routes.length);

      r.route({
        method: 'put', path: '/asdf/:id', handler: function*(){}
      })

      assert.equal(1, r.routes.length);
      done();
    });

    it('supports adding multiple middleware', function(done) {
      var r = router();

      function* test1(next) {
        this.test1Ran = true;
        yield* next;
      }

      function* test2 () {
        this.body = this.test1Ran
          ? '<h1>Hello!</h1>'
          : 'fail';
      };

      r.route({
          method: 'get'
        , path: '/'
        , handler: [test1, test2]
      });

      var app = koa();
      app.use(r.middleware());
      test(app).get('/').expect(/Hello/, done);
    });
  });

  describe('request.params', function() {
    it('are defined based off of the route definition', function(done) {
      var r = router();

      r.route({ method: 'get', path: '/product/:id/:action', handler: function*(){
        assert('object' == typeof this.params && null !== this.params, 'missing params');
        assert.equal(4, this.params.id);
        assert.equal('remove', this.params.action);
        this.status = 200;
      }})

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
                method: 'post'
              , path: '/'
              , handler: fn
              , validate: { type: 'json' }
            });

            function* fn(){
              this.body = this.request.body.last + ' ' + this.request.body.first;
            }

            var app = koa();
            app.use(r.middleware());
            test(app).post('/')
            .send({ last: 'Heckmann', first: 'Aaron' })
            .expect(200)
            .expect('Heckmann Aaron', done)
          });
        });

        describe('and invalid json is sent', function() {
          it('fails', function(done) {
            var r = router();

            r.route({
                method: 'post'
              , path: '/'
              , handler: function*(){ this.status = 204 }
              , validate: { type: 'json' }
            });

            var app = koa();
            app.use(r.middleware());

            test(app)
            .post('/')
            .send('{' + JSON.stringify({ last: 'Heckmann', first: 'Aaron' }))
            .expect(400, done)
          });
        });
      });

      describe('form', function() {
        describe('and valid form data is sent', function() {
          it('is parsed as form data', function(done) {
            var r = router();

            r.route({
                method: 'post'
              , path: '/'
              , handler: fn
              , validate: { type: 'form' }
            });

            function* fn(){
              this.body = this.request.body.last + ' ' + this.request.body.first;
            }

            var app = koa();
            app.use(r.middleware());

            test(app)
            .post('/')
            .send({ last: 'Heckmann', first: 'Aaron' })
            .type('form')
            .expect(200)
            .expect('Heckmann Aaron')
            .end(done)
          });
        });

        describe('and invalid form data is sent', function() {
          it('fails', function(done) {
            var r = router();

            r.route({
                method: 'post'
              , path: '/'
              , handler: function*(){ this.status = 204 }
              , validate: { type: 'form' }
            });

            var app = koa();
            app.use(r.middleware());

            test(app)
            .post('/')
            .send({ last: 'Heckmann', first: 'Aaron' })
            .type('json')
            .expect(400, done)
          });
        });
      });

      describe('multipart', function() {
        it('is undefined', function(done) {
          var r = router();

          r.route({
              method:'put'
            , path:'/'
            , type: 'multipart'
            , handler:function* () {
                this.status = undefined == this.request.body
                  ? 200
                  : 500
              }
            , validate: { type: 'multipart' }
          });

          var app = koa();
          app.use(r.middleware());

          var b = new Buffer(1024);
          b.fill('a');

          test(app)
          .put('/')
          .attach('file1', b)
          .expect(200, done)
        });
      });
    })
  })

  describe('request.parts', function() {
    describe('when expected type is', function() {
      'stream multipart'.split(' ').forEach(function(type) {
        describe(type, function() {
          it('is a co-busboy object', function(done) {
            var r = router();

            r.route({
                method:'put'
              , path:'/'
              , handler:function* () {
                  var part;
                  while (part = yield this.request.parts) {}
                  this.body = this.request.parts.field.color;
                }
              , validate: { type: type }
            });

            var app = koa();
            app.use(r.middleware());

            var b = new Buffer(1024);
            b.fill('a');

            test(app)
            .put('/')
            .attach('file1', b)
            .attach('color', new Buffer('green'))
            .expect(200, done)
          });
        });
      });

      describe('not specified', function() {
        it('is undefined', function(done) {
          var r = router();

          r.route({
              method:'put'
            , path:'/'
            , handler:function* () {
                this.status = undefined == this.request.parts
                  ? 200
                  : 500
              }
            , validate: {}
          });

          var app = koa();
          app.use(r.middleware());

          var b = new Buffer(1024);
          b.fill('a');

          test(app)
          .put('/')
          .attach('file1', b)
          .expect(200, done)
        });
      });
    });
  });

  describe('validation', function() {
    describe('of querystring', function() {
      describe('with', function() {
        var r = router();

        r.route({
          method: 'get'
        , path: '/a'
        , validate: {
            query: Joi.object().keys({
              q: Joi.number().min(5).max(8).required()
            , s: Joi.string().alphanum().length(6)
            }).options({ allowUnknown: true })
          }
        , handler: function*(){ this.body = this.request.query }
        });

        var app = koa();
        app.use(r.middleware());

        it('missing querystring',function(done){
          test(app).get('/a')
          .expect(400, done);
        });

        it('invalid q and invalid s',function(done){
          test(app).get('/a?q=100&s=asdfhjkl')
          .expect(400, done);
        });

        it('invalid q and valid s',function(done){
          test(app).get('/a?q=4&s=asdfgh')
          .expect(400, done);
        });

        it('valid q and invalid s',function(done){
          test(app).get('/a?q=5&s=dfgh')
          .expect(400, done);
        });

        it('valid q and valid s',function(done){
          test(app).get('/a?q=5&s=as9fgh')
          .end(function(err, res){
            if (err) return done(err);
            assert.equal(5, res.body.q);
            assert.equal('as9fgh', res.body.s);
            done(err);
          });
        });

        it('valid q and valid s + unspecified values',function(done){
          test(app).get('/a?q=5&s=as9fgh&sort=10')
          .end(function(err, res){
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
          method: 'get'
        , path: /^\/id\/(\d+)-(\d+)/i
        , validate: {
            params: Joi.object().keys({
              0: Joi.number().min(5).max(10)
            , 1: Joi.number().max(1000)
            })
          }
        , handler: function*(){ this.body = this.request.params }
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
          method: 'get'
        , path: '/a/:quantity/:sku'
        , validate: {
            params: Joi.object().keys({
              quantity: Joi.number().min(5).max(8).required()
            , sku: Joi.string().alphanum().length(6)
            })
          }
        , handler: function*(){ this.body = this.request.params }
        });

        var app = koa();
        app.use(r.middleware());

        it('invalid quantity and invalid sku',function(done){
          test(app).get('/a/as/asdfgh')
          .expect(400, done);
        });

        it('invalid quantity and valid sku',function(done){
          test(app).get('/a/4/asdfgh')
          .expect(400, done);
        });

        it('valid quantity and invalid sku',function(done){
          test(app).get('/a/5/dfgh')
          .expect(400, done);
        });

        it('valid quantity and valid sku',function(done){
          test(app).get('/a/5/as9fgh')
          .expect(200)
          .expect('Content-Type', /json/)
          .set('Accept', 'application/json')
          .end(function(err, res){
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
          method: 'post'
        , path: '/a/b'
        , validate: {
            header:
              Joi.object({ "x-for-fun": Joi.number().min(5).max(8).required() })
                 .options({ allowUnknown: true })
          }
        , handler: function*(){ this.status = 204 }
      })

      var app = koa();
      app.use(r.middleware());

      it('with missing header fails', function(done) {
        test(app).post('/a/b').expect(400, done);
      })

      it('with invalid header (min) fails', function(done) {
        test(app).post('/a/b').set('X-For-Fun', 4).expect(400, done);
      })

      it('with invalid header (max) fails', function(done) {
        test(app).post('/a/b').set('X-For-Fun', 9).expect(400, done);
      })

      it('with valid header works', function(done) {
        test(app).post('/a/b').set('X-For-Fun', 6).expect(204, done);
      })
    });

    describe('of body', function() {
      describe('when validate.type', function() {
        describe('is specified', function() {
          var tests = {
              json: 1
            , form: 1
            , stream: 0
          };

          Object.keys(tests).forEach(function(name) {
            describe('with ' + name, function() {
              it(tests[name] ? 'works' : 'fails', function(done) {
                var r = router();

                var method = tests[name]
                  ? assert.doesNotThrow
                  : assert.throws;

                method(function(){
                  r.route({
                      method:'post'
                    , path: '/'
                    , handler: function*(){}
                    , validate: {
                          body: Joi.object({ name: Joi.string() })
                        , type: name
                      }
                  })
                });

                done();
              });
            });
          });
        });

        describe('is not specified', function() {
          it('fails', function(done) {
            var r = router();

            assert.throws(function(){
              r.route({
                  method:'post'
                , path: '/'
                , handler: function*(){}
                , validate: {
                    body: Joi.object({ name: Joi.string() })
                  }
              })
            }, /validate\.type must be declared/)

            done();
          });
        });
      });

      describe('with', function() {
        var r = router();

        r.route({
          method: 'post'
        , path: '/a/b'
        , validate: {
            body: Joi.object().keys({
              quantity: Joi.number().min(5).max(8).required()
            , sku: Joi.string()
            })
          , type: 'json'
          }
        , handler: function*(){ this.status = 200 }
        });

        var app = koa();
        app.use(r.middleware());

        it('no posted values', function(done) {
          test(app).post('/a/b').expect(400, done);
        });

        it('invalid number and valid string',function(done){
          test(app).post('/a/b')
          .send({ quantity: 4, sku: 'x' })
          .expect(400, done);
        });

        it('valid number and invalid string',function(done){
          test(app).post('/a/b')
          .send({ quantity: 6, sku: { x: 'test' } })
          .expect(400, done);
        });

        it('valid number and missing non-required string',function(done){
          test(app).post('/a/b')
          .send({ quantity: 6 })
          .expect(200, done);
        });

        it('valid values',function(done){
          test(app).post('/a/b')
          .send({ quantity: 6, sku: 'x' })
          .expect(200, done);
        });

        it('valid values + unspecified values',function(done){
          test(app).post('/a/b')
          .send({ quantity: 6, sku: 'x', a: 1 })
          .expect(400, done);
        });
      });
    });

    describe('of parts (uploads)', function() {
      it('works', function(done) {
        var r = router();

        r.route({
          method: 'post'
        , path: '/'
        , validate: {
            type: 'multipart'
          }
        , handler: function*(){ this.status = 200 }
        });

        var app = koa();
        app.use(r.middleware());

        test(app).post('/').send({ hi: 'there' }).expect(400, function(err){
          if (err) return done(err);

          var b = new Buffer(1024);
          b.fill('a');

          test(app).post('/')
          .attach('file1', b)
          .expect(200, done)
        });
      });
    });

    describe('with multiple methods', function() {
      describe('and multiple middleware', function() {
        it('works', function(done) {
          function* a(next){
            this.worked = true;
            yield next;
          }

          function* b(){
            this.body = { worked: !! this.worked }
          }

          var r = router();
          r.route({
              path: '/'
            , method: ['post', 'put']
            , handler: [a,b]
            , validate: {
                header: Joi.object({ yum: Joi.string().token() })
                           .options({ allowUnknown: true })
              }
          })

          var app = koa();
          app.use(r.middleware());

          test(app).put('/').set('yum', '&&').expect(400, function(err){
            if (err) return done(err);
            test(app).post('/').set('yum', '&&').expect(400, function(err){
              if (err) return done(err);
              test(app).post('/').set('yum', 'sdfa3_E').expect(200, done)
            });
          });
        });
      });
    });

    describe('methods', function() {
      it('exist', function(done) {
        var r = router();
        methods.forEach(function(method) {
          assert.equal('function', typeof r[method], 'missing method: '+method)
        })
        done();
      });

      methods.forEach(function(method){
        describe(method+'()', function() {
          it('supports path and handler', function(done) {
            var r = router();

            function* handler(){}

            r[method]('/', handler);

            assert.equal(1, r.routes.length);

            var route = r.routes[0];

            assert.equal('/', route.path);
            assert.equal(handler, route.handler[0]);
            assert.equal(method, route.method[0]);

            done();
          });

          it('supports path and multiple handlers', function(done) {
            var r = router();

            function* handler1(){}
            function* handler2(){}

            r[method]('/', handler1, handler2);

            assert.equal(1, r.routes.length);

            var route = r.routes[0];

            assert.equal('/', route.path);
            assert.equal(handler1, route.handler[0]);
            assert.equal(handler2, route.handler[1]);
            assert.equal(method, route.method[0]);

            done();
          });

          it('supports path, config and handler', function(done) {
            var r = router();

            function* handler(){}

            r[method]('/', { meta: true }, handler);

            assert.equal(1, r.routes.length);

            var route = r.routes[0];

            assert.equal('/', route.path);
            assert.equal(handler, route.handler[0]);
            assert.equal(method, route.method[0]);
            assert(route.meta);

            done();
          });

          it('supports path, config and multiple handlers', function(done) {
            var r = router();

            function* handler1(){}
            function* handler2(){}

            r[method]('/', { meta: true }, handler1, handler2);

            assert.equal(1, r.routes.length);

            var route = r.routes[0];

            assert.equal('/', route.path);
            assert.equal(handler1, route.handler[0]);
            assert.equal(handler2, route.handler[1]);
            assert.equal(method, route.method[0]);
            assert(route.meta);

            done();
          });
        });
      })
    });
  });
});
