import type { ReactNode } from 'react'

type PageIntroProps = {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageIntro({ eyebrow, title, description, actions, className }: PageIntroProps) {
  return (
    <header className={`page-intro${className ? ` ${className}` : ''}`}>
      <div className="page-intro-copy">
        {eyebrow ? <p className="page-intro-eyebrow">{eyebrow}</p> : null}
        <div className="page-intro-title">{title}</div>
        {description ? <p className="page-intro-description">{description}</p> : null}
      </div>

      {actions ? <div className="page-intro-actions">{actions}</div> : null}
    </header>
  )
}
