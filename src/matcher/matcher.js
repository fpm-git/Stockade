/**
 * @file matcher.js
 * Used to match requests against validators, testing whether or not some criteria may pass
 * successfully.
 */

let namespaces;

module.exports = function (ns) {
    namespaces = ns;
    return matcher;
};

/**
 * Handles matching a request against some compiled validator criteria.
 *
 * @param {SailsRequest} req - The request to check against the given validator's criteria.
 * @param {Object} validator - A validator, or combination of validators used to check some
 * number of conditions against the given request.
 *
 * @returns {Object} An object detailing whether or not the request has passed the validator
 * criteria, along with a list of all tests which have passed, and a list of all tests which
 * have failed.
 */
async function matcher(req, validator) {
    // Ensure we have at least a proper object.
    if (!validator || (typeof validator !== 'object')) {
        throw new Error(`Expected proper validator object (as from \`Permissions.for(...)\`), but received instead: (${typeof validator}) ${validator}`);
    }

    // If we've got a compile function on the validator, then we've just got one simple validator
    // as returned from `Permissions.for(...).*`.
    if (typeof validator.compile === 'function') {
        return await matchTrueValidator(req, validator.compile());
    }

    // Since we've not a true validator, we've got to check if we've the sort of compound validator object...
    // If we're missing the method field, then that's a bit of an issue.
    if (typeof validator.method !== 'string') {
        throw new Error('The passed validator provides no compile function nor a valid method field. Please ensure that only proper validators returned from the Permissions helper are used.');
    }

    // If we have a method AND schema, then this is a pre-compiled validator, and we don't like that (compilation gives us some guarantees, immutability being one).
    if (typeof validator.schema !== 'undefined') {
        throw new Error('The passed validator has already been compiled. Please refrain from calling the `.compile()` method on validator definitions.');
    }

    // Otherwise, we must have a method and no schema, which means that our object is not one from `Permissions.for(...)`.
    return await matchCompoundValidator(req, validator);
}

/**
 * Extracts parameters from the request according to the given params collection, merged
 * together with the validation provider's defaults.
 *
 * If defined, the `before` method will be called on the given provider object, allowing
 * for the provider to perform some population operations and/or overrides that might be
 * considered necessary for certain validation methods. This method is called just before
 * extracting parameters from the `req` object.
 *
 * If defined, the `params` method will be called on the given provider object, allowing
 * for any resolved parameters values to be tweaked, or for extra processing to take place
 * after parameters have been pulled from the `req` object, but before validation methods
 * are executed.
 *
 * @param {SailsRequest} req - The request which the params should be extracted from.
 * @param {Object} overrideDefs - Param definitions used to override values supplied by
 * the provider defaults.
 * @param {Object} provider - Provider object containing original param definitions to
 * be used as the basis when merging overrides over.
 */
async function extractParams(req, overrideDefs, provider, schemeName) {

    overrideDefs = (overrideDefs && (typeof overrideDefs === 'object')) ? overrideDefs : {};
    const baseParams = (provider._params && (typeof provider._params === 'object')) ? provider._params : {};

    // Helper function used to extract a single parameter.
    const extract = (req, definition) => {
        // If we've an object given, try to extract from a `value` field.
        if (definition.value instanceof Object) {
            if (!('value' in definition.value)) {
                throw new Error(`Expected parameter definition value for "${definition.name}" to contain a "value" field, but instead it was not set.`);
            }
            return definition.value.value;
        }
        // If the definition starts with '?', then it's a shorthand HTTP param value
        if (definition.value.startsWith('?')) {
            return req.param(definition.value.substr(1));
        }
        // If the definition starts with '$', then it's a shorthand HTTP cookie value
        if (definition.value.startsWith('$')) {
            return req.cookies[definition.value.substr(1)];
        }
        // Otherwise, our definition should start with `req.`, throw if it doesn't (this is validated elsewhere so this is very much a failsafe)
        if (!definition.value.startsWith('req.')) {
            throw new Error(`Expected parameter definition value for "${definition.name}" to start with one of '?', '$' or 'req.', but instead found: ${definition.value}`);
        }
        // We've a 'req.' param, so let's split our param into it's component pieces
        const pieces = definition.value.split('.');
        pieces.shift(); // remove the first 'req' bit

        // Try and extract our parameter, returning undefined if it doesn't exist (this safely traverses the path).
        return pieces.reduce((acc, key) => {
            if (!acc || (typeof acc !== 'object')) {
                return undefined;
            }
            return acc[key];
        }, req);
    };

    // Handle merging overrides with base parameters.
    const paramDefs = Object.keys(baseParams).map(paramName => {
        const maybeOverrideValue = overrideDefs[paramName];
        const res = {
            name: paramName,
            value: (typeof maybeOverrideValue !== 'undefined')
                ? maybeOverrideValue
                : baseParams[paramName]
        };
        return res;
    }).filter(p => p);

    // Create our exports object before running any existing handlers.
    const providerExports = {};
    // Run our before handler, if any, prior to extracting parameters from the request.
    if (typeof provider.before === 'function') {
        await provider.before(req, paramDefs, providerExports);
    }

    // Simply extract each parameter we've pulled out above.
    const outParams = {};
    paramDefs.forEach(def => {
        outParams[def.name] = extract(req, def);
    });

    // Run our params handler, if any, now that we've resolved all parameters.
    if (typeof provider.params === 'function') {
        await provider.params(req, outParams, providerExports);
    }

    // Bind our permissions object and exports for the scheme onto the request.
    if (!req.permissions || (typeof req.permissions !== 'object')) {
        req.permissions = {};
    }
    req.permissions[schemeName] = Object.freeze(providerExports);

    return outParams;
}

