# DSH Workbench Layout

[中文](README.zh.md) | English

An independent DeepSeek Harness Web plugin that keeps the official AppFrame and conversation component while arranging the page as a workspace workbench: navigation on the left, files and terminals in the middle, and native conversation on the right.

## Features

- Switch the left column among Sessions, Files, Git, and Terminal from a compact control at the top of the official sidebar. Sessions releases the region back to the native DSH workspace browser. The redundant wide New Session bar is removed while DSH's wordmark shortcut and collapsed-rail action remain available.
- Expand directories lazily instead of reading the full tree at once.
- Use a compact 38px header and a unified editor-tab model: regular files, working-tree diffs, staged diffs, and commit diffs can be opened, switched, and closed together like VS Code. When tabs overflow, the mouse wheel over the strip scrolls them horizontally and releases normal page scrolling at either boundary. Every file tab retains its own draft, dirty state, Markdown mode, and save error. The middle column has no persistent Save button: `Ctrl/Cmd + S` saves only the active regular file tab with version-conflict protection and an atomic write. Its icon control shares the official Settings row at the sidebar's lower-right instead of reserving another footer row; collapsing releases the track to the native conversation, while selecting any file, Diff, terminal, or existing terminal tab reveals it again.
- Bind files, editor selection, drafts, diffs, and Git state to DSH's official Workspace id. Switching conversations inside one Workspace preserves the workbench; changing Workspace switches the entire workbench state. With no current Session, before a Session has any messages, or while a Session is not yet accounted to a Workspace, the workbench uses DSH's official recent Workspace so files and Git remain available.
- Open Markdown in the official DSH rendered view by default, with Preview and Source modes.
- Prefer DSH AppFrame's native track sizing and drag handling between the editor and conversation. While AppFrame intentionally hides its details track for an empty-Session Hero, supply the same 300–520px range, 360px default, 640px center concession, and undecorated drag hit area. The temporary grid mirrors AppFrame's live sidebar rail, expanded width, and drag updates, then hands control back after the first message.
- Follow the VS Code source-control model with Changes and Graph tabs. Changes separates staged files from the working tree and switches between a flat list and a collapsible directory tree.
- Build the Graph from every local and remote branch in topological order, drawing color-segmented commit lanes, forks, joins, and merge commits. Regular commits, reference boundaries, and merges use solid dots, hollow rings, and double-ring nodes respectively. Each row reserves only the width required by its currently visible lanes, keeping single-lane commits compact; content follows subject, author, then local/remote/tag reference order. Hover for the short hash, timestamp, and real file/insertion/deletion totals, then select the row to expand its changed files in place.
- Selecting a working-tree, staged, or Graph file opens that single Diff as a normal editor tab. The same Diff is deduplicated while different files and revisions can remain open together; an entire commit is never concatenated into one surface.
- Browse and switch local or remote branches, see upstream incoming/outgoing counts, and explicitly Fetch, fast-forward Pull, Push, publish the current branch, or Sync by pulling then pushing.
- Render read-only diffs with CodeMirror MergeView: side-by-side by default, with line numbers, red/green change blocks, collapsed unchanged regions, and change counts. Inline mode is selectable and becomes automatic in a narrow editor column. Regular files and both Diff sides wrap long lines by default.
- Run real interactive Workspace terminals with xterm.js and a host PTY. Multiple terminals share the normal editor tab strip, retain ANSI colors and interactive key handling while another file is selected, resize with the middle column, and start in the selected Workspace root. Closing a terminal tab, switching Workspace, losing its socket, or stopping the plugin terminates the PTY.
- Stage, unstage, and commit through explicit actions; a successful commit refreshes the Graph immediately.
- Keep the original DSH conversation, composer, task status, and interaction flows in the right column, using the same official theme surface as the left sidebar while the workbench is expanded. Only the native conversation root receives that relocated-column background; the official input card and all of its children remain untouched. Collapsing the middle editor releases both the column reorder and theme override, returning conversation to its official center layout and colors. At narrow widths, failure codes move below their full-width message while the composer toolbar remains one row by tightening gaps, hiding the reasoning-effort text and only the permission/model selector chevrons, and ellipsizing the model name. The model selector remains content-sized after the effort label disappears instead of consuming the toolbar's free space. The official Session-log capsule becomes a single accessible download icon only at that narrow width. The official model menu keeps its React ownership but uses viewport-fixed geometry while open, so the middle column cannot clip it.
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
- Terminal upgrades pass the same DSH-compatible Host, Origin, and cross-site fence. The browser can select only an official Workspace id and terminal dimensions; it cannot provide a process path, shell executable, command, or working directory. Input frames and terminal counts are bounded, and output backpressure pauses the PTY instead of accumulating memory without limit.
- A terminal grants shell access to the machine running DSH. Anyone allowed to reach the trusted DSH Web origin can use that shell, so expose the Web service only on a network and host you trust.

