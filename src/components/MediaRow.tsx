import React, { useRef } from 'react'

export interface MediaRowProps {
  title: string
  children: React.ReactNode
  initialFocusRow?: boolean
}

export function MediaRow({ title, children, initialFocusRow = false }: MediaRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="media-row-container" data-live-initial-row={initialFocusRow ? 'true' : undefined}>
      <h2 className="media-row-title">{title}</h2>
      <div className="media-row" ref={scrollRef}>
        {children}
      </div>
    </div>
  )
}
