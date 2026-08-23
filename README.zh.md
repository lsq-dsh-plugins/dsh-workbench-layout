# DSH 工作台布局

[English](README.md) | 中文

一个独立的 DeepSeek Harness Web 插件，在不替换官方 AppFrame 和会话组件的前提下，将页面组织成文件工作台：左侧导航、中间文件区、右侧原生对话。

## 功能

- 左栏通过“会话 / 文件 / Git”切换；“会话”会恢复 DSH 原生工作区与会话列表。
- 文件目录按需展开，不会一次读取整棵目录树。
- 中栏使用 CodeMirror 编辑 UTF-8 文本，支持未保存状态、保存/还原、按工作区保留草稿、版本冲突保护、原子保存和 `Ctrl/Cmd + S`。
- 文件、编辑器选择、草稿、Diff 与 Git 状态绑定到 DSH 官方工作区 id；在同一工作区的不同会话之间切换会保留工作台，只有切换工作区才会切换整套状态。没有当前会话、会话尚未产生消息或会话暂未归属工作区时，工作台使用 DSH 官方最近工作区，因此仍可浏览文件与 Git。
- Markdown 文件首次打开默认显示 DSH 官方 Markdown 渲染结果，可在“预览 / 源码”之间切换。
- 中右栏直接使用 DSH AppFrame 原生列宽和拖拽处理；分隔线与左中栏保持相同的无装饰热区，宽度遵循官方 300–520px 约束与 360px 默认值。
- Git 左栏按 VS Code 的源码管理习惯分成“更改 / 历史”标签；更改页区分“已暂存”和“工作区”，并可在扁平列表与可折叠目录树之间切换。
- 历史提交默认保持单行，只显示分支/标签标志、提交说明和作者；悬浮显示完整哈希与时间，点击整行后在原位置展开该提交的文件。
- 点击工作区、暂存区或历史中的文件时，中栏只打开该文件的差异，不会把整次提交的所有文件拼在一起。
- 仓库工具栏支持查看和切换本地/远程分支，并显示上游分支的拉取/推送计数；提供 Fetch、快进 Pull、Push、发布当前分支和先拉后推的 Sync。
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

- 浏览器只能提交 DSH 官方工作区 id 和工作区相对路径；宿主端通过 DSH 工作区注册表解析该 id，不信任浏览器路径，也不再从会话反推工作区身份。
- 路径越界、路径遍历和符号链接会被拒绝；文件编辑器只读取文本，Git Diff 对二进制文件仅显示类型提示，不传输原始字节。
- 保存使用 DSH 文件系统的版本令牌和 `workspace-write` 策略；文件被其他程序修改后不会静默覆盖。
- Git 使用固定参数直接调用可执行文件，不通过 shell；提交只会由明确点击“提交”触发。
- 分支切换和远程操作只由显式按钮触发，并禁用终端凭据提示；Pull/Sync 使用快进模式，失败时不会自动合并、暂存或覆盖更改。
- Git 功能要求所选工作区就是仓库根目录，避免提交工作区之外已暂存的内容。
- API 复用 DSH 的可信主机、同源与跨站请求校验语义，只接受 JSON POST，并限制文件、目录与 Git 输出大小。

## 已知限制

- 当前版本编辑已有 UTF-8 文本文件，不创建、删除或重命名文件。
- 符号链接不会在文件树中打开。
- 工作区草稿只保留在当前页面内，刷新页面会丢失未保存内容。
- 二进制文件由 Git 标记为二进制差异，不展示二进制内容。
- 提交历史当前显示最近 40 条，不包含分页加载。
- 远程操作依赖系统中已经配置好的 Git 凭据；插件不收集或保存远程账号、密码和令牌。
- 当前支持切换已有分支，不在界面中创建、重命名或删除分支。
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
- `src/git-backend.ts`：Git 状态、分支、远程同步、提交文件清单、单文件前后版本、暂存和提交。
- `src/client/controller.ts`：跨栏文件、Diff 和视图状态。
- `src/client/workspace-binding.ts`：优先按 DSH 官方成员关系解析会话所属工作区，并在无会话状态下回退到官方最近工作区。
- `src/client/workspace-layout.ts`：工作区与 AppFrame 原生详情列状态绑定。
- `src/client/FileTree.tsx`、`GitPanel.tsx`：左栏文件树和源码管理状态编排。
- `src/client/GitChangesView.tsx`、`git-tree.ts`：更改分组、列表/目录树和文件操作。
- `src/client/GitHistoryView.tsx`、`GitRepositoryToolbar.tsx`：紧凑历史、提交详情、分支和远程操作菜单。
- `src/client/WorkbenchEditor.tsx`：中栏源码编辑、Markdown 预览和 Diff 入口。
- `src/client/GitDiffEditor.tsx`、`DiffSurface.tsx`：单文件 Diff 工具栏、自适应布局和 CodeMirror 差异渲染。
- `src/client/layout-styles.ts`：官方 AppFrame 列顺序与原生分隔线视觉适配。
