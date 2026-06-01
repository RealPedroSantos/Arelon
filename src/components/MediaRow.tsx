import React, { useRef } from 'react'

export interface MediaRowProps {
  title: string
  children: React.ReactNode
}

export function MediaRow({ title, children }: MediaRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="media-row-container">
      <h2 className="media-row-title">{title}</h2>
      <div className="media-row" ref={scrollRef}>
        {children}
      </div>
    </div>
  )
}
