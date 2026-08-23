import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/** 紧凑的新建文件图形：折角文档与无外圈加号共享 DSH 的 16px 笔画节奏。 */
export function IconFileAddOutline16({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-icon="file-add"
    >
      <path
        d="M8.25 1.5H3.25C2.83579 1.5 2.5 1.83579 2.5 2.25V13.75C2.5 14.1642 2.83579 14.5 3.25 14.5H7.25M8.25 1.5L11.5 4.75M8.25 1.5V4.75H11.5V7.25"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.5 9V14M9 11.5H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

/** 与新建文件成对的文件夹图形；加号尺寸、位置与笔画完全一致。 */
export function IconFolderAddOutline16({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-icon="folder-add"
    >
      <path
        d="M1.5 5V3.75C1.5 3.33579 1.83579 3 2.25 3H5.5L6.75 4.5H13.75C14.1642 4.5 14.5 4.83579 14.5 5.25V7.25M1.5 5V13.25C1.5 13.6642 1.83579 14 2.25 14H7.25"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.5 9V14M9 11.5H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
