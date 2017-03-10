'use strict';

exports.MiddlewareGenerator = MiddlewareGenerator;

function MiddlewareGenerator() {
  this.count = 0;
}

MiddlewareGenerator.prototype.generate = function() {
  const i = this.count += 1;
  const self = this;
  return async function(ctx, next) {
    const expectedBody = (i - 1) + ' out of ' + self.count;
    if (i > 1 && ctx.body !== expectedBody) {
      ctx.throw(400, 'Handler executed out-of-order');
      return;
    }
    ctx.body = i + ' out of ' + self.count;
    await next();
  };
};

MiddlewareGenerator.prototype.getExpectedBody = function() {
  return this.count + ' out of ' + this.count;
};
