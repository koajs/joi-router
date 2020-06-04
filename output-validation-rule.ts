import {
	IRange,
	ValidatorBuilder,
	OutputValidation,
	IValidationError,
} from './types'
import { rangify } from './helpers'
import { Context } from 'koa'

export class OutputValidationRule<Schema> {
	static overlaps<T>(a: OutputValidationRule<T>, b: OutputValidationRule<T>) {
		return a.ranges.some(function checkRangeA(rangeA: any) {
			return b.ranges.some(function checkRangeB(rangeB: any) {
				if (rangeA.upper >= rangeB.lower && rangeA.lower <= rangeB.upper) {
					return true
				}
				return false
			})
		})
	}

	private ranges: IRange[] = []

	constructor(private status: string, private spec: OutputValidation<Schema>) {
		this.ranges = status
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.map(rangify)
	}

	public overlaps(ruleB: OutputValidationRule<Schema>) {
		return OutputValidationRule.overlaps<Schema>(this, ruleB)
	}

	public matches(status: number) {
		for (let range of this.ranges) {
			if (status >= range.lower && status <= range.upper) {
				return true
			}
		}

		return false
	}

	public async validateOutput(
		ctx: Context,
		validatorBuilder: ValidatorBuilder<Schema>
	): Promise<IValidationError[] | null> {
		let result

		if (this.spec.headers) {
			const validator = await validatorBuilder(this.spec.headers)
			result = await validator(ctx.response.headers)

			if (result.error) return result.error

			// use casted values
			ctx.set(result.value)
		}

		if (this.spec.body) {
			const validator = await validatorBuilder(this.spec.body)
			result = await validator(ctx.body)

			if (result.error) return result.error
			// use casted values
			ctx.body = result.value
		}

		return null
	}

	toString() {
		return this.status
	}
}
