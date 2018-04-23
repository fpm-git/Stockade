# floatperms
Floatperms and the coupled [sails-hook-floatperms](https://github.com/fpm-git/sails-hook-floatperms) have been designed to fill the need for a strict, yet highly flexible permissions system, supplanting the policies system which Sails provides by default.

## What's the big idea?
Sails policies function just fine for small projects, however, as project size grows, a few issues with the default policies implementation may become evident:

- In cases where multiple policies exist to check the same (or similar) data, it must be either retrieved multiple times (once for each policy) or these policies must otherwise share this data by binding to the req object or similar. In reality, it makes more sense to batch together permission checks of related types, exposing common parameters across each, for both performance and organizational purposes.

- Policies provide no standard form of organization to group those with similar concerns together. Keeping track of everything becomes messier and messier as the list of policies grows.

- Policies provide no means of customization on a per-action basis. Because of this, it can become impossible to reuse policy logic if something even as simple as a parameter name is changed for one route, resulting in additional policies made, or messier parameter checking in one large policy.

- Policies provide no advanced matching support. It is impossible to define two (or more) policies and then continue if even just one were to succeed, meaning union policies must be manually created (f.ex., things like: isUserBannedOrNotLoggedIn).

- Policies are potentially less secure. Forgetting to define the policies for an action can (and has!) result in accidentally exposing what should be a secured route. Further, due to the lack of a common standard to export shared/relevant data from policies, they can be more error-prone.

Floatperms aims to solve these problems and more, allowing for highly reusable and clean permission validation code, while providing also the best performance you could ask for.

## How does this fix policies?
How does Floatperms solve the issues listed above? Simple:

- Floatperms enforces that related permissions are grouped together into providers, and offers handlers that can be used to initialize data once for shared use across multiple validations. Performance and sanity-saving goodness.

- As mentioned just above, Floatperms exposes providers for grouping together all validations of a certain variety, allowing for organised validations that are easy to reason about.

- Floatperms' permission matchers allow for the parameters of each validator to be remapped on a per-action basis using values pulled from cookies, request parameters, or general request fields.

- Floatperms provides means to combine validators and match against subsets of validators, ensuring there will be no duplicate code written just to provide more flexible validations. 

- Floatperms does its best to promote a secure end result: by default, the corresponding [sails-hook-floatperms](https://github.com/fpm-git/sails-hook-floatperms) will refuse to serve any route which does not have permissions defined for it, avoiding any accidents caused by a forgotten policy definition. Further, the "Floatperms way" tries to encourage a common means of exporting data from permission matchers for use in actions, such that errors become immediately evident and code remains clean, standardised, and feels natural to work with.

Now that you understand a little bit the issues that Floatperms was made to overcome, continue onwards to learn how exactly Floatperms should be used.

## Usage

### General usage
Getting started with Floatperms is generally fairly simple. All that has to be done before Sails (or Express) requests can be validated is defining your validation provider(s), which is no real hassle.

A validation provider consists of 3 general components:

1. Parameter definitions.
   - Lives in the provider's `_params` field.
   - These declare which param values should be automagically pulled from the request and exposed to each validator method. You provide the defaults, and the user can override them when constructing a matcher.
   - Should be defined as a collection containing all exposed parameter names, tied to string values indicating how they should be resolved from the request. The typed definition of this value would be something like: `{[paramName: string]: string}`.
   - As far as the parameter resolution scheme goes, you can pull values from parameters, cookies, or general `req` fields like so:
      - Begin your parameter with `?` if you wish to pull the value from a `req` parameter. For example: `target: '?targetUserID'` will define `target` as the result of `req.param('targetUserID')`.
      - Begin your parameter with `$` if you wish to pull the value from a `req` cookie. For example: `self: '$loggedUser'` will define `self` as the result of `req.cookies['loggedUser']`.
      - Begin your parameter definition with `req.` if you just want to pull some arbitrary value from the request object. For example: `ip: 'req.ip'` can be used to initialize the `ip` parameter to the requester's IP address.

2. Event handlers (lifecycle callbacks).
   - Floatperms provides two event handlers at present: `before(...)` and `params(...)`.
   - The `before` method is called just before parameters are extracted from the request. It receives the `req`, `params`, and `exports` parameters.
      - Has signature: `before(req: SailsRequest, params: Object, exports: Object)`
      - The `req` parameter should seldom be used, but is provided if need-be.
      - The `params` parameter will contain at this point only the definitions of parameters, not the resolved values. You can tweak these values to change how the parameters will ultimately be resolved, though this is not recommended.
      - The `exports` parameter should be used to automatically expose any values under the appropriate `req` field.
         - For example, using `exports.self = 1337` will result in `req.permissions.PROVIDER_NAME.self` being set.
     - This method should be used to load any data onto the request which might be needed to satify parameter resolution in some way. For example, you may want to authenticate the request, so that some parameter could use the `req.auth.user` field.
   - The `params` method is called just after parameters have been resolved from the request. It receives the `req`, `params` and `exports` parameters.
     - Has signature: `params(req: SailsRequest, params: Object, exports: Object)`
     - This method can be used to validate parameter values are of valid types, load data from the DB using resolved parameters, export additional data, etc.
     - As soon as this method returns, validations will begin to be executed, testing the request for validity. 

3. Validation methods.
   - User-defined validation methods are the heart of the provider (and the only real necessity, in fact).
   - All validation methods should be `await`-able, that is, they should be marked with `async` or return a `Promise` object.
      - The ideal signature for a validation is: `async validationName(params: Object)`.
      - Additionally, this method can accept a `req` parameter, after the params, but this should seldom be necessary (and may be forbidden in the future!).
   - Whatever validation methods are declared on the provider will be usable in matchers for this provider.
   - The return value of a validation method indicates whether or not things were a success.
      - If the validation passed: return `true`.
      - If the validation has failed: return anything but `true`. A generic `false` can show that the validation has simply failed, but including a message can be more helpful (for example, something like: `{ code: 'notLoggedIn', message: 'You must be logged in....' }` can make the error much more clear to the user and when debugging).
         - Please note that any string or object value which is returned will be emit to the user in the errors object response. 

Putting all the pieces together, you might get something like:

```js
const Permissions = require('floatperms');

const user = {

    _params: {
        /**
         * A reference to the user which is executing the action we are to check.
         * Exported as: self.
         */
        self: 'req.auth.user',
    },

    /**
     * Any code which should be run immediately before the validator matching begins, before
     * even parameters are resolved.
     *
     * As this method is called prior to parameter resolution, it is possible that one might
     * use it to override certain types of param declaration, throwing an error under certain
     * conditions or similar.
     *
     * Further, if any sort of data should be populated on the request object before handling
     * parameter resolution, then it should be done here.
     *
     * @param {SailsRequest} req - The request to be validated. Use this object to retrieve
     * or set any sort of cookie/session/etc. data, or perform additional processing based on
     * headers.
     * @param {Object} params - The parameters as declared for this validator, prior to being
     * resolved. These may be a combination of defaults from _params, or values passed through
     * validator overrides.
     * @param {Object} exports - Used to export any sort of data values which should be shared
     * with controller code, on the `req` object. Any fields added to this object will be added
     * to the appropriate section (`req.permissions.PROVIDER_NAME.*`) after the params handler
     * completes.
     */
    async before(req, params, exports) {
        // We'll use this step to authenticate the request using the UserAuth service.
        // This allows our parameter resolution step to pull the user object straight from
        // the request, provided we're logged in. If the self test happens to fail anywhere,
        // then the user clearly isn't logged in and we'll do our job of keeping them out!
        await UserAuth.authenticate(req);
    },

    /**
     * Optional handler used to process parameters after they have been resolved.
     *
     * Useful if there are any defaults, validations to perform, or additional processing
     * left to perform (such as retrieving something from an external datastore, etc.).
     *
     * In many cases, it may be desirable to attach a resolved model instance to the req
     * object, such that it can be easily referenced from controllers or elsewhere.
     *
     * If any custom code should be run before parameters are resolved, then the `before`
     * handler should be declared as well.
     *
     * @param {SailsRequest} req - The request which is currently being validated. Having
     * access to this is valuable if one needs to read or write additional data to this
     * outside the basic capabilities of the # param tag.
     * @param {Object} params - The parameters which have already been extracted for this
     * request, as declared in _params or validator overrides.
     * @param {Object} exports - Used to export any sort of data values which should be shared
     * with controller code, on the `req` object. Any fields added to this object will be added
     * to the appropriate section (`req.permissions.PROVIDER_NAME.*`) after this handler has
     * completed.
     */
    async params(req, params, exports) {
        // Export our .self to the req, so the consumer doesn't have to fetch it again,
        // and we'll fail early if something is goofed up.
        exports.self = params.self;
    },

    /**
     * Validation to check if the requester is currently logged in as some user.
     */
    async isLoggedIn(params) {
        // If our .self is defined, we're all good-to-go :3
        if (params.self && (typeof params.self === 'object')) {
            return true;
        }
        // Otherwise, somebody isn't logged in, reject :P
        return {
            code: 'notLoggedIn',
            message: 'You must be logged in to access this resource :(',
        };
    },

};

Permissions.register(user, 'user');

```

At this point, validating any request against the new provider would look something like this:

```js
const Permissions = require('floatperms');

// Create a basic matcher we'll check in our request handler. Ensures the user is logged-in.
const matcher = Permissions.for('user').allOf('isLoggedIn');

// Handler for some demo request.
async function someRequestHandler(req, res) {
    // Check the request against our `matcher`.
    const validationRes = await Permissions.validate(req, matcher);
    
    // If we've not passed, return a 403 Forbidden with our failed validation info.
    if (!validationRes.hasPassed) {
        return res.forbidden(validationRes.failedValidations);
    }
    
    // Your custom request logic here...
}
```

And that's that: the request handler above will check against the `matcher` before proceeding, returning a 403 response if the matcher fails (i.e. the user isn't logged-in).

Of course, having to manually run the validations for each request is mostly [unacceptable](https://youtu.be/07So_lJQyqw). What'd be best is a way to pull these out somewhere, allowing us to avoid cluttering up our requests. Luckily, there's a hook for that, so read on below for more information!

### Coupled with sails-hook-floatperms
The ideal use case for Floatperms is coupled with the [sails-hook-floatperms](https://github.com/fpm-git/sails-hook-floatperms) hook. This hook automatically wraps the actions in your Sails application and enforces that proper permissions are defined for each; trying to execute an action which has no permissions defined will result in a **403 Forbidden** response.

When using this hook, binding permission guards to specific actions becomes simple and clean: just add a `permissions` field to the controller's `_config`, containing the names of all routes to protect, associated with their desired validations.

For example:

```js
/**
 * @file UserController.js
 * Provides actions related to updating and retrieving user data.
 */

const Permissions = require('floatperms');

module.exports = {

    _config: {
        permissions: {
            getInfo: Permissions.for('user').allOf('isLoggedIn')
        }
    },
    
    async getInfo(req, res) {
        return res.json(req.permissions.user.self);
    }
    
};
```
In this example, any route calling the `getInfo` action will result in a check against the `user:isLoggedIn` validation method. If the user isn't logged-in, the validation will fail and so the `getInfo` method won't be called, and the user will receive a **403 Forbidden** response. If the user is logged-in, all validations pass; the action will be called as normal, with also the requester's user being bound to the `req.permissions.user.self` field.

That's the extent of using [sails-hook-floatperms](https://github.com/fpm-git/sails-hook-floatperms): validation error handling is automatically done for you. Further, any errors which your action itself may happen to throw will also be caught and logged (protecting against the complete termination resulting from scenarios where some async function throws but the error is not caught).


## Advanced Usage
There may come a time when some routes need more than simple checking against a complete set of validations, or where you'd like to go against default behaviour. Both are valid use-cases, and you aren't prohibited from doing so with Floatperms, in fact it is quite easy to do so.

This section is divided into two subsections: **Validator Customizations** and **Compound Validators**. The first details how to override parameters, use different validation methods, etc. The latter explains how validators may be combined together, to accomplish more complex validation schemes without having to build messy composite validation methods.

### Validator Customizations

**No-op validators:**

Sometimes you might have an action which needs no protection. This poses an issue with [sails-hook-floatperms](https://github.com/fpm-git/sails-hook-floatperms), which enforces the constraint that all actions must have a validator defined. For this sort of scenario, there exists a special no-op validation, which you can generate and use like so:

```js
_config: {
    permissions: {
        someUnprotectedAction: Permissions.none()
    }
}
```


**Using namespaces:**

In certain scenarios, there may be a need to define multiple providers of the same name. This is where the optional `namespace` parameter of `Permissions.register(provider, name, namespace)` comes in.

By default, all providers are registered under the global namespace and are accessible without denoting this. When providing a namespace name during registration, the provider is no longer accessible in the global space and a namespace must be specified during matcher construction.

For example, given only the provider registered with:

```js
Permissions.register(validator, 'user', 'potet');
```

The following validators will have the noted effects:

```js
Permissions.for('user', 'potet');  // <-- WORKS OK
Permissions.for('user');           // <-- THROWS "NOT FOUND" ERROR ON LIFT
```


**Flexible validators:**

Typically, validations will be written with the strict `allOf` matching-scheme, but there exist a few additional methods, for actions where more or less complex validations might apply. All supported methods are described below...

`all()`
 
Makes passing of the overall validation contingent on *all* validation methods supported by the provider passing.

This matching-scheme will attempt to execute all validations methods, with no guaranteed order, and potentially in parallel.

Accepts no arguments.

______

`any()`
 
Makes passing of the overall validation contingent on *at least* one validation method supported by the provider passing.

This matching-scheme will attempt to execute all validations methods, with no guaranteed order, and potentially in parallel.

Accepts no arguments.

______

`allOf(...validationMethodNames: string[])`

Makes passing of the overall validation contingent on *all* of the listed validation methods (`...validationMethodNames`) passing.

This matching-scheme will attempt to execute all listed methods in no guaranteed order, potentially in parallel.

______

`anyOf(...validationMethodNames: string[])`

Makes passing of the overall validation contingent on *at least* one of the listed validation methods (`...validationMethodNames`) passing.

This matching-scheme will attempt to execute all listed methods in no guaranteed order, potentially in parallel.

______

Please note that no method will be considered to pass if an error is thrown from a validation method while testing.

If, for example, the `any()` method were used and 10 methods passed, while only 1 failed, but this method threw an error, then the test will be considered to have failed.

Validation methods should avoid throwing where possible, using the failure explanation instead (though it is admissible to throw if a DB error occurs, or something critical has gone wrong, etc.). Be sensible and only throw when... *stuff* has hit the fan.


**Overriding parameters:**

Most providers will read some sort of data from the request object, be it some session values, request parameters, or other data loaded onto the `req` instance. A well-made provider will typically use the parameters feature to both automagically populate things and also expose these values for customization.

Parameters are overriden simply by calling the desired override parameter's name with the replacement value. All parameter overrides must be set before the match method (`allOf()`, `anyOf()`, etc.) within the validator chain.

Overrides can be useful to greatly extend the reusability of any given validation, allowing targets to be remapped to different `req` parameters. Because this feature allows the validation methods to consume parameters based on arbitrary request parameters, this allows us the huge convenience of not being restricted to using the same parameter definitions across all route definitions. Keep in mind, however, it may be best not to go overboard with this, as the permission exports should be favored over parameters.

For example, we might want to feed the validator `target` param from the request parameter named `banTargets`, for our banUsers route:

```js
_config: {
    permissions: {
        banUsers: Permissions.for('moderation').target('?banTargets').allOf('canBanTarget')
    }
}
```

This allows use to call the endpoint like `/banUsers?banTargets=ID&banTargets=ANOTHER_ID...`, rather than with the more generic `/banUsers?targetUserID=ID&banTargets=ANOTHER_ID`. The above case accomplishes little more than customizing the request parameter name, while adding no real benefits or additional clarity: this is an example of perhaps a bit frivolous override usage.

One example of valid usage would be with regards to validation methods that check if the requester may customize some user. For the case where we update another user's info, it makes sense to specify a target (the other user). For the case where the request is meant to update the issuing user, submitting our own ID is superfluous, and so the target should likely be mapped to the session-user (`req.auth.user.id` or similar). On the other hand, if there exists no special handling for the case of the self, then sharing one action and validation set could potentially be ideal (decide upon a standard and stick to it here–it's all preference to do with readability).


**Parallel execution:**

If for some reason there exists a validator which is expected to execute a large amount of async code, or if one simply wishes to gain a little performance, it is possible to run all test methods of a validator in "parallel" (of course user code will still execute on the main thread, but when any method is stuck waiting for IO, this will give another method the opportunity to run a bit).

Triggering parallel execution is fairly simple: just make a call to `.parallel()` in the validator chain, prior to specifying the match method (`allOf()`, `anyOf()`, etc.).

See the following example for a sample parallel validator definition:

```js
_config: {
    permissions: {
        dbHeavyAction: Permissions.for('someDbHeavyProvider').parallel().allOf(
            'dbHeavyTest1',
            'dbHeavyTest2',
            'ioHeavyTest3',
            'anotherIOHeavyTest',
            'yetAnotherIOHeavyTest'
       )
    }
}
```

In the above example, upon testing for `dbHeavyAction` all the listed test methods will be started at the same time, rather than waiting for the previous test to finish before continuing; this can result in some *significant* speedups, and should induce no ill-effects (if the provider was designed correctly).

Please note that compound validators may not be executed in parallel, so their sub-validators should be marked parallel instead, for a performance boost.

### Compound Validators

A compound validator is a sort of validator which runs a match method over two or more validators, rather than matching against a collection of simple validation methods.

Compound validators are most useful for requiring that a collection of validations pass across multiple different providers, like in the example below:

```js
_config: {
    permissions: {
        manageCreator: Permissions.anyOf(
            Permissions.for('creator').allOf('canManageCreator'),
            Permissions.for('moderation').allOf('isAdministrator')
        )
    }
}
```
In this example, the user is allowed to access the manageCreator route is they pass `creator:canManageCreator` OR if they pass the `moderation:isAdministrator` check (alternatively, the creator:canManageCreator could check if the user is an administrator, passing already in this case and avoiding the need for a compound validator–but again, this is a stylistic thing).

Compound validators may be composed of other compound validators, and may include any number of validations for the same provider, allowing for some advanced matching schemes to be made.

There are two methods of constructing a compound validator, depending on the type of match method which should be used:

1. `Permissions.anyOf(...validatorList)`
   - Accepts a minimum of two validators, and returns a compound validator with success contingent on *at least* one of the given validators passing.

2. `Permissions.allOf(...validatorList)`
   - Accepts a minimum of two validators, and returns a compound validator with success being contingent on *all* of the given validators passing.



## Other Questions / Concerns

For any other questions or concerns not exactly answered by this document, it can be quite enlightening to have a peek at the source. The code is fairly well-documented and tries to stay simple and clean to understand (know that if there is funky code going on somewhere, it should hopefully be documented and explained in simple terms).



