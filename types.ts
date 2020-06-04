import * as CoBody from 'co-body'
import * as Koa from 'koa'

type FullHandler = (ctx: Koa.Context, next: Koa.Next) => any
// interface NestedHandler extends ReadonlyArray<Handler> {}
export type NestedHandler = ReadonlyArray<Handler>
export type Handler = FullHandler | NestedHandler

export interface OutputValidationObject<Schema> {
	[status: string]: OutputValidation<Schema>
}
export type OutputValidation<Schema> = { body?: Schema; headers?: Schema }

export interface IValidateObject<Schema> {
	header?: Schema
	query?: Schema
	params?: Schema
	body?: Schema
	maxBody?: number

	/**
	 * status code when validation fails
	 */
	failure?: number
	type?: 'form' | 'json' | 'multipart' | 'stream'
	formOptions?: CoBody.Options
	jsonOptions?: CoBody.Options
	multipartOptions?: CoBody.Options
	output?: OutputValidationObject<Schema>
	continueOnError?: boolean
}

export interface Config<Schema> {
	pre?: Handler
	validate?: IValidateObject<Schema>
	meta?: any
}

export interface Spec<Schema> extends Config<Schema> {
	method: 'get' | 'put' | 'post' | 'patch' | 'delete' | 'del'
	path: string | RegExp
	handler: Handler
}

export type IValidationError = any
export type IValidationWarning = any

export interface IValidationResult {
	value?: any
	error?: IValidationError
	warning?: IValidationWarning
}

export type Validator = (data: any) => Promise<IValidationResult>

export type ValidatorBuilder<Schema> = (schema: Schema) => Promise<Validator>

export interface IRange {
	lower: number
	upper: number
}
