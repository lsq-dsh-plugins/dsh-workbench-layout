import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitBranches, GitStatus } from '../contracts.ts'
import css from './Workbench.module.css'

export type GitBranchDialogMode = 'create' | 'create-from' | 'rename' | 'delete'

interface GitBranchDialogProps {
  mode: GitBranchDialogMode | null
  status: GitStatus | null
  branches: GitBranches | null
  busy: boolean
  error: string | null
  initialSource?: { ref: string; label: string }
  onClose: () => void
  onSubmit: (nameOrRef: string, source?: string) => void
  t: TranslateNS<'workbench'>
}

/** 使用 DSH 原生 Modal 与表单控件承载紧凑的分支管理流程。 */
export function GitBranchDialog(props: GitBranchDialogProps) {
  const [name, setName] = useState('')
  const sources = props.branches?.branches ?? []
  const sourceOptions = props.initialSource === undefined
    ? sources.map(branch => ({ ref: branch.ref, label: branch.name }))
    : [props.initialSource]
  const deletable = useMemo(
    () => sources.filter(branch => branch.kind === 'local' && !branch.current),
    [sources],
  )
  const [source, setSource] = useState('')
  const [deleteRef, setDeleteRef] = useState('')

  useEffect(() => {
    if (props.mode === null) return
    setName(props.mode === 'rename' ? props.status?.branch ?? '' : '')
    setSource(props.initialSource?.ref ?? sources.find(branch => branch.current)?.ref ?? sources[0]?.ref ?? '')
    setDeleteRef(deletable[0]?.ref ?? '')
  }, [props.mode, props.status?.branch, props.initialSource, sources, deletable])

  if (props.mode === null) return null
  const title = props.t(`git.branchDialog.${props.mode}.title`)
  const destructive = props.mode === 'delete'
  const value = destructive ? deleteRef : name.trim()
  const disabled = props.busy || value === '' || (props.mode === 'create-from' && source === '')
  return (
    <Modal
      open
      title={title}
      closeLabel={props.t('git.branchDialog.cancel')}
      description={props.t(`git.branchDialog.${props.mode}.description`)}
      onClose={props.onClose}
      footer={(
        <>
          <Button variant="outline" disabled={props.busy} onClick={props.onClose}>{props.t('git.branchDialog.cancel')}</Button>
          <Button
            variant={destructive ? 'outline' : 'primary'}
            {...destructive ? { className: css.discardAction } : {}}
            disabled={disabled}
            onClick={() => { props.onSubmit(value, props.mode === 'create-from' ? source : undefined) }}
          >
            {props.busy ? props.t('git.branchDialog.working') : props.t(`git.branchDialog.${props.mode}.confirm`)}
          </Button>
        </>
      )}
    >
      <div className={css.gitDialogForm}>
        {destructive
          ? (
            <label className={css.gitDialogField}>
              <span>{props.t('git.branchDialog.branch')}</span>
              <select value={deleteRef} disabled={props.busy} onChange={event => { setDeleteRef(event.currentTarget.value) }}>
                {deletable.length === 0 && <option value="">{props.t('git.branchDialog.noDeletable')}</option>}
                {deletable.map(branch => <option key={branch.ref} value={branch.ref}>{branch.name}</option>)}
              </select>
            </label>
          )
          : (
            <label className={css.gitDialogField}>
              <span>{props.t('git.branchDialog.name')}</span>
              <Input
                autoFocus
                value={name}
                disabled={props.busy}
                placeholder={props.t('git.branchDialog.namePlaceholder')}
                onChange={event => { setName(event.currentTarget.value) }}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !disabled) props.onSubmit(value, props.mode === 'create-from' ? source : undefined)
                }}
              />
            </label>
          )}
        {props.mode === 'create-from' && (
          <label className={css.gitDialogField}>
            <span>{props.t('git.branchDialog.source')}</span>
            <select value={source} disabled={props.busy || props.initialSource !== undefined} onChange={event => { setSource(event.currentTarget.value) }}>
              {sourceOptions.map(option => <option key={option.ref} value={option.ref}>{option.label}</option>)}
            </select>
          </label>
        )}
        {props.error !== null && <div className={css.editorModalError} role="alert">{props.error}</div>}
      </div>
    </Modal>
  )
}
