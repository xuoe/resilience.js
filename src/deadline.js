import { timeout, TimeoutError } from '.'
import { createNotifier } from './helpers'

// Returns a Promise that calls `run` and forcefully rejects with TimeoutError
// after `ms` if it hasn't been resolved by then.
export default function deadline(run, ms) {
  if (typeof run !== 'function') {
    throw new Error('Expected `run` to be a function.')
  }

  const notifier = createNotifier()

  let promise = new Promise(resolve => resolve(run()))
  promise = ms ? handle(promise, ms, notifier.notify) : promise
  promise.notify = notifier.set

  return promise
}

function handle(promise, ms, notify) {
  return timeout(promise, ms).catch(err => {
    if (err === TimeoutError) {
      notify(ms)
    }
    return Promise.reject(err)
  })
}
