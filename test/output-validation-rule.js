'use strict';

var Rule = require('../output-validation-rule');
var Joi = require('joi');
var assert = require('assert');

describe('OutputValidationRule', function() {
  describe('.overlaps()', function() {
    it('properly detects when rules do not overlap', function() {
      var spec = { body: { a: Joi.any().required() } };
      var a = new Rule('200', spec);
      var b = new Rule('201', spec);
      assert.strictEqual(false, a.overlaps(b));
    });
  });
});
