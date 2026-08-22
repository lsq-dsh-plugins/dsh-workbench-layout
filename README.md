# DSH Workbench Layout

[中文](README.zh.md) | English

An independent DeepSeek Harness Web plugin that keeps the official AppFrame and conversation component while arranging the page as a file workbench: navigation on the left, files in the middle, and native conversation on the right.

## Features

- Switch the left column among Sessions, Files, and Git. Sessions releases the region back to the native DSH workspace browser.
- Expand directories lazily instead of reading the full tree at once.
- Edit existing UTF-8 text in CodeMirror with dirty state, save/revert, per-Session draft retention, version conflict protection, atomic saves, and `Ctrl/Cmd + S`.
- Open Markdown in the official DSH rendered view by default, with Preview and Source modes.
- Inspect Git branch and status, view diffs, stage, unstage, and commit through explicit actions.
- Keep the original DSH conversation, composer, task status, and interaction flows in the right column.
- Reuse DSH components, icons, typography, tokens, spacing, borders, and light/dark themes wherever possible.

## Install

```sh
dsh plugin --profile web add @lsq64737/dsh-workbench-layout
```

Remove it with:

```sh
dsh plugin --profile web remove @lsq64737/dsh-workbench-layout
```

## Security

- The browser sends only a Session id and workspace-relative paths. The Host resolves the authoritative workspace from the Session.
- Traversal, workspace escape, symbolic links, and non-text files are rejected.
- Saves use DSH filesystem version tokens and a `workspace-write` policy, so external edits are not silently overwritten.
- Git uses fixed argv without a shell. A commit runs only after an explicit Commit action.
- Git requires the Session workspace to be the repository root, avoiding commits that include staged content outside the workspace.
- The API follows DSH's trusted-host, same-origin, and cross-site request checks, accepts JSON POST only, and bounds file, directory, and Git output sizes.

## Limitations

- This version edits existing UTF-8 text files; it does not create, delete, or rename files.
- Symbolic links are not opened from the tree.
- Session drafts live only in the current page; refreshing discards unsaved content.
- Diffs for untracked files may be empty; their content remains available in the editor.
- DSH does not yet expose a dedicated API for moving the native conversation column. The plugin therefore reorders columns through stable markers on the official AppFrame and may need an update after a future shell rewrite.
- Very narrow windows cannot provide a comfortable width to all three columns. The middle column concedes first while the conversation remains usable.

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
- `src/git-backend.ts`: Git status, diff, index, and commit operations.
- `src/client/controller.ts`: cross-column file, diff, and view state.
- `src/client/FileTree.tsx`, `GitPanel.tsx`: left-column Files and Git views.
- `src/client/WorkbenchEditor.tsx`: middle source editor and Markdown preview.
- `src/client/layout-styles.ts`: official AppFrame column-order adaptation.
