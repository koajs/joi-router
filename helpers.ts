import {
	Spec,
	ValidatorBuilder,
	IRange,
	IValidateObject,
	IValidationError,
	Validator,
} from './types'
import { Middleware } from '@koa/router'
import { Context } from 'koa'
import assert from 'assert'
import * as parse from 'co-body'
import { OutputValidator } from './output-validator'

type InputProp = 'header' | 'query' | 'params' | 'body'

export async function identityValidator<Schema>(
	validator: Schema
): Promise<Validator> {
	// @ts-ignore
	return validator
}

/**
 * Handles parser internal errors
 * @param  {Object} spec
 * @param  {function} parsePayload
 * @return {async function}
 * @api private
 */
function wrapError<Schema>(spec: Spec<Schema>, parsePayload: any): Middleware {
	return async function errorHandler(ctx, next) {
		try {
			await parsePayload(ctx, next)
		} catch (err) {
			captureError(ctx, 'type', err)
			if (spec.validate?.continueOnError) {
				return await next()
			} else {
				return ctx.throw(err)
			}
		}
	}
}

/**
 * Creates JSON body parser middleware.
 *
 * @param {Object} spec
 * @return {async function}
 * @api private
 */
function makeJSONBodyParser<Schema>(spec: Spec<Schema>): Middleware {
	const opts = spec?.validate?.jsonOptions ?? {}
	opts.limit = opts.limit ?? spec?.validate?.maxBody

	return async function parseJSONPayload(ctx, next) {
		if (!ctx.request.is('json')) {
			ctx.throw(400, 'expected json')
			return
		}

		// eslint-disable-next-line require-atomic-updates
		// @ts-ignore
		ctx.request.body = ctx.request.body ?? (await parse.json(ctx, opts))
		await next()
	}
}

/**
 * Creates body parser middleware.
 *
 * @param {Object} spec
 * @return {async function}
 * @api private
 */

export function makeBodyParser<Schema>(spec: Spec<Schema>) {
	if (!(spec.validate && spec.validate.type)) return null

	switch (spec.validate.type) {
		case 'json':
			return wrapError(spec, makeJSONBodyParser(spec))
		case 'form':
		case 'stream':
		case 'multipart':
		default:
			throw new Error(`unsupported body type: ${spec.validate.type}`)
	}
}

/**
 * @api private
 */

function captureError(ctx: Context, type: string, err: any) {
	// expose Error message to JSON.stringify()
	err.msg = err.message
	if (!ctx.invalid) ctx.invalid = {}
	ctx.invalid[type] = err
}

/**
 * Creates validator middleware.
 *
 * @param {Object} spec
 * @return {async function}
 * @api private
 */

export function makeValidator<Schema>(
	spec: Spec<Schema>,
	validatorBuilder: ValidatorBuilder<Schema>
): Middleware {
	const inputProps = ['header', 'query', 'params', 'body'] as const

	const outputValidator = spec.validate?.output
		? new OutputValidator(spec.validate?.output)
		: null

	return async function validator(ctx, next) {
		if (!spec.validate) return await next()

		let err: IValidationError

		for (let prop of inputProps) {
			if (spec.validate[prop]) {
				err = await validateInput(prop, ctx, spec.validate, validatorBuilder)

				if (err) {
					captureError(ctx, prop, err)
					if (!spec.validate.continueOnError) return ctx.throw(err)
				}
			}
		}

		await next()

		if (outputValidator) {
			err = await outputValidator.validate(ctx, validatorBuilder)

			if (err) {
				err.status = 500
				return ctx.throw(err)
			}
		}
	}
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

async function validateInput<Schema>(
	prop: InputProp,
	ctx: Context,
	validate: IValidateObject<Schema>,
	validatorBuilder: ValidatorBuilder<Schema>
) {
	const validatorSchema = validate[prop]

	if (validatorSchema) {
		const validatedValue =
			prop === 'params' ? ctx.params : (ctx.request as any)[prop]

		const validator = await validatorBuilder(validatorSchema)
		const result = await validator(validatedValue)

		if (result.error) {
			result.error.status = validate.failure ?? 400
			return result.error
		}

		// update our request w/ the casted values
		switch (prop) {
			case 'header': // request.header is getter only, cannot set it
			case 'query': // setting request.query directly causes casting back to strings
				Object.keys(result.value).forEach((key) => {
					ctx.request[prop][key] = result.value[key]
				})
				break
			case 'params':
				ctx.params = result.value
				break
			default:
				// @ts-ignore
				ctx.request[prop] = result.value
		}
	}
}

function validateCode(code: string) {
	assert(
		/^[1-5][0-9]{2}$/.test(code),
		'invalid status code: ' + code + ' must be between 100-599'
	)
}

export function rangify(rule: string): IRange {
	if (rule === '*') {
		return { lower: 0, upper: Infinity }
	}

	const parts = rule.split('-')
	assert(parts.length && parts.length < 3, 'invalid status code: ' + rule)

	const lower = parts[0]
	const upper = parts.length === 2 ? parts[1] : lower

	validateCode(lower)
	validateCode(upper)

	return { lower: parseInt(lower, 10), upper: parseInt(upper, 10) }
}
