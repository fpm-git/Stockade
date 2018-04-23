/**
 * @file main.js
 * Exposes what is pretty much a static class containing permission helpers used to manage
 * state and match against requests.
 */

// Initialize our private namespaces collection, to be used as provider store.
const namespaces = {
    global: {}
};

const createValidator = require('./validator/validator').create;
const greenTea = require('./matcher/matcher')(namespaces);

module.exports = {

    /**
     * Returns a validator for building permission matches against the given scheme name.
     *
     * @param {string} permissionSchemeName - Name of a registered permission scheme which the
     * created validator should be set for. Examples might be 'user', 'creator', 'moderation',
     * etc...
     * @param {string} [schemeNamespace] - Namespace which should be searched for the named
     * scheme. If not specified, then the global floatperms namespace is searched.
     */
    for(permissionSchemeName, schemeNamespace) {
        // default schemeNamespace to global if not specified
        if ((typeof schemeNamespace !== 'string') || (schemeNamespace.length === 0)) {
            schemeNamespace = 'global';
        }

        const validator = createValidator(permissionSchemeName, schemeNamespace);

        // Run some special handling only if using sails.
        if (typeof global.sails === 'object') {
            // Generate an error for the invalid case early, in this scope, so we'll have a helpful stack trace.
            const notFoundError = new Error(`Attempted to build validator for scheme "${permissionSchemeName}" in namespace "${schemeNamespace}", but no such scheme has been registered!`);
            // Once sails has fully lifted, we can take that as a sign that all hooks have initialized.
            // This means that all permissions schemes should be registered, and we can perform validation.
            global.sails.on('lifted', () => {
                const namespace = namespaces[schemeNamespace] || {};
                const scheme = namespace[permissionSchemeName];
                // Throw an error if our named scheme couldn't be found.
                if (!scheme) {
                    throw notFoundError;
                }
                // Otherwise, let's do some morce checking! We'll throw an error if some validation method doesn't exist on a scheme.
                const ecTargets = validator.compile().target;
                ecTargets.forEach(name => {
                    if (!scheme.validations.includes(name) && (name !== '*')) {
                        // Still a notFoundError, just change the message :3 (we want the nice, usable stack-trace)
                        notFoundError.message = `Attempted to match against method "${name}" with scheme "${permissionSchemeName}" (in namespace "${schemeNamespace}"), but no such validation method exists!`;
                        throw notFoundError;
                    }
                });
            });
        }

        // return our created validator
        return validator;
    },

    /**
     * Wraps the given list of validators into a new, combined validator meant to check if
     * any of the passed validators are considered valid.
     *
     * @param {...Object} validatorList - A list of the validator objects which should be
     * combined into a single new validator.
     */
    anyOf(...validatorList) {
        // If we haven't been passed at least two validators, then there's no point in making a compound validator.
        if (validatorList.length < 2) {
            throw new Error(`Expected at least two validators to be passed when creating a compound validator with \`.anyOf(...)\`, but found ${validatorList.length} validator${validatorList.length !== 1 ? 's' : ''} passed instead.`);
        }

        return {
            method: 'anyOf',
            target: validatorList
        };
    },

    /**
     * Wraps the given list of validators into a new, combined validator meant to check if
     * all of the passed validators are considered valid.
     *
     * @param {...Object} validatorList - A list of the validator objects which should be
     * combined into a single new validator.
     */
    allOf(...validatorList) {
        // If we haven't been passed at least two validators, then there's no point in making a compound validator.
        if (validatorList.length < 2) {
            throw new Error(`Expected at least two validators to be passed when creating a compound validator with \`.allOf(...)\`, but found ${validatorList.length} validator${validatorList.length !== 1 ? 's' : ''} passed instead.`);
        }

        return {
            method: 'allOf',
            target: validatorList,
        };
    },

    /**
     * Returns a no-op validator which can be used to satisfy a scenario where permission
     * definitions are mandatory, but a certain route needs no protection.
     */
    none() {
        return {
            method: 'NOP'
        };
    },

    /**
     * Registers the given provider with the permissions store, under the given name and,
     * if specified, under the given namespace.
     *
     * @param {Object} provider - An object describing the provider to be registered, should
     * contain any permission matchers, special variables, and parameter details.
     * @param {string} name - Name which the provider should be registered under.
     * @param {string} [namespace] - Namespace which the provider should be registered in.
     * If no namespace is provided, then the provider is registered within the global space.
     *
     * @throws An error if the user attempts to register a provider with the same name as an
     * already registered provider, within the same namespace.
     * @throws An error if the passed providerObject is not a proper object (i.e. non-null).
     */
    register(provider, name, namespace) {

        // NOTE:
        // All provider methods should start with one of ['is', 'can', 'has'], in order to keep
        // things clear and sensible. At the moment this isn't enforced... Should it be?
        //
        // Examples of clear validation names:
        // isLoggedIn, isAdministrator, canDeleteUser, canDeleteComment, etc...
        //
        // Examples of potentially ambiguous validation names:
        // loggedIn, administrator, deleteUser, deleteComment, etc..
        //

        // throw if our provider isn't a proper object
        if (!provider || (typeof provider !== 'object')) {
            throw new Error(`Expected provider object to be a proper object, but instead found: (${typeof provider}) ${provider}`);
        }
        // default namespace to global if not specified
        if ((typeof namespace !== 'string') || (namespace.length === 0)) {
            namespace = 'global';
        }
        // grab NS object
        const ns = namespaces[namespace] || (namespaces[namespace] = {});
        // throw an error if the name we've specified is already taken
        if (ns[name]) {
            throw new Error(`Attempted to register a provider under already registered name "${name}", in namespace "${namespace}".`);
        }
        // validate the parameter defaults
        if (provider._params && (typeof provider._params === 'object')) {
            for (const key in provider._params) {
                const paramDef = provider._params[key];
                if (typeof paramDef === 'string') {
                    if (!paramDef.startsWith('?') && !paramDef.startsWith('$') && !paramDef.startsWith('req.')) {
                        throw new Error(`The provider definition "${name}" in namespace "${namespace}" contains an invalid _params entry "${key}". The string value must begin with one of '?', '$' or 'req.'`);
                    }
                } else {
                    throw new Error(`The provider definition "${name}" in namespace "${namespace}" contains an invalid _params entry "${key}". Expected a string, but instead found: (${typeof paramDef}) ${paramDef}`);
                }
            }
        }
        // otherwise we're all good to go, start extracting the validation method list (excluding any specially handled values).
        // (pull only functions, and further, only keep those which aren't considered to be special names)
        const validations = Object.keys(provider)
            .filter(k => typeof provider[k] === 'function')
            .filter(k => ['before', 'after', 'params', 'error'].indexOf(k) < 0);

        // add our definition in for the provider
        ns[name] = {
            name,
            validations,
            provider,
        };
    },

    /**
     * Unregisters the provider matching the given name and namespace, returning the matched
     * provider, or undefined if none could be found.
     *
     * @param {string} name - Name of the provider that should be unregistered.
     * @param {string} [namespace] - Namespace which should be searched for the provider to
     * remove. If no namespace is provided, then the global space will be searched.
     *
     * @returns The provider definition object which was removed, or undefined if no provider
     * could be found matching the given name (and namespace).
     */
    unregister(name, namespace) {
        // default namespace to global if not specified
        if ((typeof namespace !== 'string') || (namespace.length === 0)) {
            namespace = 'global';
        }
        // grab NS object
        const ns = namespaces[namespace] || {};
        const res = ns[name];
        delete ns[name];

        return res;
    },

    /**
     * Validates the given request against the passed validator, returning whether or not
     * the request should be allowed to proceed or not.
     *
     * @param {SailsRequest} req - The request to check against the given validator's criteria.
     * @param {Object} validator - A validator, or combination of validators used to check some
     * number of conditions against the passed request.
     *
     * @returns {boolean} true if the request has satisfied the validator's criteria, otherwise
     * false.
     *
     * @throws An error if an issue is encountered during request validation.
     */
    async validate(req, validator) {
        // return simply the result of the matcher function
        return await greenTea(req, validator);
    }

};

// If we've not one defined already, make a global Permissions object, 'cause it's more sails-ish.
if (typeof global.Permissions === 'undefined') {
    global.Permissions = module.exports;
}
