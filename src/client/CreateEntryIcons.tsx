import {
  IconFolderClose16,
  IconPlusOutline16,
  type IconProps,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './CreateEntryIcons.module.css'

/** DSH 暂无通用文件图标；这里补齐与其 16px 轮廓体系一致的圆角折角文档。 */
export function IconFileOutline16({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-icon="file"
    >
      <path
        d="M8.15 1.5H4C3.17157 1.5 2.5 2.17157 2.5 3V13C2.5 13.8284 3.17157 14.5 4 14.5H12C12.8284 14.5 13.5 13.8284 13.5 13V6.85C13.5 6.45218 13.342 6.07064 13.0607 5.78934L9.21066 1.93934C8.92936 1.65804 8.54782 1.5 8.15 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 1.75V5C8.5 5.55228 8.94772 6 9.5 6H12.75"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 圆角折角文件本体叠加 DSH 官方加号。 */
export function IconFileAddOutline16({ size = 16, className }: IconProps) {
  return (
    <span
      className={[css.composite, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      aria-hidden="true"
      data-icon="file-add"
    >
      <IconFileOutline16 size={size} />
      <IconPlusOutline16 className={css.addGlyph} size={Math.max(8, Math.round(size / 2))} />
    </span>
  )
}

/** DSH 官方文件夹本体叠加官方加号。 */
export function IconFolderAddOutline16({ size = 16, className }: IconProps) {
  return (
    <span
      className={[css.composite, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      aria-hidden="true"
      data-icon="folder-add"
    >
      <IconFolderClose16 size={size} />
      <IconPlusOutline16 className={css.addGlyph} size={Math.max(8, Math.round(size / 2))} />
    </span>
  )
}
