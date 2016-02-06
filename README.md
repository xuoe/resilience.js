# resilience

[![Build Status](https://img.shields.io/travis/xuoe/resilience.js.svg?style=flat-square)](https://travis-ci.org/xuoe/resilience.js)
[![Coverage Status](https://img.shields.io/coveralls/xuoe/resilience.js.svg?style=flat-square)](https://coveralls.io/r/xuoe/resilience.js)
[![NPM Version](https://img.shields.io/npm/v/resilience.svg?style=flat-square)](https://www.npmjs.com/package/resilience)

This package exports a couple of utility functions that come in handy when
dealing with Promise rejections. It is inspired by [Go's resiliency
package](https://github.com/eapache/go-resiliency).

You can read the [usage examples](#usage) below or jump straight to
the [API](#api).

## Installation

Assuming you're using `npm` and a module bundler capable of consuming CommonJS 
modules:

`npm install --save resilience`

_(Note that the package expects `Promise` (along with `Promise.race`) to be
available in the global namespace.)_

## Usage

Using [`exponentialRetry()`](#exponentialretryrun-retries--0-interval--1000-notifier):

```javascript
import { exponentialRetry } from 'resilience'

// Mimics the behavior of an asynchronous operation that fails several times,
// but that eventually succeedes.
function succeedesAfter(attempts) {
  return () => {
    attempts--
    if (attempts === 0) {
      return 'success'
    }
    return Promise.reject(new Error('failure'))
  }
}

// We want the promise to fulfill after 2 retries plus the initial attempt, which
// occurs before the retrying behavior kicks in.
const promise = exponentialRetry(succeedesAfter(3), 3, 1000)

promise.notify((context, error) => {
  console.log(context)
  console.log(error)
}).then(
  res => console.log(res),
  null // `rejection` handler is never called
)

// After 1000ms.
// > { retries: [1, 3], intervals: [1000, 2000, 4000] }
// > [Error: failure]

// After 3000ms.
// > { retries: [2, 3], intervals: [2000, 4000] }
// > [Error: failure]

// Next retry attempt, which occurs immediately after, succeeedes.
// > success
```


Using [`deadline()`](#deadlinerun-ms--0-notifier) and the
[`delay()`](#delayms-promise) helper:

```javascript
import { deadline, delay, TimeoutError } from 'resilience'

function timesOut() {
  return delay(1000).then(() => 'success')
}

const promise = deadline(timesOut, 500)

promise
  .notify(ms => console.log(ms))
  .then(
    null, // `fulfilled` handler is not called
    err => console.log(err === TimeoutError)
  )

// After 500ms.
// > 500

// Immediately after.
// > true
```

In the above examples, the function passed to `promise.notify()` is guaranteed
to be called only when events specific to `exponentialRetry()` or `deadline()`
occur.

## API

#### _`constantRetry(run, retries = 0, interval = 1000)`_: [`Notifier`](#notifier)

  - `run` (*Function*): the task to be performed,
  - `retries` (*Number*): the number of retry attempts,
  - `interval` (*Number*): the number of milliseconds to wait between retry attempts.

Returns a `Notifier` promise that is initialized by attempting to resolve
`run()`. If the initial attempt to resolve it fails, it starts retrying the
call to `run()` every `interval` milliseconds until the retry attempts run out 
or the promise fulfills. If it runs out of retry attempts, the promise finally 
rejects with the rejection value of `run()`.

The `Notifier`'s `notify()` setter method takes a function whose signature is
`fn(context, error)`, which, if set, is called just before a retry attempt is
made. `context` is a plain object whose shape is:

```javascript
{
  retries: [current, maximum], // maximum - current = retries left
  intervals: [current, ...left] // the head of which is popped on each attempt
}
```

The [first example](#usage) demonstrates how the `context` object changes
over the course of a "retry" period.

#### _`exponentialRetry(run, retries = 0, interval = 1000)`_: [`Notifier`](#notifier)

  - `run` (*Function*): the task to be performed,
  - `retries` (*Number*): the number of retry attempts,
  - `interval` (*Number*): the number of milliseconds to wait between retry attempts.

Same as `constantRetry()`, except the initial interval is incremented 
exponentially on subsequent retries; e.g., if `retries` is set to `3` and
`interval` to `1000`, the first retry attempt will occur after `1000ms`, 
the second after `2000ms` and the third after `4000ms`.

#### _`deadline(run, ms = 0)`_: [`Notifier`](#notifier)

  - `run` (*Function*): the task to be performed,
  - `ms` (*Number*): the number of milliseconds to wait before rejecting with
    `TimeoutError`.

Returns a `Notifier` that rejects with `TimeoutError` if `run()` is not resolved
within the allotted time (`ms`); otherwise, it resolves with the value of
`run()`. If `ms` is `0`, `deadline()` is not applied, and the return value of
`run()` is returned in the form of a `Promise`.

The `Notifier`'s `notify()` setter method takes a function whose signature is
`fn(ms)`, which, if set, is called after a time-out occurs.

Note that a similar behavior may be achieved by using
[`timeout()`](#timeoutpromise-ms-promise) and `catch()`ing errors that equal to
[`TimeoutError`](#timeouterror).

#### _`Notifier`_

A regular `Promise` with an additional `notify()` setter method. The `notify()`
method takes a function whose signature depends on the context in which the
`Notifier` is created (i.e., `deadline()` or `*retry()`).

Note that since `Notifier` is merely an instance-level `Promise` extension,
chaining a `Notifier` (via `then()` or `catch()`) effectively creates a new
`Promise` that lacks a `notify()` method, which means that `notify()` should be 
called at the start of the chain:

```javascript
let promise = deadline(() => delay(2000), 1000)
expect(promise.notify).to.be.a('function') // `notify` is defined.

promise = promise.notify(ms => expect(ms).to.be(1000))
expect(promise.notify).to.be.a('function') // `notify` still exists.

promise = promise.then(fulfill, reject)
expect(promise.notify).to.be(undefined) // `notify` is gone.
```

Also note that the call to `notify()` returns the `Notifier` itself, allowing for
the chain to continue.

---

### Helpers

#### _`delay(ms)`_: `Promise`

Returns a `Promise` that resolves after `ms` milliseconds.

#### _`timeout(promise, ms)`_: `Promise`

Returns a `Promise` that rejects with [`TimeoutError`](#timeouterror) if
`promise` is not resolved after `ms` milliseconds have passed; otherwise, it
resolves with the value of `promise`.

#### _`TimeoutError`_

An `Error` instance whose `message` property is set to `'Timed out'`.
