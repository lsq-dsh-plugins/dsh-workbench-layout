# DSH 工作台布局

[English](README.md) | 中文

一个独立的 DeepSeek Harness Web 插件，在不替换官方 AppFrame 和会话组件的前提下，将页面组织成文件工作台：左侧导航、中间文件区、右侧原生对话。

## 功能

- 左栏通过“会话 / 文件 / Git”切换；“会话”会恢复 DSH 原生工作区与会话列表。
- 文件目录按需展开，不会一次读取整棵目录树。
- 中栏使用 CodeMirror 编辑 UTF-8 文本，支持未保存状态、保存/还原、会话间草稿保留、版本冲突保护、原子保存和 `Ctrl/Cmd + S`。
- Markdown 文件首次打开默认显示 DSH 官方 Markdown 渲染结果，可在“预览 / 源码”之间切换。
- 右侧对话栏采用更紧凑的默认宽度；拖动中右栏分隔条即可调整，双击恢复默认，浏览器会记住选择。
- Git 页面按“工作区更改 / 已暂存 / 提交历史”分组，显示最近 40 条提交。
- 工作区、暂存区、未跟踪文件和历史提交的 Diff 都会在中栏显示，并明确标注差异来源。
- 支持暂存、取消暂存以及显式提交；提交后历史列表会立即刷新。
- 右栏继续使用 DSH 原生聊天、输入框、任务状态与交互流程。
- 布局、文字、边框、按钮、图标、Markdown 和明暗主题尽量复用 DSH 官方组件与设计变量。

## 安装

```sh
dsh plugin --profile web add @lsq64737/dsh-workbench-layout
```

卸载：

```sh
dsh plugin --profile web remove @lsq64737/dsh-workbench-layout
```

## 安全约束

- 浏览器只能提交当前会话 id 和工作区相对路径；宿主端重新从会话读取真实工作区。
- 路径越界、路径遍历、符号链接和非文本文件会被拒绝。
- 保存使用 DSH 文件系统的版本令牌和 `workspace-write` 策略；文件被其他程序修改后不会静默覆盖。
- Git 使用固定参数直接调用可执行文件，不通过 shell；提交只会由明确点击“提交”触发。
- Git 功能要求当前会话的工作区就是仓库根目录，避免提交工作区之外已暂存的内容。
- API 复用 DSH 的可信主机、同源与跨站请求校验语义，只接受 JSON POST，并限制文件、目录与 Git 输出大小。

## 已知限制

- 当前版本编辑已有 UTF-8 文本文件，不创建、删除或重命名文件。
- 符号链接不会在文件树中打开。
- 会话草稿只保留在当前页面内，刷新页面会丢失未保存内容。
- 二进制文件由 Git 标记为二进制差异，不展示二进制内容。
- 提交历史当前显示最近 40 条，不包含分页加载。
- DSH 尚未提供公开的“移动原生聊天栏”接口，因此插件使用官方 AppFrame 的稳定标记调整列顺序。若未来官方重构页面骨架，布局选择器可能需要同步适配。
- 很窄的窗口无法同时为三栏提供舒适宽度，插件会优先压缩中栏并保留右侧对话可用性。

## 开发命令

```sh
npm run typecheck
npm test
npm run build
npm run test:bundle
```

## 代码结构

- `src/index.ts`：宿主路由注册和请求分发。
- `src/workspace-backend.ts`：受控的目录、读取和原子保存。
- `src/git-backend.ts`：Git 状态、Diff、暂存和提交。
- `src/client/column-width.ts`、`ColumnResizeHandle.tsx`：对话栏宽度约束、持久化与拖拽交互。
- `src/client/controller.ts`：跨栏文件、Diff 和视图状态。
- `src/client/FileTree.tsx`、`GitPanel.tsx`：左栏文件树、Git 分组与提交历史。
- `src/client/WorkbenchEditor.tsx`：中栏源码编辑与 Markdown 预览。
- `src/client/layout-styles.ts`：官方 AppFrame 列顺序适配。
