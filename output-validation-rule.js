'use strict';

const assert = require('assert');
const Joi = require('@hapi/joi');
const helpMsg = ' -> see: https://github.com/koajs/joi-router/#validating-output';

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
  for (let i = 0; i < this.ranges.length; ++i) {
    const range = this.ranges[i];
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
  let result;

  if (this.spec.headers) {
    const schema = Joi.compile(this.spec.headers);
    result = schema.validate(ctx.response.headers);
    if (result.error) return result.error;
    // use casted values
    ctx.set(result.value);
  }

  if (this.spec.body) {
    const schema = Joi.compile(this.spec.body)
    result = schema.validate(ctx.body);
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
  /* eslint-disable prefer-arrow-callback */
  return a.ranges.some(function checkRangeA(rangeA) {
    return b.ranges.some(function checkRangeB(rangeB) {
      if (rangeA.upper >= rangeB.lower && rangeA.lower <= rangeB.upper) {
        return true;
      }
      return false;
    });
  });
  /* eslint-enable prefer-arrow-callback */
};

// helpers

function trim(s) {
  return s.trim();
}

function rangify(rule) {
  if (rule === '*') {
    return { lower: 0, upper: Infinity };
  }

  const parts = rule.split('-');
  assert(parts.length && parts.length < 3, 'invalid status code: ' + rule + helpMsg);

  const lower = parts[0];
  const upper = parts.length === 2 ? parts[1] : lower;

  validateCode(lower);
  validateCode(upper);

  return { lower: parseInt(lower, 10), upper: parseInt(upper, 10) };
}

function validateCode(code) {
  assert(/^[1-5][0-9]{2}$/.test(code), 'invalid status code: ' + code +
    ' must be between 100-599');
}