/**
 * Handles matching a true, compiled, validator definition, rather than a compound validator
 * as returned from Permissions.allOf(...)/Permissions.anyOf(...).
 *
 * @param {SailsRequest} req - The request to check against the given validator's criteria.
 * @param {Object} validator - A proper compiled validator which should be used in checking
 * some number of conditions against the given request.
 *
 * @returns {Object} An object detailing whether or not the request has passed the validator
 * criteria, along with a list of all tests which have passed, and a list of all tests which
 * have failed.
 */
async function matchTrueValidator(req, validator) {
    // Ensure we've our target array.
    if (!Array.isArray(validator.target)) {
        throw new Error(`Received malformed validator! Expected the \`target\` property to be an array but instead found: (${typeof validator.target}) ${validator.target}`);
    }

    // Grab our namespace and ensure it exists.
    const namespace = namespaces[validator.namespace];
    if (!namespace) {
        throw new Error(`Failed to located namespace for validator! Attempted to use namespace "${validator.namespace}" which was not found in the registered namespace collection: ${Object.keys(namespaces)}`);
    }

    // Grab our scheme, ensuring it exists.
    const scheme = namespace[validator.scheme];
    if (!scheme) {
        throw new Error(`Failed to locate scheme for validator! Could not find scheme "${validator.scheme}" in namespace "${validator.namespace}". Schemes currently registered in this namespace: ${Object.keys(namespace)}`);
    }

    const results = {
        hasPassed: false,
        passedValidations: [],
        failedValidations: [],
        thrownErrors: [],
    };

    // Expand instances of '*' and remove duplicates (wanting flatMap..)
    // Targets should be unique simply to avoid double-running some validation, for the sake of performance.
    // (Additional runs should be considered not to be side-effect inducing, as validations should be considered not necessarily stateless, but order-independent).
    const targets = (Array.isArray(validator.target) ? validator.target : [validator.target])
        // push normal values, except where '*' is found (we insert all validations in that case)
        .reduce((acc, v) => acc.concat((v === '*') ? scheme.validations : v), [])
        // remove duplicates
        .filter((v, i, arr) => arr.indexOf(v) === i);


    // Extract and freeze our parameters. In the future, perhaps object subfields should be frozen as well.
    const params = Object.freeze(await extractParams(req, validator.params, scheme.provider, validator.scheme));
    const runParallel = validator.parallel || scheme.provider._parallel;

    // Handle launching tasks either in parallel or in sequence, collecting the results.
    const testResults = [];
    if (runParallel) {
        const promises = [];
        targets.forEach(methodName => {
            promises.push(scheme.provider[methodName](params, req));
        });
        try {
            testResults.push(...await Promise.all(promises));
        } catch (e) {
            results.thrownErrors.push(e);
        }
    } else {
        for (let i = 0; i < targets.length; i++) {
            try {
                testResults.push(await scheme.provider[targets[i]](params, req));
            } catch (e) {
                results.thrownErrors.push(e);
            }
        }
    }

    // Push validation test results into the proper arrays.
    testResults.forEach((res, i) => {
        const methodName = `${(validator.namespace === 'global' ? '' : validator.namespace + ':')}${validator.scheme}:${targets[i]}`;
        if (res === true) {
            return results.passedValidations.push(methodName);
        }
        return results.failedValidations.push({
            name: methodName,
            explanation: typeof res !== 'boolean' ? res : undefined,
        });
    });

    // If we threw any errors at all, return with our initial false pass-state.
    if (results.thrownErrors.length > 0) {
        return results;
    }

    // Depending on our method, alter pass-state appropriately based on the rest of the result state.
    switch(validator.method) {
        case 'all', 'allOf':
            // For all[Of], we want ALL tests passing. Further, this means that no tests should fail (though a check for either would suffice, we'll go the double-safe route).
            results.hasPassed = (results.passedValidations.length === targets.length) && (results.failedValidations.length === 0);
            break;
        case 'any', 'anyOf':
            // For any[Of], things are fine as long as at least one single test has passed.
            results.hasPassed = (results.passedValidations.length > 0);
            break;
        default:
            // We've an unknown method, so wups...
            throw new Error(`Invalid method type found for validator: "${validator.method}". Expected one of: "all", "any", "allOf", or "anyOf".`);
    }

    return results;
}

