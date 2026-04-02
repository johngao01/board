const sessionCache = new Map<string, unknown>()
const pendingCache = new Map<string, Promise<unknown>>()

export function readSessionCache<T>(key: string) {
  return sessionCache.get(key) as T | undefined
}

export function writeSessionCache<T>(key: string, value: T) {
  sessionCache.set(key, value)
  return value
}

export async function loadSessionCached<T>(key: string, loader: () => Promise<T>) {
  const cached = readSessionCache<T>(key)
  if (cached !== undefined) {
    return cached
  }

  const pending = pendingCache.get(key) as Promise<T> | undefined
  if (pending) {
    return pending
  }

  const request = loader()
    .then((result) => writeSessionCache(key, result))
    .finally(() => {
      pendingCache.delete(key)
    })

  pendingCache.set(key, request)
  return request
}
