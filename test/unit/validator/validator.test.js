
/* global describe, it */

const expect = require('chai').expect;
const Validator = require('../../../src/validator/validator');

describe('Validator conformance tests', () => {

    describe('constructor', () => {
        it('should throw when directly calling the constructor', () => {
            const tryConstruct = () => new Validator();
            expect(tryConstruct).to.throw('Validators should be created via the static `create(...)` method, not the constructor!');
        });
    });

    describe('#create()', () => {
        it('should properly wrap a new validator', () => {
            const v = Validator.create('some-scheme');
            expect(v).to.be.an.instanceOf(Object);

            expect(v).to.have.property('all').with.instanceOf(Function);
            expect(v).to.have.property('any').with.instanceOf(Function);
            expect(v).to.have.property('allOf').with.instanceOf(Function);
            expect(v).to.have.property('anyOf').with.instanceOf(Function);
            expect(v).to.have.property('parallel').with.instanceOf(Function);
            expect(v).to.have.property('compile').with.instanceOf(Function);
        });
    });

    describe('#all()', () => {
        it('should apply the \'all\' method and target correctly', () => {
            const v = Validator.create('some-scheme');
            const res = v.all().compile();

            expect(res).to.have.property('method', 'all');
            expect(res).to.have.property('target', '*').frozen;
            expect(res).to.have.property('params').frozen;
        });

        it('should prevent non-compile methods being called', () => {
            const v = Validator.create('some-scheme').all();
            const tryCallMethod = (methodName, ...params) => {
                return () => { v[methodName](...params); };
            };

            // non-compile should all throw with a descriptive message
            expect(tryCallMethod('all')).to.throw('Attempted to call method "all" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('any')).to.throw('Attempted to call method "any" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('allOf', 'v1', 'v2')).to.throw('Attempted to call method "allOf" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('anyOf', 'v1', 'v2')).to.throw('Attempted to call method "anyOf" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('parallel')).to.throw('Attempted to call method "parallel" of an already finalized validator. Only `.compile()` may be used at this point!');

            // compile should absolutely work
            expect(tryCallMethod('compile')).to.not.throw();
        });
    });

    describe('#any()', () => {
        it('should apply the \'any\' method and target correctly', () => {
            const v = Validator.create('some-scheme');
            const res = v.any().compile();

            expect(res).to.have.property('method', 'any');
            expect(res).to.have.property('target', '*').frozen;
            expect(res).to.have.property('params').frozen;
        });

        it('should prevent non-compile methods being called', () => {
            const v = Validator.create('some-scheme').all();
            const tryCallMethod = (methodName, ...params) => {
                return () => { v[methodName](...params); };
            };

            // non-compile should all throw with a descriptive message
            expect(tryCallMethod('all')).to.throw('Attempted to call method "all" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('any')).to.throw('Attempted to call method "any" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('allOf', 'v1', 'v2')).to.throw('Attempted to call method "allOf" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('anyOf', 'v1', 'v2')).to.throw('Attempted to call method "anyOf" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('parallel')).to.throw('Attempted to call method "parallel" of an already finalized validator. Only `.compile()` may be used at this point!');

            // compile should absolutely work
            expect(tryCallMethod('compile')).to.not.throw();
        });
    });

    describe('#allOf()', () => {
        it('should apply the \'allOf\' method and target correctly', () => {
            const v = Validator.create('some-scheme');
            const res = v.allOf('v1', 'v2').compile();

            expect(res).to.have.property('method', 'allOf');
            expect(res).to.have.property('target').to.be.deep.equal(['v1', 'v2']).and.to.be.frozen;
            expect(res).to.have.property('params').frozen;
        });

        it('should throw an error when given less than 1 argument', () => {
            const v = Validator.create('some-scheme');
            const tryAllOf = () => v.allOf();

            expect(tryAllOf).to.throw('Expected at least one validation name passed for the `.allOf(...)` matcher method, but received nothing instead! To match against all validations, simply use the `.all()` method.');
        });

        it('should throw an error when given non-string arguments', () => {
            const tryAllOf = (...vals) => () => Validator.create('some-scheme').allOf(...vals);

            expect(tryAllOf(() => {})).to.throw('Expected validation name of type string, but instead found: (function) () => {}');
            expect(tryAllOf({})).to.throw('Expected validation name of type string, but instead found: (object) [object Object]');
            expect(tryAllOf(undefined)).to.throw('Expected validation name of type string, but instead found: (undefined) undefined');
            expect(tryAllOf(null)).to.throw('Expected validation name of type string, but instead found: (object) null');
            expect(tryAllOf(false)).to.throw('Expected validation name of type string, but instead found: (boolean) false');
            expect(tryAllOf(1)).to.throw('Expected validation name of type string, but instead found: (number) 1');
            expect(tryAllOf(['v1', 'v2'])).to.throw('Expected validation name of type string, but instead found: (object) v1,v2');
        });

        it('should prevent non-compile methods being called', () => {
            const v = Validator.create('some-scheme').allOf('v1', 'v2');
            const tryCallMethod = (methodName, ...params) => {
                return () => { v[methodName](...params); };
            };

            // non-compile should all throw with a descriptive message
            expect(tryCallMethod('all')).to.throw('Attempted to call method "all" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('any')).to.throw('Attempted to call method "any" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('allOf', 'v1', 'v2')).to.throw('Attempted to call method "allOf" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('anyOf', 'v1', 'v2')).to.throw('Attempted to call method "anyOf" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('parallel')).to.throw('Attempted to call method "parallel" of an already finalized validator. Only `.compile()` may be used at this point!');

            // compile should absolutely work
            expect(tryCallMethod('compile')).to.not.throw();
        });
    });

    describe('#anyOf()', () => {
        it('should apply the \'anyOf\' method and target correctly', () => {
            const v = Validator.create('some-scheme');
            const res = v.anyOf('v1', 'v2').compile();

            expect(res).to.have.property('method', 'anyOf');
            expect(res).to.have.property('target').to.be.deep.equal(['v1', 'v2']).and.to.be.frozen;
            expect(res).to.have.property('params').frozen;
        });

        it('should throw an error when given less than 1 argument', () => {
            const v = Validator.create('some-scheme');
            const tryAnyOf = () => v.anyOf();

            expect(tryAnyOf).to.throw('Expected at least one validation name passed for the `.anyOf(...)` matcher method, but received nothing instead! To match against any successful validation, simply use the `.any()` method.');
        });

        it('should throw an error when given non-string arguments', () => {
            const tryAnyOf = (...vals) => () => Validator.create('some-scheme').anyOf(...vals);

            expect(tryAnyOf(() => {})).to.throw('Expected validation name of type string, but instead found: (function) () => {}');
            expect(tryAnyOf({})).to.throw('Expected validation name of type string, but instead found: (object) [object Object]');
            expect(tryAnyOf(undefined)).to.throw('Expected validation name of type string, but instead found: (undefined) undefined');
            expect(tryAnyOf(null)).to.throw('Expected validation name of type string, but instead found: (object) null');
            expect(tryAnyOf(false)).to.throw('Expected validation name of type string, but instead found: (boolean) false');
            expect(tryAnyOf(1)).to.throw('Expected validation name of type string, but instead found: (number) 1');
            expect(tryAnyOf(['v1', 'v2'])).to.throw('Expected validation name of type string, but instead found: (object) v1,v2');
        });

        it('should prevent non-compile methods being called', () => {
            const v = Validator.create('some-scheme').anyOf('v1', 'v2');
            const tryCallMethod = (methodName, ...params) => {
                return () => { v[methodName](...params); };
            };

            // non-compile should all throw with a descriptive message
            expect(tryCallMethod('all')).to.throw('Attempted to call method "all" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('any')).to.throw('Attempted to call method "any" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('allOf', 'v1', 'v2')).to.throw('Attempted to call method "allOf" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('anyOf', 'v1', 'v2')).to.throw('Attempted to call method "anyOf" of an already finalized validator. Only `.compile()` may be used at this point!');
            expect(tryCallMethod('parallel')).to.throw('Attempted to call method "parallel" of an already finalized validator. Only `.compile()` may be used at this point!');

            // compile should absolutely work
            expect(tryCallMethod('compile')).to.not.throw();
        });
    });

    describe('#parallel()', () => {
        it('should mark the validator as running in-parallel', () => {
            const v = Validator.create('some-scheme');
            expect(v.parallel().compile()).to.have.property('parallel', true);
        });

        it('default validator state should have no parallel field', () => {
            const v = Validator.create('some-scheme');
            expect(v.compile()).to.not.have.property('parallel');
        });
    });

});
