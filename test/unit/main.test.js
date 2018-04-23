
/* global describe, it */

const expect = require('chai').expect;
const floatperms = require('../../src/main');


// Here we'll be testing that all necessary functions are exported and work basically fine.
// We won't be checking much against true validation or matcher methods, as they've their own tests.
describe('Main exports conformance tests', () => {

    describe('Basic initialization', () => {
        it('should define a global Permissions object', () => {
            expect(global.Permissions).to.be.an.instanceOf(Object).and.to.equal(floatperms);
        });
    });

    describe('#for()', () => {
        it('should return a proper validator', () => {
            const validator = floatperms.for('test-provider');
            expect(validator).to.be.an.instanceOf(Object);
        });
    });

    describe('#anyOf()', () => {
        it('should return a proper compound [anyOf] validator with 2 elements', () => {
            const v1 = floatperms.for('validator1');
            const v2 = floatperms.for('validator2');
            const compoundValidator = floatperms.anyOf(v1, v2);

            // response should be an object instance
            expect(compoundValidator).to.be.an.instanceof(Object);

            // response method should be 'anyOf'
            expect(compoundValidator.method).to.be.a('string')
                .and.to.equal('anyOf');

            // response should contain both targets
            expect(compoundValidator.target).to.be.an('array')
                .and.to.include(v1)
                .and.to.include(v2);
        });

        it('should throw an error when making a compound validator with 1 element', () => {
            const createValidator = () => floatperms.anyOf(floatperms.for('whatever'));

            expect(createValidator).to.throw('Expected at least two validators to be passed when creating a compound validator with `.anyOf(...)`, but found 1 validator passed instead.');
        });

        it('should throw an error when making a compound validator with no elements', () => {
            const createValidator = () => floatperms.anyOf();

            expect(createValidator).to.throw('Expected at least two validators to be passed when creating a compound validator with `.anyOf(...)`, but found 0 validators passed instead.');
        });
    });

    describe('#allOf()', () => {
        it('should return a proper compound [allOf] validator with 2 elements', () => {
            const v1 = floatperms.for('validator1');
            const v2 = floatperms.for('validator2');
            const compoundValidator = floatperms.allOf(v1, v2);

            // response should be an object instance
            expect(compoundValidator).to.be.an.instanceof(Object);

            // response method should be 'allOf'
            expect(compoundValidator.method).to.be.a('string')
                .and.to.equal('allOf');

            // response should contain both targets
            expect(compoundValidator.target).to.be.an('array')
                .and.to.include(v1)
                .and.to.include(v2);
        });

        it('should throw an error when making a compound validator with 1 element', () => {
            const createValidator = () => floatperms.allOf(floatperms.for('whatever'));

            expect(createValidator).to.throw('Expected at least two validators to be passed when creating a compound validator with `.allOf(...)`, but found 1 validator passed instead.');
        });

        it('should throw an error when making a compound validator with no elements', () => {
            const createValidator = () => floatperms.allOf();

            expect(createValidator).to.throw('Expected at least two validators to be passed when creating a compound validator with `.allOf(...)`, but found 0 validators passed instead.');
        });
    });

    describe('#none()', () => {
        it('should return a special NOP validator', () => {
            const nopValidator = floatperms.none();

            // response should be an object instance
            expect(nopValidator).to.be.an.instanceof(Object);

            expect(nopValidator).to.be.deep.equal({ method: 'NOP' });
        });
    });

    describe('#register()', () => {
        it('should correctly register and teardown an empty provider', () => {
            const cycleProvider = () => {
                floatperms.register({}, 'empty');
                floatperms.unregister('empty');
            };

            expect(cycleProvider).to.not.throw();
        });

        it('should correctly register and teardown a provider with all parameter types', () => {
            let withParams;
            const _params = {
                p1: 'req.this.is.a.request.field.param',
                p2: '$this.is.a.session.param',
                p3: '?thisIsAnHTTPRequestParam'
            };
            const cycleProvider = () => {
                floatperms.register({ _params }, 'withParams');
                withParams = floatperms.unregister('withParams');
            };

            expect(cycleProvider).to.not.throw();
            expect(withParams).to.be.an.instanceOf(Object);
            expect(withParams.provider).to.be.deep.equal({ _params });
        });

        it('should correctly register and teardown provider, ignoring reserved validation methods', () => {
            let mostlyReservedFuncs;
            // an NOP func
            const derp = async () => { };
            const cycleProvider = () => {
                floatperms.register({
                    before: derp,       // reserved
                    after: derp,        // reserved
                    params: derp,       // reserved
                    error: derp,        // reserved
                    notReserved: derp,  // not reserved
                    potet: derp,        // not reserved
                }, 'mostlyReservedFuncs');
                mostlyReservedFuncs = floatperms.unregister('mostlyReservedFuncs');
            };

            expect(cycleProvider).to.not.throw();
            expect(mostlyReservedFuncs).to.be.an.instanceOf(Object);
            expect(mostlyReservedFuncs.validations).to.be.deep.equal(['notReserved', 'potet']);
        });

        it('should correctly register and teardown same-name but different-namespace providers', () => {
            const twins = [];
            const cycleProvider = () => {
                floatperms.register({}, '#twinning');
                floatperms.register({}, '#twinning', 'ns1');
                floatperms.register({}, '#twinning', 'ns2');
                twins.push(floatperms.unregister('#twinning'));
                twins.push(floatperms.unregister('#twinning', 'ns1'));
                twins.push(floatperms.unregister('#twinning', 'ns2'));
            };

            expect(cycleProvider).to.not.throw();
            expect(twins).to.be.an('array');
            expect(twins).to.have.length(3);
            twins.forEach(t => {
                expect(t).to.be.instanceOf(Object);
            });
        });

        it('should throw when registering a non-object provider', () => {
            const tryRegister = () => {
                floatperms.register('THIS IS TOTALLY A PROVIDER', 'notAProvider');
            };

            expect(tryRegister).to.throw('Expected provider object to be a proper object, but instead found: (string) THIS IS TOTALLY A PROVIDER');
        });

        it('should throw when registering two providers of the same name', () => {
            const tryRegister = () => {
                try {
                    floatperms.register({}, '#twinning');
                    floatperms.register({}, '#twinning');
                } finally {
                    floatperms.unregister('#twinning');
                }
            };

            expect(tryRegister).to.throw('Attempted to register a provider under already registered name "#twinning", in namespace "global"');
        });

        it('should throw when registering a provider with bad param-type prefixes', () => {
            const tryRegister = () => {
                floatperms.register({
                    _params: {
                        p1: '#what.even.is.this?'
                    }
                }, 'badParamDefs');
            };

            expect(tryRegister).to.throw('The provider definition "badParamDefs" in namespace "global" contains an invalid _params entry "p1". The string value must begin with one of \'?\', \'$\' or \'req.\'');
        });

        it('should throw when registering a provider with non-string params', () => {
            const tryRegister = () => {
                floatperms.register({
                    _params: {
                        p1: 1 + 1 === 3 // test with a falsy value, for kicks
                    }
                }, 'badParamDefs');
            };

            expect(tryRegister).to.throw('The provider definition "badParamDefs" in namespace "global" contains an invalid _params entry "p1". Expected a string, but instead found: (boolean) false');
        });
    });

    describe('#register()', () => {
        it('should unregister a created provider properly', () => {
            const tryRegister = () => {
                floatperms.register({}, 'empty');
            };

            expect(tryRegister).to.not.throw();
            expect(floatperms.unregister('empty')).to.be.an.instanceOf(Object);
            expect(floatperms.unregister('empty'), 'the second call to unregister should return nothing').to.be.undefined;
        });

        it('should unregister a created provider from a custom namespace properly', () => {
            const tryRegister = () => {
                floatperms.register({}, 'empty', 'someCustomNamespace');
            };

            expect(tryRegister).to.not.throw();
            expect(floatperms.unregister('empty', 'someCustomNamespace')).to.be.an.instanceOf(Object);
            expect(floatperms.unregister('empty', 'someCustomNamespace'), 'the second call to unregister should return nothing').to.be.undefined;
        });
    });

});
