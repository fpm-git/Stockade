
module.exports = class ValidatorProvider {

    constructor() {
        throw new Error('Validators should be created via the static `create(...)` method, not the constructor!');
    }

    static create(schemeName, schemeNamespace) {
        const validator = new Validator(schemeName, schemeNamespace);
        const proxy = new Proxy(validator, {
            get: (obj, property) => {
                if (typeof property !== 'string') {
                    return undefined;
                }
                // if the requested property is a function that actually exists, return a wrapper for the original (some advantages over .bind)..
                if (typeof obj[property] === 'function') {
                    return function(...args) {
                        if (obj.finalized && (property !== 'compile') && (property !== 'inspect')) {
                            throw new Error(`Attempted to call method "${property}" of an already finalized validator. Only \`.compile()\` may be used at this point!`);
                        }
                        const target = this === proxy ? validator : this;
                        const res = obj[property].apply(target, args);
                        // if the result is our validator, return the proxy instead, otherwise return the original value
                        return (res === validator) ? proxy : res;
                    };
                }
                // otherwise, return a dummy function used to set some parameter
                return (...args) => {
                    // throw an error if we've not just 1 parameter
                    if (args.length !== 1) {
                        throw new Error(`Invalid argument list passed for validator parameter function "${property}". Found ${args.length} parameters, but expected 1.`);
                    }
                    // throw an error if the underlying validator has been finalized already
                    if (obj.finalized) {
                        throw new Error(`Attempted to set parameter "${property}" of an already finalized validator. Only \`.compile()\` may be used at this point!`);
                    }
                    // if our parameter is a string ensure it starts with one of the valid values: ['?', '$', 'req.']
                    if (typeof args[0] === 'string') {
                        if (!args[0].startsWith('?') && !args[0].startsWith('$') && !args[0].startsWith('req.')) {
                            throw new Error(`Attempted to set parameter definition "${property}" to an invalid string value. String-type parameter definitions must start with one of: '?', '$' or 'req.'`);
                        }
                    } else {
                        throw new Error(`Attempted to set parameter definition "${property}" to an invalid value! Expected a string, but instead found: (${typeof args[0]}) ${args[0]}`);
                    }

                    obj.params[property] = args[0];
                    return proxy;
                };
            },
            set: (obj, property, value) => {
                throw new Error(`Invalid operation: validators may not be mutated. Attempted to set property "${property}" to: ${value}`);
            }
        });
        validator.proxy = proxy;
        return proxy;
    }

};

class Validator {

    constructor(schemeName, schemeNamespace) {
        // set our scheme name and namespace
        this.name = schemeName;
        this.namespace = schemeNamespace;

        // initialize the parameter collection
        this.params = {};

        // Setup an instance var to keep track of whether or not the validator has been "finalized".
        // A validator is considered finalized when a validation criteria is specified by one of: all(), any(), allOf(...), anyOf(...).
        // Once a validator has been finalized, its owner proxy should prevent any additional parameters being set.
        this.finalized = false;

        // used to hold the finalized method-name, one of: 'all', 'any', 'allOf', 'anyOf'
        this.method = null;

        // used to hold the target for the finalized method. should be either a string ('*') or an array.
        this.target = null;

        // whether or not parallel validation should be performed (if the provider doesn't allow it, then it won't be performed in any case)
        // if set to undefined (or any non-boolean value), then the provider default will be used instead.
        this.execParallel = undefined;

        // reference to the proxy which wraps this validator and should always be exposed in stead of this object
        this.proxy = null;
    }

    /**
     * Ends the validator chain using the 'all' method.
     *
     * This method makes overall validation success contingent on ALL defined validation
     * methods for the chosen scheme passing. If even a single method returns a negative
     * result or throws an error, then the corresponding request will be blocked with an
     * appropriate error code.
     *
     * The order of method execution is not guaranteed, rather, methods will be executed
     * in whatever order is returned by Object.keys() called against the provider object.
     *
     * Once this method has been called, the target validator will be otherwise unusable
     * aside from providing the `.compile()` method.
     */
    all() {
        this.finalized = true;
        this.method = 'all';
        this.target = '*';

        Object.freeze(this.target);
        Object.freeze(this.params);

        return this;
    }

