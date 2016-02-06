export const TimeoutError = new Error('Timed out')

export function timeout(promise, ms) {
  const delayed = delay(ms).then(() => Promise.reject(TimeoutError))
  return Promise.race([promise, delayed])
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export * from './retry'
export { default as deadline } from './deadline'
