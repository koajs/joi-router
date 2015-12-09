'use strict';

var OutputValidationRule = require('./output-validation-rule');
var assert = require('assert');

module.exports = OutputValidator;

function OutputValidator(output) {
  assert.equal('object', typeof output, 'spec.validate.output must be an object');

  this.rules = OutputValidator.tokenizeRules(output);
  OutputValidator.assertNoOverlappingStatusRules(this.rules);

  this.output = output;
}

OutputValidator.tokenizeRules = function tokenizeRules(output) {
  return Object.keys(output).map(function createRule(status) {
    return new OutputValidationRule(status, output[status]);
  });
};

OutputValidator.assertNoOverlappingStatusRules =
function assertNoOverlappingStatusRules(rules) {
  for (var i = 0; i < rules.length; ++i) {
    var ruleA = rules[i];

    for (var j = 0; j < rules.length; ++j) {
      if (i === j) continue;

      var ruleB = rules[j];
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

  for (var i = 0; i < this.rules.length; ++i) {
    var rule = this.rules[i];
    if (rule.matches(ctx)) {
      return rule.validateOutput(ctx);
    }
  }
};
