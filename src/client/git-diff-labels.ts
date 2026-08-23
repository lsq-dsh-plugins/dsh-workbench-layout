import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitFileDiff } from '../contracts.ts'

/** 统一编辑器标签与 Diff 内容栏使用的差异类型名称。 */
export function diffKindText(kind: GitFileDiff['kind'], t: TranslateNS<'workbench'>): string {
  switch (kind) {
    case 'worktree': return t('editor.diffWorktree')
    case 'staged': return t('editor.diffStaged')
    case 'commit': return t('editor.diffCommit')
    case 'comparison': return t('editor.diffComparison')
  }
}
