'use strict'

const { Router } = require('../')
const Koa = require('koa')
const assert = require('assert')
const request = require('supertest')
const http = require('http')
const Joi = require('@hapi/joi')

async function joiValidatorBuilder(schema) {
	const validator = Joi.compile(schema)
	return async (obj) => {
		try {
			const result = await validator.validateAsync(obj)
			return {
				value: result,
			}
		} catch (error) {
			return {
				error,
			}
		}
	}
}

const router = () => {
	return new Router(joiValidatorBuilder)
}

function test(app) {
	return request(http.createServer(app.callback()))
}

describe('koa-validator-router', () => {
	it('exposes a function', (done) => {
		assert.equal('function', typeof router)
		done()
	})

	describe('routes', () => {
		it('is an array', (done) => {
			const r = router()
			assert(Array.isArray(r.routes), 'expected .routes to be an Array')
			done()
		})
	})

	describe('route()', () => {
		it('adds route to the routes array', (done) => {
			const r = router()
			assert.equal(0, r.routes.length)

			r.route({
				method: 'put',
				path: '/asdf/:id',
				handler: () => {},
			})

			assert.equal(1, r.routes.length)
			done()
		})

		it('adds routes to the routes array', (done) => {
			const r = router()
			assert.equal(0, r.routes.length)

			r.route([
				{
					method: 'put',
					path: '/asdf/:id',
					handler: () => {},
				},
				{
					method: 'get',
					path: '/asdf/:id',
					handler: () => {},
				},
			])

			assert.equal(2, r.routes.length)
			done()
		})
	})

	describe('request.params', () => {
		it('are defined based off of the route definition', (done) => {
			const r = router()

			r.route({
				method: 'get',
				path: '/product/:id/:action',
				handler: async (ctx) => {
					assert(
						typeof ctx.params === 'object' && ctx.params !== null,
						'missing params'
					)
					assert.equal(4, ctx.params.id)
					assert.equal('remove', ctx.params.action)
					ctx.status = 200
				},
			})

			const app = new Koa()
			app.use(r.middleware())
			test(app).get('/product/4/remove').expect(200, done)
		})
	})

	describe('request.body', () => {
		describe('when expected type is', () => {
			describe('json', () => {
				describe('and valid json is sent', () => {
					it('is parsed as json', (done) => {
						const r = router()

						r.route({
							method: 'post',
							path: '/',
							handler: fn,
							validate: {
								type: 'json',
							},
						})

						function fn(ctx) {
							ctx.body = ctx.request.body.last + ' ' + ctx.request.body.first
						}

						const app = new Koa()
						app.use(r.middleware())
						test(app)
							.post('/')
							.send({
								last: 'Heckmann',
								first: 'Aaron',
							})
							.expect(200)
							.expect('Heckmann Aaron', done)
					})
				})

				describe('and non-json is sent', () => {
					it('fails', (done) => {
						const r = router()

						r.route({
							method: 'post',
							path: '/',
							handler: function (ctx) {
								ctx.status = 204
							},
							validate: {
								type: 'json',
							},
						})

						const app = new Koa()
						app.use(r.middleware())

						test(app)
							.post('/')
							.type('form')
							.send({
								name: 'Pebble',
							})
							.expect(400, done)
					})

					describe('and validate.continueOnError is true', () => {
						it('runs the route and sets ctx.invalid', (done) => {
							const r = router()

							r.route({
								method: 'post',
								path: '/',
								validate: {
									type: 'json',
									continueOnError: true,
								},
								handler: (ctx) => {
									ctx.status = 200
									ctx.body = ctx.invalid.type.msg
								},
							})

							const app = new Koa()
							app.use(r.middleware())

							test(app)
								.post('/')
								.type('form')
								.send({
									name: 'Pebble',
								})
								.expect(200)
								.expect('expected json', done)
						})
					})
				})

				describe('and invalid json is sent', () => {
					const invalid =
						'{' +
						JSON.stringify({
							name: 'Pebble',
						})

					it('fails', (done) => {
						const r = router()

						r.route({
							method: 'post',
							path: '/',
							handler: (ctx) => {
								ctx.status = 204
							},
							validate: {
								type: 'json',
							},
						})

						const app = new Koa()
						app.use(r.middleware())

						test(app).post('/').type('json').send(invalid).expect(400, done)
					})

					describe('and validate.continueOnError is true', () => {
						it('runs the route and sets ctx.invalid', (done) => {
							const r = router()

							r.route({
								method: 'post',
								path: '/',
								validate: {
									type: 'json',
									continueOnError: true,
								},
								handler: (ctx) => {
									ctx.status = 200
									ctx.body =
										ctx.invalid && ctx.invalid.type && ctx.invalid.type.msg
								},
							})

							const app = new Koa()
							app.use(r.middleware())

							test(app)
								.post('/')
								.type('json')
								.send(invalid)
								.expect(200)
								.expect(/^Unexpected token \{/, done)
						})
					})
				})
			})
		})
	})

	describe('validation', () => {
		describe('of querystring', () => {
			describe('with', () => {
				const r = router()

				r.route({
					method: 'get',
					path: '/a',
					validate: {
						query: Joi.object()
							.keys({
								q: Joi.number().min(5).max(8).required(),
								s: Joi.string().alphanum().length(6),
							})
							.options({
								allowUnknown: true,
							}),
					},
					handler: (ctx) => {
						ctx.body = ctx.request.query
					},
				})

				const app = new Koa()
				app.use(r.middleware())

				it('missing querystring', (done) => {
					test(app).get('/a').expect(400, done)
				})

				it('invalid q and invalid s', (done) => {
					test(app).get('/a?q=100&s=asdfhjkl').expect(400, done)
				})

				it('invalid q and valid s', (done) => {
					test(app).get('/a?q=4&s=asdfgh').expect(400, done)
				})

				it('valid q and invalid s', (done) => {
					test(app).get('/a?q=5&s=dfgh').expect(400, done)
				})

				it('valid q and valid s', (done) => {
					test(app)
						.get('/a?q=5&s=as9fgh')
						.end((err, res) => {
							if (err) return done(err)
							assert.equal(5, res.body.q)
							assert.equal('as9fgh', res.body.s)
							done(err)
						})
				})

				it('valid q and valid s + unspecified values', (done) => {
					test(app)
						.get('/a?q=5&s=as9fgh&sort=10')
						.end((err, res) => {
							assert.equal(5, res.body.q)
							assert.equal('as9fgh', res.body.s)
							assert.equal(10, res.body.sort)
							done(err)
						})
				})
			})

			it('retains the casted values in the route (gh-6, gh-21)', (done) => {
				const r = router()

				r.route({
					method: 'get',
					path: '/a',
					validate: {
						query: Joi.object().keys({
							d: Joi.date().required(),
							n: Joi.number().required(),
							b: Joi.boolean().required(),
						}),
					},
					handler: (ctx) => {
						ctx.body = {
							query: ctx.request.query,
							date: {
								type: typeof ctx.request.query.d,
								instance: ctx.request.query.d instanceof Date,
							},
							number: {
								type: typeof ctx.request.query.n,
							},
							bool: {
								type: typeof ctx.request.query.b,
							},
						}
					},
				})

				const app = new Koa()
				app.use(r.middleware())

				test(app)
					.get('/a?d=7-27-2016&n=34&b=true')
					.end((err, res) => {
						assert.equal('object', res.body.date.type)
						assert.equal(true, res.body.date.instance)
						assert.equal('number', res.body.number.type)
						assert.equal('boolean', res.body.bool.type)
						done(err)
					})
			})
		})

		describe('of params', () => {
			describe('when using regex captures', () => {
				const r = router()

				r.route({
					method: 'get',
					path: '/id/(\\d+)-(\\d+)',
					validate: {
						params: Joi.object().keys({
							0: Joi.number().min(5).max(10),
							1: Joi.number().max(1000),
						}),
					},
					handler: (ctx) => {
						ctx.body = ctx.params
					},
				})

				const app = new Koa()
				app.use(r.middleware())

				it('with invalid first match', (done) => {
					test(app).get('/id/2-9').expect(400, done)
				})

				it('with invalid second match', (done) => {
					test(app).get('/id/7-1001').expect(400, done)
				})

				it('with valid matches', (done) => {
					test(app).get('/id/7-1000').expect(200, done)
				})
			})

			describe('with', () => {
				const r = router()

				r.route({
					method: 'get',
					path: '/a/:quantity/:sku',
					validate: {
						params: Joi.object().keys({
							quantity: Joi.number().min(5).max(8).required(),
							sku: Joi.string().alphanum().length(6),
						}),
					},
					handler: (ctx) => {
						ctx.body = ctx.params
					},
				})

				const app = new Koa()
				app.use(r.middleware())

				it('invalid quantity and invalid sku', (done) => {
					test(app).get('/a/as/asdfgh').expect(400, done)
				})

				it('invalid quantity and valid sku', (done) => {
					test(app).get('/a/4/asdfgh').expect(400, done)
				})

				it('valid quantity and invalid sku', (done) => {
					test(app).get('/a/5/dfgh').expect(400, done)
				})

				it('valid quantity and valid sku', (done) => {
					test(app)
						.get('/a/5/as9fgh')
						.expect(200)
						.expect('Content-Type', /json/)
						.set('Accept', 'application/json')
						.end((err, res) => {
							if (err) return done(err)
							assert.equal(5, res.body.quantity)
							assert.equal('as9fgh', res.body.sku)
							done(err)
						})
				})
			})

			it('retains the casted values in the route', (done) => {
				const r = router()

				r.route({
					method: 'get',
					path: '/:field/:d/:n/:b',
					validate: {
						params: Joi.object().keys({
							d: Joi.date().required(),
							n: Joi.number().required(),
							b: Joi.boolean().required(),
							field: Joi.any(),
						}),
					},
					handler: async function (ctx) {
						const params =
							ctx.params.field === 'request' ? ctx.params : ctx.params

						ctx.body = {
							params: params,
							date: {
								type: typeof params.d,
								instance: params.d instanceof Date,
							},
							number: {
								type: typeof params.n,
							},
							bool: {
								type: typeof params.b,
							},
						}
					},
				})

				const app = new Koa()
				app.use(r.middleware())

				test(app)
					.get('/request/7-27-2016/34/true')
					.end((err, res) => {
						if (err) return done(err)
						assert.equal('object', res.body.date.type)
						assert.equal(true, res.body.date.instance)
						assert.equal('number', res.body.number.type)
						assert.equal('boolean', res.body.bool.type)

						test(app)
							.get('/params/7-27-2016/34/true')
							.end((err, res) => {
								assert.equal('object', res.body.date.type)
								assert.equal(true, res.body.date.instance)
								assert.equal('number', res.body.number.type)
								assert.equal('boolean', res.body.bool.type)
								done(err)
							})
					})
			})
		})

		describe('of headers', () => {
			const r = router()

			r.route({
				method: 'post',
				path: '/a/b',
				validate: {
					header: Joi.object({
						'x-for-fun': Joi.number().min(5).max(8).required(),
					}).options({ allowUnknown: true }),
				},
				handler: (ctx) => {
					ctx.status = 204
				},
			})

			const app = new Koa()
			app.use(r.middleware())

			it('with missing header fails', (done) => {
				test(app).post('/a/b').expect(400, done)
			})

			it('with invalid header (min) fails', (done) => {
				test(app).post('/a/b').set('X-For-Fun', 4).expect(400, done)
			})

			it('with invalid header (max) fails', (done) => {
				test(app).post('/a/b').set('X-For-Fun', 9).expect(400, done)
			})

			it('with valid header works', (done) => {
				test(app).post('/a/b').set('X-For-Fun', 6).expect(204, done)
			})
		})

		describe('of body', () => {
			describe('when validate.type', () => {
				describe('is specified', () => {
					const tests = {
						json: 1,
					}

					Object.keys(tests).forEach((name) => {
						describe('with ' + name, () => {
							it(tests[name] ? 'works' : 'fails', (done) => {
								const r = router()

								const method = tests[name] ? assert.doesNotThrow : assert.throws

								method(() => {
									r.route({
										method: 'post',
										path: '/',
										handler: () => {},
										validate: {
											body: Joi.object({ name: Joi.string() }),
											type: name,
										},
									})
								})

								done()
							})
						})
					})
				})
			})

			describe('with', () => {
				const r = router()

				r.route({
					method: 'post',
					path: '/a/b',
					validate: {
						body: Joi.object().keys({
							quantity: Joi.number().min(5).max(8).required(),
							sku: Joi.string(),
						}),
						type: 'json',
					},
					handler: (ctx) => {
						ctx.status = 200
					},
				})

				const app = new Koa()
				app.use(r.middleware())

				it('no posted values', (done) => {
					test(app).post('/a/b').expect(400, done)
				})

				it('invalid number and valid string', (done) => {
					test(app)
						.post('/a/b')
						.send({
							quantity: 4,
							sku: 'x',
						})
						.expect(400, done)
				})

				it('valid number and invalid string', (done) => {
					test(app)
						.post('/a/b')
						.send({
							quantity: 6,
							sku: { x: 'test' },
						})
						.expect(400, done)
				})

				it('valid number and missing non-required string', (done) => {
					test(app).post('/a/b').send({ quantity: 6 }).expect(200, done)
				})

				it('valid values', (done) => {
					test(app)
						.post('/a/b')
						.send({
							quantity: 6,
							sku: 'x',
						})
						.expect(200, done)
				})

				it('valid values + unspecified values', (done) => {
					test(app)
						.post('/a/b')
						.send({
							quantity: 6,
							sku: 'x',
							a: 1,
						})
						.expect(400, done)
				})
			})

			describe('when invalid data is submitted', () => {
				describe('and validate.continueOnError is true', () => {
					it('runs the route and sets ctx.invalid', (done) => {
						const r = router()

						r.route({
							method: 'post',
							path: '/',
							validate: {
								type: 'json',
								continueOnError: true,
								body: {
									name: Joi.string().min(10),
								},
							},
							handler: (ctx) => {
								ctx.status = 200
								ctx.body = !!ctx.invalid
							},
						})

						const app = new Koa()
						app.use(r.middleware())

						test(app)
							.post('/')
							.send({ name: 'Pebble' })
							.expect(200)
							.expect('true', done)
					})
				})
			})
		})

		describe('of output', () => {
			describe('status code patterns', () => {
				it('allows single status codes', () => {
					const r = router()
					assert.doesNotThrow(() => {
						r.route({
							method: 'get',
							path: '/single',
							validate: {
								output: {
									'200': { body: Joi.any().equal('asdr') },
								},
							},
							handler: () => {},
						})
					})
				})

				it('allows commas', () => {
					const r = router()
					assert.doesNotThrow(() => {
						r.route({
							method: 'get',
							path: '/commas',
							validate: {
								output: {
									'201,202': { body: Joi.any().equal('band-reject') },
								},
							},
							handler: () => {},
						})
					})
				})

				it('allows spaces between status codes', () => {
					const r = router()
					assert.doesNotThrow(() => {
						r.route({
							method: 'post',
							path: '/spaces',
							validate: {
								output: {
									'400, 401': { body: Joi.any().equal('low-pass') },
								},
							},
							handler: () => {},
						})
					})
				})

				it('allows ranges', () => {
					const r = router()
					assert.doesNotThrow(() => {
						r.route({
							method: 'post',
							path: '/ranges',
							validate: {
								output: {
									'402-404': { body: Joi.any().equal('hi-pass') },
								},
							},
							handler: () => {},
						})
					})
				})

				it('allows combinations of integers, commas and ranges', async () => {
					const r = router()

					assert.doesNotThrow(() => {
						r.route({
							method: 'post',
							path: '/combo/:status',
							validate: {
								output: {
									'500-502, 504 ,506-510,201': {
										body: Joi.any().equal('band-pass'),
									},
								},
							},
							handler: function (ctx) {
								ctx.status = parseInt(ctx.params.status, 10)

								if (ctx.params.status === '200') {
									ctx.body = { 'pass-thru': 1 }
								} else {
									ctx.body = 'band-pass'
								}
							},
						})
					})

					const app = new Koa()
					app.use(r.middleware())

					await test(app).post('/combo/500').expect('band-pass').expect(500)
					await test(app).post('/combo/501').expect('band-pass').expect(501)
					await test(app).post('/combo/504').expect('band-pass').expect(504)
					await test(app).post('/combo/506').expect('band-pass').expect(506)
					await test(app).post('/combo/510').expect('band-pass').expect(510)
					await test(app).post('/combo/201').expect('band-pass').expect(201)
					await test(app).post('/combo/200').expect(200)
				})

				it('allows the "*" to represent all status codes', async () => {
					const r = router()

					assert.doesNotThrow(() => {
						r.route({
							method: 'get',
							path: '/all',
							validate: {
								output: {
									'*': { body: Joi.any().equal('all') },
								},
							},
							handler: function (ctx) {
								ctx.status = 201
								ctx.body = 'all'
							},
						})
					})

					const app = new Koa()
					app.use(r.middleware())
					await test(app).get('/all').expect('all').expect(201)
				})

				it('throws on non-digit, comma, dash or space', () => {
					const r = router()
					assert.throws(() => {
						r.route({
							method: 'get',
							path: '/invalid',
							validate: {
								output: {
									'%': { body: Joi.string() },
								},
							},
							handler: () => {},
						})
					})
				})

				it('throws if any status code patterns overlap', () => {
					const r = router()

					assert.throws(() => {
						r.route({
							method: 'get',
							path: '/overlap/1',
							validate: {
								output: {
									'200': { body: Joi.any().equal('all') },
									'200, 201': { body: Joi.any().equal('all') },
								},
							},
							handler: (ctx) => {
								ctx.body = 'all'
							},
						})
					}, /200 <=> 200, 201/)

					assert.throws(() => {
						r.route({
							method: 'get',
							path: '/overlap/2',
							validate: {
								output: {
									'400': { body: Joi.any().equal('all') },
									'200-500': { body: Joi.any().equal('all') },
								},
							},
							handler: (ctx) => {
								ctx.body = 'all'
							},
						})
					}, /400 <=> 200-500/)

					assert.throws(() => {
						r.route({
							method: 'get',
							path: '/overlap/22',
							validate: {
								output: {
									'200-500': { body: Joi.any().equal('all') },
									'404': { body: Joi.any().equal('all') },
								},
							},
							handler: (ctx) => {
								ctx.body = 'all'
							},
						})
					}, /404 <=> 200-500/)

					assert.throws(() => {
						r.route({
							method: 'get',
							path: '/overlap/3',
							validate: {
								output: {
									'201, 204-208': { body: Joi.any().equal('all') },
									'200,204': { body: Joi.any().equal('all') },
								},
							},
							handler: (ctx) => {
								ctx.body = 'all'
							},
						})
					}, /201, 204-208 <=> 200,204/)

					assert.throws(() => {
						r.route({
							method: 'get',
							path: '/overlap/4',
							validate: {
								output: {
									'400, 404': { body: Joi.any().equal('all') },
									'200, 201-203, 206, 301-400': {
										body: Joi.any().equal('all'),
									},
								},
							},
							handler: (ctx) => {
								ctx.body = 'all'
							},
						})
					}, /400, 404 <=> 200, 201-203, 206, 301-400/)

					assert.throws(() => {
						r.route({
							method: 'get',
							path: '/overlap/5',
							validate: {
								output: {
									'*': { body: Joi.any().equal('all') },
									'500': { body: Joi.any().equal('all') },
								},
							},
							handler: (ctx) => {
								ctx.body = 'all'
							},
						})
					}, /500 <=> \*/)
				})

				it('does not throw if status code patterns do not overlap', () => {
					const r = router()
					assert.doesNotThrow(() => {
						r.route({
							method: 'get',
							path: '/overlap/1',
							validate: {
								output: {
									'200': { body: Joi.any().equal('all') },
									'201, 202': { body: Joi.any().equal('all') },
									'203-599': { body: Joi.any().equal('all') },
								},
							},
							handler: () => {},
						})
					})
				})
			})

			describe('fields', () => {
				it('does not throw if headers is specified but not body', () => {
					const r = router()
					assert.doesNotThrow(() => {
						r.route({
							method: 'get',
							path: '/',
							validate: {
								output: {
									'200': { headers: { x: Joi.any() } },
								},
							},
							handler: () => {},
						})
					})
				})

				it('does not throw if body is specified but not headers', () => {
					const r = router()
					assert.doesNotThrow(() => {
						r.route({
							method: 'get',
							path: '/',
							validate: {
								output: {
									'200': { body: { x: Joi.any() } },
								},
							},
							handler: () => {},
						})
					})
				})
			})

			describe('body,', () => {
				describe('when specified,', () => {
					const r = router()

					r.route({
						method: 'post',
						path: '/a/b',
						validate: {
							output: {
								'100-599': { body: { n: Joi.number().max(10).required() } },
							},
						},
						handler: (ctx) => {
							ctx.body = { n: '3' }
						},
					})

					r.route({
						method: 'post',
						path: '/body/missing',
						validate: {
							output: {
								'200': { body: Joi.number().required() },
							},
						},
						handler: (ctx) => {
							ctx.status = 200
						},
					})

					r.route({
						method: 'post',
						path: '/body/invalid',
						validate: {
							output: {
								'*': {
									body: Joi.object({
										y: Joi.string().min(3),
									}),
								},
							},
						},
						handler: (ctx) => {
							ctx.body = {
								x: 'hi',
								y: 'asdf',
							}
						},
					})

					const app = new Koa()
					app.use(r.middleware())

					it('casts output values according to Joi rules', async () => {
						// n should be cast to a number
						await test(app).post('/a/b').expect('{"n":3}').expect(200)
					})

					describe('but not included in response', () => {
						it('responds with a 500', async () => {
							await test(app).post('/body/missing').expect(500)
						})
					})

					describe('when output is invalid', () => {
						it('responds with a 500', async () => {
							await test(app).post('/body/invalid').expect(500)
						})
					})
				})

				describe('when not specified,', () => {
					const r = router()

					r.route({
						method: 'post',
						path: '/notouch',
						handler: (ctx) => {
							ctx.body = { n: '4' }
						},
					})

					const app = new Koa()
					app.use(r.middleware())

					it('is not touched', async () => {
						const o = await test(app).post('/notouch').expect(200)
						assert.strictEqual(o.text, '{"n":"4"}')
					})
				})
			})

			describe('headers', () => {
				const headers = Joi.object({
					n: Joi.string().max(3).required(),
				}).options({
					allowUnknown: true,
				})

				describe('when specified', () => {
					const r = router()

					r.route({
						method: 'post',
						path: '/headers/cast',
						validate: {
							output: {
								'100-599': {
									headers: headers,
								},
							},
						},
						handler: (ctx) => {
							ctx.set('n', '  3')
							ctx.body = 'RWC'
						},
					})

					r.route({
						method: 'post',
						path: '/headers/missing',
						validate: {
							output: {
								'200': {
									headers: headers,
								},
							},
						},
						handler: (ctx) => {
							ctx.set('nope', 5)
							ctx.body = 'RWC'
						},
					})

					r.route({
						method: 'post',
						path: '/headers/invalid',
						validate: {
							output: {
								'*': {
									headers: headers,
								},
							},
						},
						handler: (ctx) => {
							ctx.set('n', 1000)
							ctx.body = 'RWC'
						},
					})

					const app = new Koa()
					app.use(r.middleware())

					it('casts output values according to Joi rules', async () => {
						await test(app).post('/headers/cast').expect('n', '3').expect(200)
					})

					describe('but not included in response', () => {
						it('responds with a 500', async () => {
							await test(app).post('/headers/missing').expect(500)
						})
					})

					describe('when output is invalid', () => {
						it('responds with a 500', async () => {
							await test(app).post('/headers/invalid').expect(500)
						})
					})
				})

				describe('when not specified', () => {
					const r = router()

					r.route({
						method: 'post',
						path: '/notouch',
						handler: (ctx) => {
							ctx.set('n', '3')
							ctx.body = 'RWC'
						},
					})

					const app = new Koa()
					app.use(r.middleware())

					it('is not touched', async () => {
						const o = await test(app).post('/notouch').expect(200)
						assert.strictEqual(o.header.n, '3')
					})
				})
			})

			it('does not occur when no status code matches', async () => {
				const r = router()

				r.route({
					method: 'post',
					path: '/notouch',
					validate: {
						output: {
							'510': { body: { n: Joi.string() } },
						},
					},
					handler: (ctx) => {
						ctx.body = { n: 4 }
					},
				})

				const app = new Koa()
				app.use(r.middleware())

				const o = await test(app).post('/notouch').expect(200)
				assert.strictEqual(o.text, '{"n":4}')
			})
		})
	})

	describe('use()', () => {
		describe('applies middleware in the order it was added', () => {
			it('can apply middleware before routes', async () => {
				const r = router()
				let middlewareRanFirst = false

				r.use(async (ctx, next) => {
					middlewareRanFirst = true
					await next()
				})

				r.route({
					method: 'get',
					path: '/test',
					handler: (ctx) => {
						ctx.body = String(middlewareRanFirst)
					},
				})

				const app = new Koa()
				app.use(r.middleware())

				await test(app).get('/test').expect('true').expect(200)
			})

			it('can apply middleware after routes', async () => {
				const r = router()
				let middlewareRanFirst = false

				r.route({
					method: 'get',
					path: '/test',
					handler: (ctx) => {
						ctx.body = String(middlewareRanFirst)
					},
				})

				r.use(async (ctx, next) => {
					middlewareRanFirst = true
					await next()
				})

				const app = new Koa()
				app.use(r.middleware())

				await test(app).get('/test').expect('false').expect(200)
			})
		})

		describe('accepts an optional path', () => {
			it('which applies middleware only to that path', async () => {
				const r = router()
				let middlewareRan = false

				r.use('/nada', async (ctx, next) => {
					middlewareRan = true
					await next()
				})

				function route(ctx) {
					ctx.body = String(middlewareRan)
				}

				r.route({ method: 'get', path: '/nada', handler: route })
				r.route({ method: 'get', path: '/test', handler: route })

				const app = new Koa()
				app.use(r.middleware())

				await test(app).get('/test').expect('false').expect(200)

				await test(app).get('/nada').expect('true').expect(200)
			})
		})
	})

	describe('prefix()', () => {
		it('adds routes as children of the `path`', async () => {
			const app = new Koa()
			app.context.msg = 'fail'

			const r = router()

			r.use(async (ctx, next) => {
				ctx.msg = 'works'
				await next()
			})

			r.route({
				method: 'get',
				path: '/',
				handler: (ctx) => {
					ctx.body = ctx.msg
				},
			})

			r.route({
				method: 'get',
				path: '/itworks',
				handler: (ctx) => {
					ctx.body = 'it' + ctx.msg
				},
			})

			r.route({
				method: 'get',
				path: '/testparam/:id',
				validate: { params: { id: Joi.string().min(4) } },
				handler: (ctx) => {
					ctx.body = `it${ctx.msg}${ctx.params.id}`
				},
			})

			r.prefix('/user')

			app.use(r.middleware())

			await test(app).get('/').expect(404)

			await test(app).get('/user').expect('works').expect(200)

			await test(app).get('/user/').expect('works').expect(200)

			await test(app).get('/user/itworks').expect('itworks').expect(200)

			await test(app).get('/user/itworks/').expect('itworks').expect(200)

			await test(app)
				.get('/user/testparam/dude')
				.expect('itworksdude')
				.expect(200)
		})
	})

	describe('param()', () => {
		it('defines middleware for named route params', async () => {
			const app = new Koa()
			const r = router()
			const users = { '2': 'aaron' }

			r.param('user', async (id, ctx, next) => {
				ctx.user = await Promise.resolve(users[id])

				if (!ctx.user) {
					ctx.status = 404
					return
				}

				await next()
			})

			r.route({
				method: 'get',
				path: '/user/:user',
				handler: (ctx) => {
					ctx.body = `hello ${ctx.user}`
				},
			})

			app.use(r.middleware())

			await test(app).get('/user/1').expect(404)

			await test(app).get('/user/2').expect('hello aaron').expect(200)
		})
	})
})
