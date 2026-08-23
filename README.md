# DSH Workbench Layout

[中文](README.zh.md) | English

An independent DeepSeek Harness Web plugin that keeps the official AppFrame and conversation component while arranging the page as a workspace workbench: navigation on the left, files and terminals in the middle, and native conversation on the right.

## Features

- Switch the left column among Sessions, Files, Git, and Terminal from a compact control at the top of the official sidebar. The collapsed switch follows DSH's native circular targets and vertical rhythm, while the expanded switch keeps compact text labels. Sessions uses DSH's list-bubble glyph instead of duplicating the native New Session icon, and releases the region back to the native DSH workspace browser. The redundant wide New Session bar is removed; its native behavior remains available only in collapsed Sessions mode, with state synchronized before paint and its surface normalized to the same circle. Other modes collapse and hide that native control without removing it from rendering, so returning to Sessions does not replay the horizontal entrance reserved for a real sidebar collapse.
- Change the collapsed rail's middle actions with its mode: Files exposes only New File and New Folder; Git exposes only Changes/Graph, leaving refresh and synchronization in the expanded panel; Terminal exposes New Terminal and existing terminal selection. Collapsed active items use DSH's active surface and info-blue ink; the file tree and creation actions use an unambiguous rounded folded-document glyph, while folder bodies and overlaid plus signs reuse official DSH icons. Creation actions expand the sidebar first, then reach the file panel through a one-shot command so they cannot execute twice.
- Expand directories lazily instead of reading the full tree at once. The header shows the real project path from DSH's official Workspace projection, truncating it on one line while retaining the full value in the native hover title. Paired outlined File-plus and Folder-plus actions use compact ring-free plus marks and open an inline name field inside the selected directory; selecting a file targets its parent, and a newly created file opens as an editor tab immediately. Right-click a file, folder, or blank tree area—or use the keyboard context-menu key—to open a DSH-native menu. Files can be opened, renamed, deleted, and have their relative or absolute path copied; folders add child creation and expand/collapse actions; blank space offers root creation and refresh.
- Use a compact 38px header and a unified editor-tab model: regular files, working-tree diffs, staged diffs, and commit diffs can be opened, switched, and closed together like VS Code. When tabs overflow, the mouse wheel over the strip scrolls them horizontally and releases normal page scrolling at either boundary. Every file tab retains its own draft, dirty state, Markdown mode, and save error. The middle column has no persistent Save button: `Ctrl/Cmd + S` saves only the active regular file tab with version-conflict protection and an atomic write. The sidebar footer is an independent two-column tool row: official Settings stays content-sized on the left, while the middle-editor icon remains a separate right-aligned action whose tooltip resets when its state changes. Collapse and expand interpolate registered editor/conversation length tracks with AppFrame's official 0.3-second easing, then atomically return track ownership with native transition disabled for that single handoff; selecting any file, Diff, terminal, or existing terminal tab reveals the editor again.
- Bind files, editor selection, drafts, diffs, and Git state to DSH's official Workspace id. Switching conversations inside one Workspace preserves the workbench; changing Workspace switches the entire workbench state. With no current Session, before a Session has any messages, or while a Session is not yet accounted to a Workspace, the workbench uses DSH's official recent Workspace so files and Git remain available.
- Open Markdown in the official DSH rendered view by default, with Preview and Source modes.
- Prefer DSH AppFrame's native track sizing and drag handling between the editor and conversation. While AppFrame intentionally hides its details track for an empty-Session Hero, supply the same 300–520px range, 360px default, 640px center concession, and undecorated drag hit area. The temporary grid mirrors AppFrame's live sidebar rail, expanded width, and drag updates, then hands control back after the first message.
- Use a dedicated two-lane commit-graph toolbar icon, distinct from the three-node source-control glyph, to switch directly between Changes and Commit Graph. Its neighboring File Layout menu controls list/tree arrangement in either main view: Changes separates staged files from the working tree, while an expanded commit can arrange its files with the same choices. Each main view preserves its own layout choice.
- Build the Graph from every local and remote branch in topological order, drawing color-segmented commit lanes, forks, joins, and merge commits. Regular commits, reference boundaries, and merges use solid dots, hollow rings, and double-ring nodes respectively. Each row reserves only the width required by its currently visible lanes, keeping single-lane commits compact; content follows subject, author, then local/remote/tag reference order. Hover for the short hash, timestamp, and real file/insertion/deletion totals, then select the row to expand its changed files in place. Right-click a row or use its accessible ellipsis menu to copy the full hash, create a branch from that commit, Cherry-pick, Revert, or compare the commit with the current workspace; comparison files still open as individual Diff tabs.
- Selecting a working-tree, staged, or Graph file opens that single Diff as a normal editor tab. The same Diff is deduplicated while different files and revisions can remain open together; an entire commit is never concatenated into one surface.
- Browse and switch local or remote branches; create a branch from the current commit or a selected ref; rename the current branch; and safely delete merged, non-current local branches. The toolbar also shows upstream incoming/outgoing counts, manages named remotes with separate fetch/push URLs, and exposes both convenient upstream actions and explicit remote/branch Fetch, fast-forward Pull, and Push targets.
- Render read-only diffs with CodeMirror MergeView: side-by-side by default, with line numbers, red/green change blocks, collapsed unchanged regions, and change counts. Inline mode is selectable and becomes automatic in a narrow editor column. Regular files and both Diff sides wrap long lines by default.
- Run real interactive Workspace terminals with xterm.js and a host PTY. Multiple terminals share the normal editor tab strip, retain ANSI colors and interactive key handling while another file is selected, resize with the middle column, and start in the selected Workspace root. During a middle-column visibility transition, xterm keeps its current grid instead of reflowing on every animation frame. A collapsed editor never fits against its clipped padding box; expanding performs one fit only after the final usable width is stable. Closing a terminal tab, switching Workspace, losing its socket, or stopping the plugin terminates the PTY.
- Stage or unstage one file or all changes, and commit through explicit actions; a successful commit refreshes the Graph immediately. Worktree changes can be discarded per file or in one batch behind DSH's acknowledged risk confirmation, while staged content remains intact.
- Show compact neutral feedback below the Git toolbar after branch switches, commits, and remote operations, using DSH's native notice surface and high-contrast label instead of a saturated green fill.
- Keep the original DSH conversation, composer, task status, and interaction flows in the right column. While the workbench is expanded, the plugin marks the actual native conversation root inside the official `conversation` slot wrapper and gives it the same official theme surface as the left sidebar; the official input card and all of its children remain untouched. Collapsing the middle editor releases both the column reorder and theme override, returning conversation to its official center layout and colors. At narrow widths, failure codes move below their full-width message, and the assistant footer's clock, run time, first-token latency, and throughput move below the action icons onto a full-width wrapping line instead of being clipped. The composer toolbar remains one row by tightening gaps, hiding the reasoning-effort text and only the permission/model selector chevrons, and ellipsizing the model name. Once those chevrons are hidden, permission and model controls use equal inline padding; the model selector remains content-sized instead of consuming the toolbar's free space. The official Session-log capsule becomes a single accessible download icon only at that narrow width. The official model menu keeps its React ownership but uses viewport-fixed geometry while open, so the middle column cannot clip it.
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
- Saves use DSH filesystem version tokens and a `workspace-write` policy, while new files use atomic `createIfAbsent` writes so an existing entry is never overwritten. New folders create exactly one level below a validated Workspace parent instead of recursively inventing missing paths.
- Rename and delete resolve the existing source and destination under the registered Workspace before invoking host filesystem primitives. Rename never intentionally replaces an observed sibling; the Workspace root and Git metadata are protected. Recursive folder deletion requires an acknowledged DSH risk confirmation, and rename/delete are blocked while an affected open file has unsaved content.
- An absolute host path is returned only after the user explicitly chooses Copy Absolute Path. Routine tree requests continue to send and receive Workspace-relative paths, and operation logs record relative paths rather than host paths.
- Git uses fixed argv without a shell. A commit runs only after an explicit Commit action. Cherry-pick and Revert require a clean Git worktree, show a confirmation, and automatically abort if Git reports a conflict. Discard actions are limited to the working tree, require confirmation, preserve the index, and state explicitly that untracked content is deleted.
- Branch and remote commands run only after explicit UI actions and disable terminal credential prompts. Branch deletion uses Git's safe merged-branch check; remote removal requires an acknowledged confirmation; Pull and Sync are fast-forward only and never auto-merge, stash, or overwrite changes.
- Git requires the selected Workspace to be the repository root, avoiding commits that include staged content outside the workspace.
- The API follows DSH's trusted-host, same-origin, and cross-site request checks, accepts JSON POST only, and bounds file, directory, and Git output sizes.
- Terminal upgrades pass the same DSH-compatible Host, Origin, and cross-site fence. The browser can select only an official Workspace id and terminal dimensions; it cannot provide a process path, shell executable, command, or working directory. Input frames and terminal counts are bounded, and output backpressure pauses the PTY instead of accumulating memory without limit.
- A terminal grants shell access to the machine running DSH. Anyone allowed to reach the trusted DSH Web origin can use that shell, so expose the Web service only on a network and host you trust.

