export function createNotifier() {
  let _notify = noop

  function set(notify) {
    if (typeof notify !== 'function') {
      throw new Error('Expected `notify` to be a function.')
    }
    _notify = notify

    return this // a Promise
  }

  function notify(...args) {
    _notify(...args)
  }

  return { set, notify }
}

/* istanbul ignore next */
function noop() {}
