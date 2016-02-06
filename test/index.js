import tape from 'blue-tape'
import sinon from 'sinon'

import { delay } from '../src'
tape('delay()', t => {
  const spy = sinon.spy()
  const promise = delay(1).then(spy)

  t.notOk(spy.called, "doesn't resolve until given ms pass")

  return promise.then(() => {
    t.ok(spy.called, 'resolves when given ms have passed')
  })
})

import { timeout, TimeoutError } from '../src'
tape('timeout()', t => {
  t.plan(2)

  let promise = delay(5)
  timeout(promise, 1).then(
    () => t.fail('must not call `fulfill` handler on time-out'),
    err => t.ok(err === TimeoutError, 'rejects with TimeoutError on time-out')
  )

  const spy = sinon.spy()
  promise = delay(5).then(spy)
  timeout(promise, 10).then(
    () => t.ok(spy.called, 'fulfills if no time-out occurs'),
    () => t.fail('must not call `reject` handler when no time-out occurs')
  )
})

import { deadline } from '../src'
tape('deadline()', t => {
  t.plan(7)

  const throwFn = () => deadline('not a function', 123)
  t.throws(throwFn, /to be a function/, 'throws if `run` is not a function')

  let run = () => 'test'
  deadline(run).then(
    res => {
      t.equal(
        res,
        'test',
        'calls `run` and fulfills with its return value when no deadline is set'
      )
    },
    () => t.fail('must not call `reject` handler when no deadline is set')
  )

  const spy1 = sinon.spy()
  run = () => delay(5)
  deadline(run, 1).notify(spy1).then(
    () => t.fail('must not call `fulfill` handler on time-out'),
    err => t.ok(err === TimeoutError, 'rejects with TimeoutError on time-out')
  ).then(() => {
    t.ok(spy1.called, 'must call `notify()` on TimeoutError')
  })

  const spy2 = sinon.spy()
  run = () => { throw new Error('test') }
  deadline(run, 1).notify(spy2).then(
    () => t.fail('must not call `fulfill` handler on rejection'),
    err => t.ok(err.message === 'test', 'rejects on non-TimeoutError')
  ).then(() => {
    t.notOk(spy2.called, 'must not call `notify()` on non-TimeoutError')
  })

  run = () => 'test'
  deadline(run, 10).then(
    res => {
      t.equal(
        res,
        'test',
        'wraps and calls `run`; fulfills with its return value'
      )
    },
    () => t.fail('must not call `reject` handler when the deadline is met')
  )
})

import { constantRetry } from '../src'
tape('constantRetry()', t => {
  const tests = [
    {
      retries: 3,
      interval: 1,
      result: new Error('test'),
      throws: true,
      contexts: [
        {
          retries: [1, 3],
          intervals: [1, 1, 1]
        },
        {
          retries: [2, 3],
          intervals: [1, 1]
        },
        {
          retries: [3, 3],
          intervals: [1]
        }
      ]
    },
    {
      retries: 5,
      interval: 1,
      result: 'fulfilled',
      contexts: []
    },
    {
      // 0 retries
      interval: 1,
      result: 'fulfilled',
      contexts: []
    },
    {
      // 0 retries
      // 1000 interval
      result: 'fulfilled',
      contexts: []
    },
    {
      retries: 3,
      interval: 1,
      result: (() => {
        let runs = 0
        return () => {
          runs++
          if (runs === 3) {
            return 'fulfilled'
          } else {
            return new Error('rejected')
          }
        }
      })(),
      contexts: [
        {
          retries: [1, 3],
          intervals: [1, 1, 1]
        },
        {
          retries: [2, 3],
          intervals: [1, 1]
        }
      ]
    }
  ]

  return reduceRetryTests(t, tests, constantRetry)
})

import { exponentialRetry } from '../src'
tape('exponentialRetry()', t => {
  const tests = [
    {
      retries: 5,
      interval: 1,
      result: 'all good',
      contexts: []
    },
    {
      retries: 3,
      interval: 1,
      result: new Error('test'),
      throws: true,
      contexts: [
        {
          retries: [1, 3],
          intervals: [1, 2, 4]
        },
        {
          retries: [2, 3],
          intervals: [2, 4]
        },
        {
          retries: [3, 3],
          intervals: [4]
        }
      ]
    },
    {
      retries: 3,
      interval: 1,
      result: (() => {
        let runs = 0
        return () => {
          runs++
          if (runs === 3) {
            return 'fulfilled'
          } else {
            return new Error('rejected')
          }
        }
      })(),
      contexts: [
        {
          retries: [1, 3],
          intervals: [1, 2, 4]
        },
        {
          retries: [2, 3],
          intervals: [2, 4]
        }
      ]
    }
  ]

  return reduceRetryTests(t, tests, exponentialRetry)
})

tape('retry-related sanity checks', t => {
  t.throws(
    () => constantRetry('asdf'),
    /to be a function/,
    'throws if `run` is not a function'
  )

  t.throws(
    () => constantRetry(() => {}).notify('test'),
    /to be a function/,
    'throws if `notify` is not a function'
  )

  t.end()
})

// Helpers for retry-related functions.
function createRunFunc(result, spy) {
  return () => {
    spy && spy()
    const actual = typeof result === 'function'
      ? result()
      : result

    return actual instanceof Error
      ? Promise.reject(actual)
      : Promise.resolve(actual)
  }
}

function reduceRetryTests(t, tests, retry) {
  return tests.reduce((next, test, idx) => {
    const contexts = []
    const spy = sinon.spy()
    let error

    const run = createRunFunc(test.result, spy)

    return next.then(() => {
      return retry(run, test.retries, test.interval).notify(
        (context, err) => {
          error = err
          contexts.push(context)
        }
      ).catch(err => {
        if (!test.throws) {
          t.fail(`test ${idx} must not throw`)
        }
        t.ok(err === error, 'rejects with original error')
      }).then(() => {
        t.ok(
          spy.callCount === contexts.length+1,
          'calls `run` retries+1 times'
        )
        t.deepEqual(
          contexts,
          test.contexts,
          'retries and calls notify() with the corresponding "retry" context'
        )
      })
    })
  }, Promise.resolve())
}
