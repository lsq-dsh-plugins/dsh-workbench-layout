# DSH Workbench Layout

[中文](README.zh.md) | English

An independent DeepSeek Harness Web plugin that keeps the official AppFrame and conversation component while arranging the page as a file workbench: navigation on the left, files in the middle, and native conversation on the right.

## Features

- Switch the left column among Sessions, Files, and Git. Sessions releases the region back to the native DSH workspace browser.
- Expand directories lazily instead of reading the full tree at once.
- Edit existing UTF-8 text through a compact 38px header, multi-file tabs, and CodeMirror. When tabs overflow, the mouse wheel over the strip scrolls them horizontally and releases normal page scrolling at either boundary. Every tab retains its own draft, dirty state, Markdown mode, and save error while file switches preserve edits. The middle column has no persistent Save button: `Ctrl/Cmd + S` saves the active tab with version-conflict protection and an atomic write.
- Bind files, editor selection, drafts, diffs, and Git state to DSH's official Workspace id. Switching conversations inside one Workspace preserves the workbench; changing Workspace switches the entire workbench state. With no current Session, before a Session has any messages, or while a Session is not yet accounted to a Workspace, the workbench uses DSH's official recent Workspace so files and Git remain available.
- Open Markdown in the official DSH rendered view by default, with Preview and Source modes.
- Prefer DSH AppFrame's native track sizing and drag handling between the editor and conversation. While AppFrame intentionally hides its details track for an empty-Session Hero, supply the same 300–520px range, 360px default, 640px center concession, and undecorated drag hit area; hand control back to AppFrame after the first message.
- Follow the VS Code source-control model with Changes and Graph tabs. Changes separates staged files from the working tree and switches between a flat list and a collapsible directory tree.
- Build the Graph from every local and remote branch in topological order, drawing color-segmented commit lanes, forks, joins, and merge commits. Regular commits, reference boundaries, and merges use solid dots, hollow rings, and double-ring nodes respectively. Each row stays compact in subject, author, then local/remote/tag reference order; hover for the full hash and timestamp, then select the row to expand its changed files in place.
- Selecting a working-tree, staged, or Graph file opens only that file in the middle column instead of concatenating an entire commit.
- Browse and switch local or remote branches, see upstream incoming/outgoing counts, and explicitly Fetch, fast-forward Pull, Push, publish the current branch, or Sync by pulling then pushing.
- Render read-only diffs with CodeMirror MergeView: side-by-side by default, with line numbers, red/green change blocks, collapsed unchanged regions, and change counts. Inline mode is selectable and becomes automatic in a narrow editor column.
- Stage, unstage, and commit through explicit actions; a successful commit refreshes the Graph immediately.
- Keep the original DSH conversation, composer, task status, and interaction flows in the right column.
- Reuse DSH components, icons, typography, tokens, spacing, borders, and light/dark themes wherever possible. The Git module entry and branch picker consistently use the three-node source-control glyph.

## Install

```sh
dsh plugin --profile web add @lsq64737/dsh-workbench-layout
```

Remove it with:

```sh
dsh plugin --profile web remove @lsq64737/dsh-workbench-layout
```

## Security

- The browser sends only an official DSH Workspace id and workspace-relative paths. The Host resolves that id through DSH's Workspace registry instead of trusting a browser path or deriving identity from a conversation.
- Traversal, workspace escape, and symbolic links are rejected. The file editor reads text only; Git diff reports binary files without transferring their raw bytes.
- Saves use DSH filesystem version tokens and a `workspace-write` policy, so external edits are not silently overwritten.
- Git uses fixed argv without a shell. A commit runs only after an explicit Commit action.
- Branch and remote commands run only after explicit UI actions and disable terminal credential prompts. Pull and Sync are fast-forward only and never auto-merge, stash, or overwrite changes.
- Git requires the selected Workspace to be the repository root, avoiding commits that include staged content outside the workspace.
- The API follows DSH's trusted-host, same-origin, and cross-site request checks, accepts JSON POST only, and bounds file, directory, and Git output sizes.

## Limitations

- This version edits existing UTF-8 text files; it does not create, delete, or rename files.
- Symbolic links are not opened from the tree.
- Open tabs and their drafts live only in the current page; refreshing discards unsaved content.
- Binary changes are identified by Git without rendering binary content.
- The Graph currently shows the latest 40 commits without pagination. Lanes whose parents are outside the loaded window continue through the bottom instead of appearing to terminate.
- Remote operations use Git credentials already configured on the system. The plugin does not collect or store remote usernames, passwords, or tokens.
- Existing branches can be switched; branch creation, renaming, and deletion are not exposed yet.
- DSH does not yet expose a dedicated API for moving the native conversation column. The plugin therefore reorders columns through stable markers on the official AppFrame and may need an update after a future shell rewrite.
- When a narrow window triggers AppFrame's native concession rule, the file editor temporarily closes and the conversation returns to the middle. The three-column layout returns automatically after widening.

## Development

```sh
npm run typecheck
npm test
npm run build
npm run test:bundle
```

## Structure

- `src/index.ts`: Host route registration and request dispatch.
- `src/workspace-backend.ts`: bounded directory, read, and atomic-save operations.
- `src/git-backend.ts`: Git status, all-branch commit topology, remote synchronization, commit file lists, per-file before/after content, index, and commit operations.
- `src/client/controller.ts`: per-Workspace multi-file tabs, asynchronous reads and saves, diffs, and view state.
- `src/client/EditorTabs.tsx`: DSH-styled file tabs with wheel-to-horizontal scrolling, boundary release, dirty state, and close affordances.
- `src/client/SourceControlIcon.tsx`: source-control entry glyph following DSH sizing and color conventions.
- `src/client/workspace-binding.ts`: official Session membership resolution with the official recent-Workspace fallback for no-Session surfaces.
- `src/client/workspace-layout.ts`: Workspace binding to AppFrame's native details-track state.
- `src/client/fallback-details-layout.ts`: temporary empty-Session Hero track with AppFrame-matching geometry.
- `src/client/FileTree.tsx`, `GitPanel.tsx`: left-column file tree and source-control state orchestration.
- `src/client/GitChangesView.tsx`, `git-tree.ts`: change groups, list/tree layouts, and per-file actions.
- `src/client/GitGraphView.tsx`, `GitReferenceBadge.tsx`, `git-graph.ts`: commit graph rendering, color-segmented lanes, reference badges, fork/join edges, and in-place commit details.
- `src/client/GitRepositoryToolbar.tsx`: branch picker and remote action menus.
- `src/client/WorkbenchEditor.tsx`: middle source editor, Markdown preview, and diff entry point.
- `src/client/GitDiffEditor.tsx`, `DiffSurface.tsx`: per-file diff toolbar, adaptive layout, and CodeMirror diff renderer.
- `src/client/layout-styles.ts`: official AppFrame column-order and native-divider presentation adaptation.
