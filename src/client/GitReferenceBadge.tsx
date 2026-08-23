import type { CSSProperties } from 'react'
import type { GitReference, GitReferenceKind } from '../contracts.ts'
import css from './Workbench.module.css'

interface GitReferenceBadgeProps {
  reference: GitReference
  color: string
}

type ReferenceStyle = CSSProperties & { '--git-ref-color': string }

/** 与 Graph 色段绑定的紧凑引用标志。 */
export function GitReferenceBadge({ reference, color }: GitReferenceBadgeProps) {
  return (
    <span
      className={css.commitRef}
      data-git-reference=""
      data-reference-kind={reference.kind}
      style={{ '--git-ref-color': color } as ReferenceStyle}
      title={reference.name}
    >
      <ReferenceIcon kind={reference.kind} />
      <span>{reference.name}</span>
    </span>
  )
}

function ReferenceIcon({ kind }: { kind: GitReferenceKind }) {
  if (kind === 'head') {
    return (
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="4.5" />
        <circle cx="6" cy="6" r="2.2" />
        <circle cx="6" cy="6" r="0.65" className={css.referenceIconFill} />
      </svg>
    )
  }
  if (kind === 'remote') {
    return (
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M3.15 9.35h5.5a2.1 2.1 0 0 0 .31-4.18A3.1 3.1 0 0 0 3.1 4.5a2.43 2.43 0 0 0 .05 4.85Z" />
      </svg>
    )
  }
  if (kind === 'tag') {
    return (
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M1.8 2.1v3.25l4.55 4.55a.9.9 0 0 0 1.27 0L9.9 7.62a.9.9 0 0 0 0-1.27L5.35 1.8H2.1a.3.3 0 0 0-.3.3Z" />
        <circle cx="4" cy="4" r="0.7" className={css.referenceIconFill} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 3.8v4.4M3 6h2.6A2.4 2.4 0 0 0 8 3.6" />
      <circle cx="3" cy="2.5" r="1.15" />
      <circle cx="3" cy="9.5" r="1.15" />
      <circle cx="8" cy="2.5" r="1.15" />
    </svg>
  )
}
