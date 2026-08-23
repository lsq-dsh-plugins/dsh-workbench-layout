# DSH 工作台布局

[English](README.md) | 中文

一个独立的 DeepSeek Harness Web 插件，在不替换官方 AppFrame 和会话组件的前提下，将页面组织成文件工作台：左侧导航、中间文件区、右侧原生对话。

## 功能

- 左栏通过“会话 / 文件 / Git”切换；“会话”会恢复 DSH 原生工作区与会话列表。
- 文件目录按需展开，不会一次读取整棵目录树。
- 中栏使用 CodeMirror 编辑 UTF-8 文本，支持未保存状态、保存/还原、会话间草稿保留、版本冲突保护、原子保存和 `Ctrl/Cmd + S`。
- Markdown 文件首次打开默认显示 DSH 官方 Markdown 渲染结果，可在“预览 / 源码”之间切换。
- 中右栏直接使用 DSH AppFrame 原生列宽和拖拽处理；分隔线与左中栏保持相同的无装饰热区，宽度遵循官方 300–520px 约束与 360px 默认值。
- Git 左栏按 VS Code 的源码管理习惯分成“更改 / 历史”标签；更改页区分“已暂存”和“工作区”，每个文件显示名称、目录、状态和对应操作。
- 历史提交可逐条展开文件列表；点击工作区、暂存区或历史中的文件时，中栏只打开该文件的差异，不会把整次提交的所有文件拼在一起。
- 中栏使用 CodeMirror MergeView 渲染只读 Diff，默认左右对照，包含行号、红绿变更块、未修改区域折叠和增删统计；可手动切换行内模式，窄列下会自动采用行内模式。
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
- 路径越界、路径遍历和符号链接会被拒绝；文件编辑器只读取文本，Git Diff 对二进制文件仅显示类型提示，不传输原始字节。
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
- 窄窗口触发 DSH AppFrame 官方让步规则时，会暂时收起文件编辑列并将对话恢复到中栏；窗口变宽后自动恢复三栏。

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
- `src/git-backend.ts`：Git 状态、提交文件清单、单文件前后版本、暂存和提交。
- `src/client/controller.ts`：跨栏文件、Diff 和视图状态。
- `src/client/session-layout.ts`：会话与 AppFrame 原生详情列状态绑定。
- `src/client/FileTree.tsx`、`GitPanel.tsx`：左栏文件树，以及带更改分组和可展开历史的源码管理面板。
- `src/client/WorkbenchEditor.tsx`：中栏源码编辑、Markdown 预览和 Diff 入口。
- `src/client/GitDiffEditor.tsx`、`DiffSurface.tsx`：单文件 Diff 工具栏、自适应布局和 CodeMirror 差异渲染。
- `src/client/layout-styles.ts`：官方 AppFrame 列顺序与原生分隔线视觉适配。
