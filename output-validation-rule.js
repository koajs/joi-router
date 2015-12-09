'use strict';

var assert = require('assert');
var Joi = require('joi');
var helpMsg = ' -> see: https://github.com/pebble/koa-joi-router/#validating-output';

module.exports = OutputValidationRule;

function OutputValidationRule(status, spec) {
  assert(status, 'OutputValidationRule: missing status param');
  assert(spec, 'OutputValidationRule: missing spec param');

  this.ranges = status.split(',').map(trim).filter(Boolean).map(rangify);
  assert(this.ranges.length > 0, 'invalid status code: ' + status + helpMsg);

  this.status = status;
  this.spec = spec;
  this.validateSpec();
}

/**
 * Validates it's input values
 *
 * @throws Error
 */

OutputValidationRule.prototype.validateSpec = function validateSpec() {
  assert(this.spec.body || this.spec.headers, 'output validation key: ' +
    this.status + ' must have either a body or headers validator specified');
};

OutputValidationRule.prototype.toString = function toString() {
  return this.status;
};

/**
 * Determines if this rule has overlapping logic
 * with `ruleB`.
 *
 * @returns Boolean
 */

OutputValidationRule.prototype.overlaps = function overlaps(ruleB) {
  return OutputValidationRule.overlaps(this, ruleB);
};

/**
 * Checks if this rule should be run against the
 * given `ctx` response data.
 *
 * @returns Boolean
 */

OutputValidationRule.prototype.matches = function matches(ctx) {
  for (var i = 0; i < this.ranges.length; ++i) {
    var range = this.ranges[i];
    if (ctx.status >= range.lower && ctx.status <= range.upper) {
      return true;
    }
  }

  return false;
};

/**
 * Validates this rule against the given `ctx`.
 */

OutputValidationRule.prototype.validateOutput = function validateOutput(ctx) {
  var result;

  if (this.spec.headers) {
    result = Joi.validate(ctx.response.headers, this.spec.headers);
    if (result.error) return result.error;
    // use casted values
    ctx.set(result.value);
  }

  if (this.spec.body) {
    result = Joi.validate(ctx.body, this.spec.body);
    if (result.error) return result.error;
    // use casted values
    ctx.body = result.value;
  }
};

// static

/**
 * Determines if ruleA has overlapping logic
 * with `ruleB`.
 *
 * @returns Boolean
 */

OutputValidationRule.overlaps = function overlaps(a, b) {
  return a.ranges.some(function checkRangeA(rangeA) {
    return b.ranges.some(function checkRangeB(rangeB) {
      if (rangeA.upper >= rangeB.lower && rangeA.lower <= rangeB.upper) {
        return true;
      }
      return false;
    });
  });
};

// helpers

function trim(s) {
  return s.trim();
}

function rangify(rule) {
  if (rule === '*') {
    return { lower: 0, upper: Infinity };
  }

  var parts = rule.split('-');
  assert(parts.length && parts.length < 3, 'invalid status code: ' + rule + helpMsg);

  var lower = parts[0];
  var upper = parts.length === 2 ? parts[1] : lower;

  validateCode(lower);
  validateCode(upper);

  return { lower: parseInt(lower, 10), upper: parseInt(upper, 10) };
}

function validateCode(code) {
  assert(/^[1-5][0-9]{2}$/.test(code), 'invalid status code: ' + code +
    ' must be between 100-599');
}
