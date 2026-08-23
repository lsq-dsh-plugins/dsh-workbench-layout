import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * 面向源码管理入口的三节点图标。
 *
 * DSH 自带的 Branch 图标继续用于具体分支；入口图标采用更通用的
 * Source Control 轮廓，同时复用 DSH 图标的 currentColor 与 16px 画布约定。
 */
export function IconSourceControlOutline16({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 4.75V11.25M4 7H8.25C10.3211 7 12 5.32107 12 3.25"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="4" cy="3" r="1.65" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="3" r="1.65" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4" cy="13" r="1.65" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
