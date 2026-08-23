import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitCommit, GitCommitAction } from '../contracts.ts'
import css from './Workbench.module.css'

export interface GitCommitActionRequest {
  action: GitCommitAction
  commit: GitCommit
}

interface GitCommitActionDialogProps {
  request: GitCommitActionRequest | null
  busy: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
  t: TranslateNS<'workbench'>
}

/** 在修改提交历史前显示轻量的官方确认弹窗。 */
export function GitCommitActionDialog(props: GitCommitActionDialogProps) {
  if (props.request === null) return null
  const key = props.request.action === 'cherry-pick' ? 'cherryPick' : 'revertCommit'
  return (
    <Modal
      open
      title={props.t(`git.commitMenu.${key}.title`)}
      closeLabel={props.t('git.commitMenu.cancel')}
      description={props.t(`git.commitMenu.${key}.description`, {
        hash: props.request.commit.shortHash,
        subject: props.request.commit.subject,
      })}
      onClose={props.onClose}
      footer={(
        <>
          <Button variant="outline" disabled={props.busy} onClick={props.onClose}>{props.t('git.commitMenu.cancel')}</Button>
          <Button variant="primary" disabled={props.busy} onClick={props.onConfirm}>
            {props.busy ? props.t('git.commitMenu.working') : props.t(`git.commitMenu.${key}.confirm`)}
          </Button>
        </>
      )}
    >
      {props.error !== null && <div className={css.editorModalError} role="alert">{props.error}</div>}
    </Modal>
  )
}