## Limitations

- This version edits existing UTF-8 text files; it does not create, delete, or rename files.
- Symbolic links are not opened from the tree.
- Open tabs and their drafts live only in the current page; refreshing discards unsaved content.
- Binary changes are identified by Git without rendering binary content.
- The Graph currently shows the latest 40 commits without pagination. Lanes whose parents are outside the loaded window continue through the bottom instead of appearing to terminate.
- Remote operations use Git credentials already configured on the system. The plugin does not collect or store remote usernames, passwords, or tokens.
- Existing branches can be switched; branch creation, renaming, and deletion are not exposed yet.
- Terminal processes are page-live rather than persistent: reloading, disconnecting, switching Workspace, or closing a tab ends them. The default composition allows at most eight simultaneous terminal connections.
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
- `src/client/controller.ts`: per-Workspace unified file/Diff tabs, global middle-editor visibility, concurrent asynchronous loading, drafts, and view state.
- `src/client/EditorTabs.tsx`: DSH-styled file and Diff tabs with wheel-to-horizontal scrolling, boundary release, dirty state, and close affordances.
- `src/client/SourceControlIcon.tsx`: source-control entry glyph following DSH sizing and color conventions.
- `src/client/workspace-binding.ts`: official Session membership resolution with the official recent-Workspace fallback for no-Session surfaces.
- `src/client/workspace-layout.ts`: Workspace binding to AppFrame's native details-track state.
- `src/client/sidebar-top-layout.ts`: stable, Tooltip-safe Portal host for the top mode switch and expanded New Session presentation.
- `src/client/sidebar-footer-layout.ts`: stable Settings/footer-seat annotation for the shared lower row without moving React-owned nodes.
- `src/terminal-protocol.ts`, `terminal-backend.ts`, `terminal-websocket.ts`: bounded terminal protocol, Workspace-root PTY lifecycle, and trusted WebSocket bridge.
- `src/client/fallback-details-layout.ts`: visibility-aware temporary empty-Session Hero track with AppFrame-matching geometry.
- `src/client/FileTree.tsx`, `GitPanel.tsx`: left-column file tree and source-control state orchestration.
- `src/client/GitChangesView.tsx`, `git-tree.ts`: change groups, list/tree layouts, and per-file actions.
- `src/client/GitGraphView.tsx`, `GitReferenceBadge.tsx`, `git-graph.ts`: commit graph rendering, color-segmented lanes, reference badges, fork/join edges, and in-place commit details.
- `src/client/GitRepositoryToolbar.tsx`: branch picker and remote action menus.
- `src/client/WorkbenchEditor.tsx`: unified middle-column tab container, source editor, and Markdown preview.
- `src/client/TerminalPanel.tsx`, `TerminalSurface.tsx`, `TerminalIcon.tsx`: terminal instance list, xterm.js editor tab, and DSH-style terminal entry glyph.
- `src/client/GitDiffEditor.tsx`, `DiffSurface.tsx`, `git-diff-labels.ts`: in-tab per-file Diff toolbar, adaptive layout, shared kind labels, wrapping, and CodeMirror diff renderer.
- `src/client/layout-styles.ts`: official AppFrame column-order and native-divider presentation adaptation.
- `src/client/conversation-layout.ts`: narrow native-conversation state, responsive Session-log action marker, and clipping-safe model-menu geometry.
