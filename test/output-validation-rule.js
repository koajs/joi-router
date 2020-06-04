'use strict'

const { OutputValidationRule } = require('../build/output-validation-rule')
const Joi = require('@hapi/joi')
const assert = require('assert')

describe('OutputValidationRule', () => {
	describe('.overlaps()', () => {
		it('properly detects when rules do not overlap', () => {
			const spec = { body: { a: Joi.any().required() } }
			const a = new OutputValidationRule('200', spec)
			const b = new OutputValidationRule('201', spec)
			assert.strictEqual(false, a.overlaps(b))
		})
	})
})
