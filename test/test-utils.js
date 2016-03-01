'use strict';

exports.MiddlewareGenerator = MiddlewareGenerator;

function MiddlewareGenerator() {
  this.count = 0;
}

MiddlewareGenerator.prototype.generate = function() {
  var i = this.count += 1;
  var self = this;
  return function*(next) {
    var expectedBody = (i - 1) + ' out of ' + self.count;
    if (i > 1 && this.body !== expectedBody) {
      this.throw(400, 'Handler executed out-of-order');
    }
    this.body = i + ' out of ' + self.count;
    yield next;
  };
};

MiddlewareGenerator.prototype.getExpectedBody = function() {
  return this.count + ' out of ' + this.count;
};
