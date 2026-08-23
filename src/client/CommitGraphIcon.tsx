import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/** 两条提交轨道及合流节点，避免与三节点 Source Control 图标混淆。 */
export function IconCommitGraphOutline16({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-icon="commit-graph"
    >
      <path d="M4 2.5V13.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M11.5 3.5V6.1C11.5 7.15 10.65 8 9.6 8H6.3C5.03 8 4 9.03 4 10.3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="4" cy="3" r="1.55" fill="var(--dsw-specific-sidebar-fill)" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="11.5" cy="3" r="1.55" fill="var(--dsw-specific-sidebar-fill)" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="4" cy="8" r="1.55" fill="var(--dsw-specific-sidebar-fill)" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="4" cy="13" r="1.55" fill="var(--dsw-specific-sidebar-fill)" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}
