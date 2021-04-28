'use strict';

const assert = require('assert');
const OutputValidationRule = require('./output-validation-rule');

class OutputValidator {
  constructor(output) {
    assert.strictEqual('object', typeof output, 'spec.validate.output must be an object');

    this.rules = OutputValidator.tokenizeRules(output);
    OutputValidator.assertNoOverlappingStatusRules(this.rules);

    this.output = output;
  }

  static tokenizeRules(output) {
    function createRule(status) {
      return new OutputValidationRule(status, output[status]);
    }
    return Object.keys(output).map(createRule);
  }

  static assertNoOverlappingStatusRules(rules) {
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
  }

  validate(ctx) {
    assert(ctx, 'missing request context!');

    for (let i = 0; i < this.rules.length; ++i) {
      const rule = this.rules[i];
      if (rule.matches(ctx)) {
        return rule.validateOutput(ctx);
      }
    }
  }
}

module.exports = OutputValidator;
