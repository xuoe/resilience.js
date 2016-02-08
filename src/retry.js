import { delay } from '.'
import { createNotifier } from './helpers'

const CONSTANT = 'constant'
const EXPONENTIAL = 'exponential'
const DEFAULT_RETRIES = 1
const DEFAULT_INTERVAL = 1000

export function exponentialRetry(run, retries, interval) {
  return retry(EXPONENTIAL, run, retries, interval)
}

export function constantRetry(run, retries, interval) {
  return retry(CONSTANT, run, retries, interval)
}

// Returns a Promise that calls `run` and handles potential rejections by
// retrying the call every `interval` ms for `retries` attempts.
function retry(type, run, retries, interval) {
  if (typeof run !== 'function') {
    throw new Error('Expected `run` to be a function.')
  }

  retries = retries || DEFAULT_RETRIES
  interval = interval || DEFAULT_INTERVAL
  const ctx = createContext(type, retries, interval)
  const notifier = createNotifier()

  let promise = new Promise(resolve => resolve(run()))
  promise = promise.catch(handle(run, notifier.notify, ctx))
  promise.notify = notifier.set

  return promise
}

function handle(fn, notify, ctx) {
  return err => {
    const [done, max] = ctx.retries

    if (done < max) {
      ctx.retries[0]++
      const ctxClone = cloneContext(ctx)
      return delay(ctx.intervals.shift())
        .then(() => notify(ctxClone, err))
        .then(fn)
        .catch(handle(fn, notify, ctx))
    }

    return Promise.reject(err)
  }
}

// Creates a context object, which, once cloned, is passed to `notify` whenever
// a rejection occurs.
function createContext(type, retries, interval) {
  const createIntervals = type === EXPONENTIAL
    ? createExponentialIntervals
    : createConstantIntervals

  return {
    retries: [0, retries || 0], // done, max
    // A list of intervals appropriate for the given back-off type.
    intervals: createIntervals(retries, interval)
  }
}

// Ensures that the `ctx` object reference is not externally modifiable by
// cloning it.
function cloneContext(ctx) {
  return {
    retries: ctx.retries.slice(0),
    intervals: ctx.intervals.slice(0)
  }
}

// Builds a list of intervals (of length `retries`), where each value is equal
// to `interval`.
//
// Example: createConstantIntervals(3, 100) => [100, 100, 100]
function createConstantIntervals(retries, interval) {
  const res = []
  for (let i = 0; i < retries; i++) {
    res.push(interval)
  }
  return res
}

// Builds a list of intervals (of length `retries`), where each value is
// incremented exponentially--starting with `interval`.
//
// Example: createExponentialIntervals(3, 100) => [100, 200, 400]
function createExponentialIntervals(retries, interval) {
  const res = []
  let next = interval
  for (let i = 0; i < retries; next *= 2, i++) {
    res.push(next)
  }
  return res
}
