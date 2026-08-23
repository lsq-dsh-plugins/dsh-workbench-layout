import { useState } from 'react'
import { IconCodeOutline16, IconFolderClose16 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './Workbench.module.css'

export type FileTreeCreateKind = 'file' | 'directory'

interface FileTreeCreateRowProps {
  kind: FileTreeCreateKind
  depth: number
  label: string
  onCreate: (name: string) => Promise<boolean>
  onCancel: () => void
}

/** VS Code-style inline name editor placed directly in the destination directory. */
export function FileTreeCreateRow(props: FileTreeCreateRowProps) {
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)

  const submit = async (): Promise<void> => {
    if (name.trim() === '' || pending) return
    setPending(true)
    try {
      if (await props.onCreate(name)) props.onCancel()
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      role="treeitem"
      className={css.treeCreateRow}
      style={{ paddingLeft: 8 + props.depth * 16 }}
      onSubmit={(event) => { event.preventDefault(); void submit() }}
    >
      <span className={css.chevron} />
      {props.kind === 'directory' ? <IconFolderClose16 size={16} /> : <IconCodeOutline16 size={15} />}
      <input
        autoFocus
        value={name}
        aria-label={props.label}
        disabled={pending}
        onChange={event => { setName(event.currentTarget.value) }}
        onBlur={() => { if (!pending) props.onCancel() }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            props.onCancel()
          }
        }}
      />
    </form>
  )
}
