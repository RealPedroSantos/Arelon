type PreloadImagesOptions = {
  batchSize?: number
  limit?: number
  timeoutMs?: number
}

function preloadImage(src: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image()
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      image.onload = null
      image.onerror = null
      resolve()
    }

    const timer = window.setTimeout(finish, timeoutMs)
    image.onload = finish
    image.onerror = finish
    image.src = src

    if (image.complete) finish()
  })
}

export async function preloadImages(urls: string[], options: PreloadImagesOptions = {}): Promise<void> {
  const batchSize = options.batchSize ?? 8
  const limit = options.limit ?? 32
  const timeoutMs = options.timeoutMs ?? 4000
  const uniqueUrls = Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean))).slice(0, limit)

  for (let index = 0; index < uniqueUrls.length; index += batchSize) {
    const batch = uniqueUrls.slice(index, index + batchSize)
    await Promise.all(batch.map((url) => preloadImage(url, timeoutMs)))
  }
}