## Limitations

- File and folder deletion is permanent and has no in-plugin recycle bin or undo; folders therefore require an explicit acknowledged confirmation.
- The file tree follows an opened file until a tree item is selected. Clicking blank tree space clears the concrete item selection and returns subsequent creation actions to the current Workspace root without closing the middle tab.
- Symbolic links are not opened from the tree.
- Open tabs and their drafts live only in the current page; refreshing discards unsaved content.
- Binary changes are identified by Git without rendering binary content.
- The Graph currently shows the latest 40 commits without pagination. Lanes whose parents are outside the loaded window continue through the bottom instead of appearing to terminate.
- Remote operations use Git credentials already configured on the system. The plugin does not collect or store remote usernames, passwords, or tokens.
- Terminal processes are page-live rather than persistent: reloading, disconnecting, switching Workspace, or closing a tab ends them. The default composition allows at most eight simultaneous terminal connections.
- DSH does not yet expose a dedicated API for moving the native conversation column. The plugin therefore reorders columns through stable markers on the official AppFrame and may need an update after a future shell rewrite.
- When a narrow window triggers AppFrame's native concession rule, the file editor temporarily closes and the conversation returns to the middle. The three-column layout returns automatically after widening.

## Development

The public npm package pins its `repository` metadata to this canonical repository so plugin catalogs and installers can verify package ownership against the source.

