import { useEffect, useState } from 'react'

export function useInViewport(
  ref: React.RefObject<HTMLElement | null>,
  options: IntersectionObserverInit = {}
): boolean {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') {
      // Fallback for old environments or no ref: assume visible so images load
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry && entry.isIntersecting) {
          setInView(true)
          // Once visible, we can stop observing to save resources (image load is one-time)
          observer.disconnect()
        }
      },
      {
        root: null,
        rootMargin: '500px 0px', // prefetch images for cards ~half screen away vertically/horiz
        threshold: 0.01,
        ...options,
      }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [ref, options.rootMargin, options.threshold])

  return inView
}
