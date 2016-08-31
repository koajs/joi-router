'use strict';

const OutputValidationRule = require('./output-validation-rule');
const assert = require('assert');

module.exports = OutputValidator;

function OutputValidator(output) {
  assert.equal('object', typeof output, 'spec.validate.output must be an object');

  this.rules = OutputValidator.tokenizeRules(output);
  OutputValidator.assertNoOverlappingStatusRules(this.rules);

  this.output = output;
}

OutputValidator.tokenizeRules = function tokenizeRules(output) {
  function createRule(status) {
    return new OutputValidationRule(status, output[status]);
  }
  return Object.keys(output).map(createRule);
};

OutputValidator.assertNoOverlappingStatusRules =
function assertNoOverlappingStatusRules(rules) {
  for (let i = 0; i < rules.length; ++i) {
    const ruleA = rules[i];

    for (let j = 0; j < rules.length; ++j) {
      if (i === j) continue;

      const ruleB = rules[j];
      if (ruleA.overlaps(ruleB)) {
        throw new Error(
          'Output validation rules may not overlap: ' + ruleA + ' <=> ' + ruleB
        );
      }
    }
  }
};

OutputValidator.prototype.validate = function(ctx) {
  assert(ctx, 'missing request context!');

  for (let i = 0; i < this.rules.length; ++i) {
    const rule = this.rules[i];
    if (rule.matches(ctx)) {
      return rule.validateOutput(ctx);
    }
  }
};
