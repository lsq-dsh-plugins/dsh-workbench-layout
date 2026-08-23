import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/** 参考常见编辑器的新建文件图形，沿用 DSH 的 16px/currentColor 约定。 */
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
      <path d="M3 1.75H8.35L11.25 4.65V8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.25 1.75V4.75H11.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.25 14.25H3.75C3.33579 14.25 3 13.9142 3 13.5V1.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="11.25" cy="11.25" r="3" stroke="currentColor" strokeWidth="1.25" />
      <path d="M11.25 9.65V12.85M9.65 11.25H12.85" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

/** 与新建文件成对的文件夹加号图形。 */
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
        d="M1.75 4.25V3.5C1.75 3.08579 2.08579 2.75 2.5 2.75H5.5L6.75 4.25H13.5C13.9142 4.25 14.25 4.58579 14.25 5V8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7.25 13.25H2.5C2.08579 13.25 1.75 12.9142 1.75 12.5V4.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="11.25" cy="11.25" r="3" stroke="currentColor" strokeWidth="1.25" />
      <path d="M11.25 9.65V12.85M9.65 11.25H12.85" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