    /**
     * Ends the validator chain using the 'any' method.
     *
     * This method makes overall validation success contingent on ANY defined validation
     * method for the chosen scheme passing. The corresponding request will be blocked in
     * the event that either (A) an error occurs or (B) ALL validations methods return a
     * negative result.
     *
     * In the event that no errors occur, all it takes is a single passing validation for
     * the request to go through.
     *
     * The order of method execution is not guaranteed, rather, methods will be executed
     * in whatever order is returned by Object.keys() called against the provider object.
     *
     * Once this method has been called, the target validator will be otherwise unusable
     * aside from providing the `.compile()` method.
     */
    any() {
        this.finalized = true;
        this.method = 'any';
        this.target = '*';

        Object.freeze(this.target);
        Object.freeze(this.params);

        return this;
    }

    /**
     * Ends the validation chain using the 'allOf' method.
     *
     * This method requires that all of the given validation names pass with the target
     * request. If even one of the named validations returns a negative result or throws
     * an error, then the request wil be blocked with an appropriate error code.
     *
     * The validations will be executed in the same order as they are passed in, however,
     * this may have little effect when running validations with the parallel flag.
     *
     * Once this method has been called, the target validator will be otherwise unusable
     * aside from providing the `.compile()` method.
     *
     * @param {...string} validationNames - Names of the validation methods which should
     * be executed against the current scheme.
     */
    allOf(...validationNames) {
        this.finalized = true;
        this.method = 'allOf';
        this.target = [];

        // go through each validation, ensuring they're valid before adding to our target list
        validationNames.forEach(validation => {
            // if we've a non-string value, toss an error
            if (typeof validation !== 'string') {
                throw new Error(`Expected validation name of type string, but instead found: (${typeof validation}) ${validation}`);
            }
            // otherwise, just insert into our target list
            this.target.push(validation);
        });

        // if we've no targets, this method shouldn't be used. use #all() instead.
        if (this.target.length === 0) {
            throw new Error('Expected at least one validation name passed for the `.allOf(...)` matcher method, but received nothing instead! To match against all validations, simply use the `.all()` method.');
        }

        Object.freeze(this.target);
        Object.freeze(this.params);

        return this;
    }

    /**
     * Ends the validation chain using the 'anyOf' method.
     *
     * This method requires that only a single one of the named validation methods must
     * pass. The corresponding request will only be blocked in the event that either (A)
     * an error occures or (B) ALL validation methods return a negative result..
     *
     * The validations will be executed in the same order as they are passed in, however,
     * this may have little effect when running validations with the parallel flag.
     *
     * Once this method has been called, the target validator will be otherwise unusable
     * aside from providing the `.compile()` method.
     *
     * @param {...string} validationNames - Names of the validation methods which should
     * be executed against the current scheme.
     */
    anyOf(...validationNames) {
        this.finalized = true;
        this.method = 'anyOf';
        this.target = [];

        // go through each validation, ensuring they're valid before adding to our target list
        validationNames.forEach(validation => {
            // if we've a non-string value, toss an error
            if (typeof validation !== 'string') {
                throw new Error(`Expected validation name of type string, but instead found: (${typeof validation}) ${validation}`);
            }
            // otherwise, just insert into our target list
            this.target.push(validation);
        });

        // if we've no targets, this method shouldn't be used. use #all() instead.
        if (this.target.length === 0) {
            throw new Error('Expected at least one validation name passed for the `.anyOf(...)` matcher method, but received nothing instead! To match against any successful validation, simply use the `.any()` method.');
        }

        Object.freeze(this.target);
        Object.freeze(this.params);

        return this;
    }

    /**
     * Marks the validator as supporting parallel fulfillment.
     */
    parallel() {
        this.execParallel = true;

        return this;
    }

    /**
     * Generates a proper object usable by the validation matcher for evaluating whether
     * or not a request should be allowed based on the validation criteria.
     */
    compile() {
        const res = {
            namespace: this.namespace,
            scheme: this.name,
            method: this.method,
            params: this.params,
            target: this.target,
        };
        if (typeof this.execParallel === 'boolean') {
            res.parallel = this.execParallel;
        }
        return res;
    }

    /**
     * Provides a valid inspect call for the proxy wrapper.
     */
    inspect() {
        return {};
    }

}
