import { identityValidator, makeBodyParser, makeValidator } from './helpers'
import KoaRouter from '@koa/router'
import { Spec, ValidatorBuilder } from './types'
import createDebug from 'debug'

const debug = createDebug('koa-joi-router')

export class Router<Schema> {
	public routes: Spec<Schema>[] = []
	public router = new KoaRouter()

	constructor(
		private validatorBuilder: ValidatorBuilder<Schema> = identityValidator
	) {}

	public prefix = this.router.prefix.bind(this.router)
	public use = this.router.use.bind(this.router)
	public param = this.router.param.bind(this.router)
	public allowedMethods = this.router.allowedMethods.bind(this.router)

	public middleware() {
		return this.router.routes()
	}

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
	public route(spec: Spec<Schema>) {
		if (Array.isArray(spec)) {
			for (let i = 0; i < spec.length; i++) {
				this.addRoute(spec[i])
			}
		} else {
			this.addRoute(spec)
		}

		return this
	}

	/**
	 * Adds a route to this router, storing the route
	 * in `this.routes`.
	 *
	 * @param {Object} spec
	 * @api private
	 */

	private addRoute(spec: Spec<Schema>) {
		this.routes.push(spec)

		debug('add %s "%s"', spec.method, spec.path)

		const bodyParser = makeBodyParser(spec)
		const validator = makeValidator(spec, this.validatorBuilder)
		const preHandlers = Array.isArray(spec.pre)
			? spec.pre.flat(Infinity)
			: [spec.pre]
		const handlers = Array.isArray(spec.handler)
			? spec.handler.flat(Infinity)
			: [spec.handler]

		const args = [
			...(preHandlers ?? []),
			bodyParser,
			validator,
			...handlers,
		].filter((middleware) => !!middleware)

		this.router[spec.method](spec.path, ...args)
	}
}
