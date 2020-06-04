import {
	OutputValidationObject,
	ValidatorBuilder,
	IValidationError,
} from './types'
import { OutputValidationRule } from './output-validation-rule'
import { Context } from 'koa'

export class OutputValidator<Schema> {
	static assertNoOverlappingStatusRules<T>(rules: OutputValidationRule<T>[]) {
		for (let i = 0; i < rules.length; ++i) {
			const ruleA = rules[i]

			for (let j = 0; j < rules.length; ++j) {
				if (i === j) continue

				const ruleB = rules[j]
				if (ruleA.overlaps(ruleB)) {
					throw new Error(
						'Output validation rules may not overlap: ' +
							ruleA +
							' <=> ' +
							ruleB
					)
				}
			}
		}
	}

	private rules: OutputValidationRule<Schema>[] = []

	static tokenizeRules<T>(output: OutputValidationObject<T>) {
		return Object.keys(output).map(
			(status) => new OutputValidationRule(status, output[status])
		)
	}

	constructor(output: OutputValidationObject<Schema>) {
		this.rules = OutputValidator.tokenizeRules(output)
		OutputValidator.assertNoOverlappingStatusRules(this.rules)
	}

	public async validate(
		ctx: Context,
		validatorBuilder: ValidatorBuilder<Schema>
	): Promise<IValidationError[] | null> {
		for (let rule of this.rules) {
			if (rule.matches(ctx.status)) {
				return rule.validateOutput(ctx, validatorBuilder)
			}
		}

		return null
	}
}