```sh
npm run typecheck
npm test
npm run build
npm run test:bundle
```

## Structure

- `src/index.ts`: Host route registration and request dispatch.
- `src/workspace-backend.ts`: bounded directory, read, atomic-save, creation, rename, delete, and explicit absolute-path operations.
- `src/git-backend.ts`: Git status, all-branch commit topology, remote synchronization/configuration, commit/workspace comparisons, per-file before/after content, index, and explicit commit operations.
- `src/client/controller.ts`: per-Workspace unified file/Diff tabs and Git presentation, global middle-editor visibility, one-shot collapsed-rail commands, concurrent asynchronous loading, and drafts.
- `src/client/EditorTabs.tsx`: DSH-styled file and Diff tabs with wheel-to-horizontal scrolling, boundary release, dirty state, and close affordances.
- `src/client/SourceControlIcon.tsx`: source-control entry glyph following DSH sizing and color conventions.
- `src/client/CreateEntryIcons.tsx`, `CommitGraphIcon.tsx`: DSH-sized outlined new-entry and commit-graph glyphs.
- `src/client/WorkbenchRail.tsx`: mode-specific collapsed actions using the official sidebar rail geometry.
- `src/client/workspace-binding.ts`: official Session membership resolution with the official recent-Workspace fallback for no-Session surfaces.
- `src/client/workspace-layout.ts`: Workspace binding to AppFrame's native details-track state.
- `src/client/sidebar-top-layout.ts`: stable, Tooltip-safe Portal host for the top mode switch and expanded New Session presentation.
- `src/client/sidebar-footer-layout.ts`: stable Settings/footer-seat annotation for an independent lower tool row without moving React-owned nodes.
- `src/client/editor-layout-contract.ts`, `editor-track-transition.ts`: shared visibility/terminal DOM contract plus registered editor/conversation length-track coordination using AppFrame's official timing and an atomic native-layout handoff.
- `src/terminal-protocol.ts`, `terminal-backend.ts`, `terminal-websocket.ts`: bounded terminal protocol, Workspace-root PTY lifecycle, and trusted WebSocket bridge.
- `src/client/fallback-details-layout.ts`: visibility-aware temporary empty-Session Hero track with AppFrame-matching geometry.
- `src/client/FileTree.tsx`, `FileTreeLevel.tsx`, `FileTreeCreateRow.tsx`: lazy tree orchestration, recursive rows, and inline creation.
- `src/client/FileTreeContextMenu.tsx`, `FileTreeDialogs.tsx`, `use-file-tree-mutations.ts`: native context actions, confirmations, and dirty-safe rename/delete state.
- `src/client/clipboard.ts`: shared Clipboard API helper used by file paths and commit hashes.
- `src/client/GitPanel.tsx`: source-control state orchestration.
- `src/client/GitChangesView.tsx`, `GitCommitFilesView.tsx`, `git-tree.ts`: separate change/commit-file list and tree views over one shared path-tree builder.
- `src/client/GitGraphView.tsx`, `GitReferenceBadge.tsx`, `git-graph.ts`: commit graph rendering, color-segmented lanes, reference badges, fork/join edges, and in-place commit details.
- `src/client/GitRepositoryToolbar.tsx`: dedicated main-view toggle, file layout, branch picker, and remote action controls.
- `src/client/GitBranchDialog.tsx`: DSH-native create, create-from, rename, and safe-delete branch dialogs.
- `src/client/GitRemoteDialog.tsx`: remote configuration and explicit remote/branch operation dialogs with destructive confirmation.
- `src/client/GitCommitActionDialog.tsx`: confirmation surface for Graph Cherry-pick and Revert actions.
- `src/client/WorkbenchEditor.tsx`: unified middle-column tab container, source editor, and Markdown preview.
- `src/client/TerminalPanel.tsx`, `TerminalSurface.tsx`, `TerminalIcon.tsx`: terminal instance list, xterm.js editor tab, and DSH-style terminal entry glyph.
- `src/client/GitDiffEditor.tsx`, `DiffSurface.tsx`, `git-diff-labels.ts`: in-tab per-file Diff toolbar, adaptive layout, shared kind labels, wrapping, and CodeMirror diff renderer.
- `src/client/layout-styles.ts`: official AppFrame column-order and native-divider presentation adaptation.
- `src/client/conversation-layout.ts`: narrow native-conversation state, responsive Session-log action marker, and clipping-safe model-menu geometry.
