import { useEffect, useState } from 'react'
import { Button, Input, Modal, RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceEntry } from '../contracts.ts'
import css from './Workbench.module.css'

interface FileTreeDialogsProps {
  renameTarget: WorkspaceEntry | null
  deleteTarget: WorkspaceEntry | null
  busy: boolean
  error: string | null
  onClose: () => void
  onRename: (name: string) => void
  onDelete: () => void
  t: TranslateNS<'workbench'>
}

/** Official modal shells for the two file-tree mutations that require deliberate input. */
export function FileTreeDialogs(props: FileTreeDialogsProps) {
  const [name, setName] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => {
    setName(props.renameTarget?.name ?? '')
  }, [props.renameTarget])

  useEffect(() => {
    setAcknowledged(false)
  }, [props.deleteTarget])

  const renameName = name.trim()
  return (
    <>
      <Modal
        open={props.renameTarget !== null}
        title={props.t('files.renameTitle')}
        closeLabel={props.t('files.cancel')}
        description={props.t('files.renameDescription', { path: props.renameTarget?.path ?? '' })}
        onClose={props.onClose}
        footer={(
          <>
            <Button variant="outline" disabled={props.busy} onClick={props.onClose}>{props.t('files.cancel')}</Button>
            <Button
              variant="primary"
              disabled={props.busy || renameName === '' || renameName === props.renameTarget?.name}
              onClick={() => { props.onRename(renameName) }}
            >
              {props.busy ? props.t('files.working') : props.t('files.renameConfirm')}
            </Button>
          </>
        )}
      >
        <div className={css.gitDialogForm}>
          <label className={css.gitDialogField}>
            <span>{props.t('files.name')}</span>
            <Input
              autoFocus
              value={name}
              disabled={props.busy}
              onChange={event => { setName(event.currentTarget.value) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !props.busy && renameName !== '' && renameName !== props.renameTarget?.name) {
                  props.onRename(renameName)
                }
              }}
            />
          </label>
          {props.error !== null && <div className={css.editorModalError} role="alert">{props.error}</div>}
        </div>
      </Modal>
      <RiskConfirmation
        open={props.deleteTarget !== null}
        title={props.t(props.deleteTarget?.kind === 'directory' ? 'files.deleteDirectoryTitle' : 'files.deleteFileTitle')}
        description={props.t(props.deleteTarget?.kind === 'directory' ? 'files.deleteDirectoryDescription' : 'files.deleteFileDescription', {
          path: props.deleteTarget?.path ?? '',
        })}
        acknowledgeLabel={props.t('files.deleteAcknowledge')}
        cancelLabel={props.t('files.cancel')}
        confirmLabel={props.t('files.deleteConfirm')}
        acknowledged={acknowledged}
        disabled={props.busy}
        onAcknowledgedChange={setAcknowledged}
        onCancel={props.onClose}
        onConfirm={props.onDelete}
      />
    </>
  )
}
