export class TimeoutError extends Error {
  override readonly name = 'TimeoutError'
}

// The outcome of `work`, or a TimeoutError with `message` when it takes longer than `milliseconds`.
export async function withTimeout<T>(
  work: PromiseLike<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((...[, reject]) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(message))
    }, milliseconds)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}