/**
 * Handles matching a compound validator, that is, an object containing multiple true or
 * compound validator objects.
 *
 * @returns {Object} An object detailing whether or not the request has passed the validator
 * criteria, along with a list of all tests which have passed, and a list of all tests which
 * have failed.
 */
async function matchCompoundValidator(req, validator) {
    // If the operation is of type NOP, then the match instantly succeeds.
    if (validator.method === 'NOP') {
        return {
            hasPassed: true,
            passedValidations: [':NOP'],
            failedValidations: [],
            thrownErrors: [],
        };
    }

    // Ensure we've our target array.
    if (!Array.isArray(validator.target)) {
        throw new Error(`Received malformed compound validator! Expected the \`target\` property to be an array but instead found: (${typeof validator.target}) ${validator.target}`);
    }

    // Ensure the target array is at least two elements long.
    if (validator.target.length < 2) {
        throw new Error(`Received malformed compound validator! The \`target\` array should contain at least two elements, but it contains just ${validator.target.length}.`);
    }

    // Ensure we've one of the valid compound methods: allOf or anyOf
    if (['allOf', 'anyOf'].indexOf(validator.method) === -1) {
        throw new Error(`Received malformed compound validator! Expected a \`method\` of either 'allOf' or 'anyOf', but instead found: (${typeof validator.method}) ${validator.method}`);
    }

    // Filter our items a little, so we've all unique targets.
    const targets = validator.target.filter((t, i, arr) => arr.indexOf(t) === i);
    // Start all sub-validators processing, and wait for them to finish.
    const validationResults = await Promise.all(targets.map(v => matcher(req, v)));

    // Setup our result, it's mostly finished at this point, but we'll select our value differently in different cases.
    const result = {
        hasPassed: undefined,  // to be set below
        passedValidations: [].concat(...validationResults.map(v => v.passedValidations)),   // ES needs flatMap...
        failedValidations: [].concat(...validationResults.map(v => v.failedValidations)),
        thrownErrors: [].concat(...validationResults.map(v => v.thrownErrors)),
    };

    // Unique-ify things...
    result.passedValidations = result.passedValidations.filter((v, i, arr) => arr.indexOf(v) === i);
    result.failedValidations = result.failedValidations.filter((v, i, arr) => arr.indexOf(v) === i);

    // Helper function used to check if a single test did pass (used for determining overall state below).
    const didValidatorPass = (validatorRes) => validatorRes && (typeof validatorRes === 'object') && (validatorRes.hasPassed === true);

    // Aaand finally: handle our result overall pass state accordingly for our method type.
    switch (validator.method) {
        case 'allOf':
            // Ensure that EVERY result set passed OK.
            result.hasPassed = validationResults.every(didValidatorPass);
            break;
        case 'anyOf':
            // Ensure that AT LEAST ONE result set passed OK.
            result.hasPassed = validationResults.some(didValidatorPass);
            break;
        default:
            // This should't happen at present, but will provide a safety-net against some future changes.
            throw new Error(`Unrecognized validator method found: (${typeof validator.method}) ${validator.method}`);
    }

    return result;
}

/*
async function gosync(promise) {
    try {
        return [await promise];
    } catch (e) {
        return [undefined, e];
    }
}
*/
