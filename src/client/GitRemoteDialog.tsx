import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Input, Modal, RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitRemote, GitRemotes, GitStatus, GitTargetRemoteOperation } from '../contracts.ts'
import css from './Workbench.module.css'

export type GitRemoteDialogMode = 'manage' | 'target'

export interface GitRemoteDraft {
  currentName?: string
  name: string
  fetchUrl: string
  pushUrl: string
}

interface GitRemoteDialogProps {
  mode: GitRemoteDialogMode | null
  remotes: GitRemotes | null
  status: GitStatus | null
  busy: boolean
  error: string | null
  onClose: () => void
  onSave: (draft: GitRemoteDraft) => void
  onDelete: (name: string) => void
  onRun: (operation: GitTargetRemoteOperation, remote: string, branch?: string) => void
  t: TranslateNS<'workbench'>
}

const NEW_REMOTE = '__new_remote__'

/** 远端配置与指定目标操作共享官方弹窗外壳，同时保持两条流程彼此独立。 */
export function GitRemoteDialog(props: GitRemoteDialogProps) {
  const [selected, setSelected] = useState(NEW_REMOTE)
  const [name, setName] = useState('')
  const [fetchUrl, setFetchUrl] = useState('')
  const [pushUrl, setPushUrl] = useState('')
  const [operation, setOperation] = useState<GitTargetRemoteOperation>('fetch')
  const [targetRemote, setTargetRemote] = useState('')
  const [branch, setBranch] = useState('')
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const remoteList = props.remotes?.remotes ?? []

  useEffect(() => {
    if (props.mode === null) return
    setSelected(NEW_REMOTE)
    setName('')
    setFetchUrl('')
    setPushUrl('')
    setOperation('fetch')
    setTargetRemote(remoteList[0]?.name ?? '')
    setBranch(props.status?.branch ?? '')
    setDeleteAcknowledged(false)
    setDeleteOpen(false)
  }, [props.mode, props.status?.branch, props.remotes])

  if (props.mode === null) return null
  const selectedRemote = remoteList.find(remote => remote.name === selected)
  const loading = props.remotes === null
  if (props.mode === 'target') {
    const needsBranch = operation !== 'fetch'
    return (
      <Modal
        open
        title={props.t('git.remoteDialog.target.title')}
        closeLabel={props.t('git.remoteDialog.cancel')}
        description={props.t('git.remoteDialog.target.description')}
        onClose={props.onClose}
        footer={(
          <>
            <Button variant="outline" disabled={props.busy} onClick={props.onClose}>{props.t('git.remoteDialog.cancel')}</Button>
            <Button
              variant="primary"
              disabled={props.busy || loading || targetRemote === '' || (needsBranch && branch.trim() === '')}
              onClick={() => { props.onRun(operation, targetRemote, needsBranch ? branch.trim() : undefined) }}
            >
              {props.busy ? props.t('git.remoteDialog.working') : props.t(`git.remoteDialog.target.${operation}`)}
            </Button>
          </>
        )}
      >
        <div className={css.gitDialogForm}>
          <SelectField label={props.t('git.remoteDialog.operation')} value={operation} disabled={props.busy} onChange={value => { setOperation(value as GitTargetRemoteOperation) }}>
            <option value="fetch">{props.t('git.fetch')}</option>
            <option value="pull">{props.t('git.pull')}</option>
            <option value="push">{props.t('git.push')}</option>
          </SelectField>
          <SelectField label={props.t('git.remoteDialog.remote')} value={targetRemote} disabled={props.busy || loading} onChange={setTargetRemote}>
            {remoteList.length === 0 && <option value="">{props.t('git.remoteDialog.noRemotes')}</option>}
            {remoteList.map(remote => <option key={remote.name} value={remote.name}>{remote.name}</option>)}
          </SelectField>
          {needsBranch && (
            <TextField label={props.t('git.remoteDialog.branch')} value={branch} disabled={props.busy} onChange={setBranch} />
          )}
          {props.error !== null && <div className={css.editorModalError} role="alert">{props.error}</div>}
        </div>
      </Modal>
    )
  }

  const saveDisabled = props.busy || loading || name.trim() === '' || fetchUrl.trim() === ''
  return (
    <>
      <Modal
        open={!deleteOpen}
        title={props.t('git.remoteDialog.manage.title')}
        closeLabel={props.t('git.remoteDialog.cancel')}
        description={props.t('git.remoteDialog.manage.description')}
        onClose={props.onClose}
        footer={(
          <>
            {selectedRemote !== undefined && (
              <Button variant="outline" className={css.discardAction} disabled={props.busy} onClick={() => { setDeleteOpen(true) }}>
                {props.t('git.remoteDialog.delete')}
              </Button>
            )}
            <Button variant="outline" disabled={props.busy} onClick={props.onClose}>{props.t('git.remoteDialog.cancel')}</Button>
            <Button
              variant="primary"
              disabled={saveDisabled}
              onClick={() => { props.onSave({ ...(selectedRemote === undefined ? {} : { currentName: selectedRemote.name }), name: name.trim(), fetchUrl: fetchUrl.trim(), pushUrl: pushUrl.trim() }) }}
            >
              {props.busy ? props.t('git.remoteDialog.working') : props.t('git.remoteDialog.save')}
            </Button>
          </>
        )}
      >
        <div className={css.gitDialogForm}>
          <SelectField
            label={props.t('git.remoteDialog.remote')}
            value={selected}
            disabled={props.busy || loading}
            onChange={(value) => {
              setSelected(value)
              const remote = remoteList.find(candidate => candidate.name === value)
              applyRemote(remote, setName, setFetchUrl, setPushUrl)
            }}
          >
            <option value={NEW_REMOTE}>{props.t('git.remoteDialog.newRemote')}</option>
            {remoteList.map(remote => <option key={remote.name} value={remote.name}>{remote.name}</option>)}
          </SelectField>
          <TextField label={props.t('git.remoteDialog.name')} value={name} disabled={props.busy} onChange={setName} />
          <TextField label={props.t('git.remoteDialog.fetchUrl')} value={fetchUrl} disabled={props.busy} onChange={setFetchUrl} />
          <TextField label={props.t('git.remoteDialog.pushUrl')} value={pushUrl} disabled={props.busy} onChange={setPushUrl} placeholder={props.t('git.remoteDialog.pushUrlPlaceholder')} />
          {props.error !== null && <div className={css.editorModalError} role="alert">{props.error}</div>}
        </div>
      </Modal>
      <RiskConfirmation
        open={deleteOpen}
        title={props.t('git.remoteDialog.deleteTitle')}
        description={props.t('git.remoteDialog.deleteDescription', { name: selectedRemote?.name ?? '' })}
        acknowledgeLabel={props.t('git.remoteDialog.deleteAcknowledge')}
        cancelLabel={props.t('git.remoteDialog.cancel')}
        confirmLabel={props.t('git.remoteDialog.delete')}
        acknowledged={deleteAcknowledged}
        disabled={props.busy}
        onAcknowledgedChange={setDeleteAcknowledged}
        onCancel={() => { setDeleteOpen(false); setDeleteAcknowledged(false) }}
        onConfirm={() => { if (selectedRemote !== undefined) props.onDelete(selectedRemote.name) }}
      />
    </>
  )
}

function SelectField(props: {
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className={css.gitDialogField}>
      <span>{props.label}</span>
      <select value={props.value} disabled={props.disabled} onChange={event => { props.onChange(event.currentTarget.value) }}>
        {props.children}
      </select>
    </label>
  )
}

function TextField(props: {
  label: string
  value: string
  disabled: boolean
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <label className={css.gitDialogField}>
      <span>{props.label}</span>
      <Input
        value={props.value}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={event => { props.onChange(event.currentTarget.value) }}
      />
    </label>
  )
}

function applyRemote(
  remote: GitRemote | undefined,
  setName: (value: string) => void,
  setFetchUrl: (value: string) => void,
  setPushUrl: (value: string) => void,
): void {
  setName(remote?.name ?? '')
  setFetchUrl(remote?.fetchUrl ?? '')
  setPushUrl(remote?.separatePushUrl === true ? remote.pushUrl : '')
}
