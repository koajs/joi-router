'use strict';

const Rule = require('../output-validation-rule');
const Joi = require('joi');
const assert = require('assert');

describe('OutputValidationRule', () => {
  describe('.overlaps()', () => {
    it('properly detects when rules do not overlap', () => {
      const spec = { body: { a: Joi.any().required() } };
      const a = new Rule('200', spec);
      const b = new Rule('201', spec);
      assert.strictEqual(false, a.overlaps(b));
    });
  });
});
