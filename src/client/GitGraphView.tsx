import { useState } from 'react'
import type { CSSProperties } from 'react'
import {
  IconCodeOutline16,
  IconCopyOutline16,
  IconEllipsisOutline16,
  IconPlusOutline16,
  IconRefreshOutline16,
  Menu,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitCommit, GitCommitFiles, GitGraph } from '../contracts.ts'
import { GitCommitFilesView } from './GitCommitFilesView.tsx'
import { buildGitGraph, type GitGraphEdge, type GitGraphRow } from './git-graph.ts'
import type { GitFileLayout } from './git-tree.ts'
import { GitReferenceBadge } from './GitReferenceBadge.tsx'
import css from './Workbench.module.css'

const GRAPH_ROW_HEIGHT = 28
const GRAPH_NODE_Y = GRAPH_ROW_HEIGHT / 2
const GRAPH_LANE_GAP = 13
const GRAPH_INLINE_PADDING = 8
const GRAPH_COLORS = [
  'var(--git-graph-color-0)',
  'var(--git-graph-color-1)',
  'var(--git-graph-color-2)',
  'var(--git-graph-color-3)',
  'var(--git-graph-color-4)',
  'var(--git-graph-color-5)',
] as const

export type CommitFilesState =
  | { state: 'loading' }
  | { state: 'ready'; value: GitCommitFiles }
  | { state: 'error'; message: string }

export type GitCommitDetailKind = 'commit' | 'comparison'
export type GitCommitMenuAction = 'copy' | 'branch' | 'cherry-pick' | 'revert' | 'compare'

interface GitGraphViewProps {
  graph: GitGraph | null
  expandedCommit: string | null
  expandedKind: GitCommitDetailKind
  commitFiles: Record<string, CommitFilesState>
  fileLayout: GitFileLayout
  selectedRevision: string | undefined
  selectedPath: string | undefined
  selectedKind: GitCommitDetailKind | undefined
  onToggle: (commit: GitCommit) => void
  onOpen: (commit: GitCommit, path: string) => void
  onMenuAction: (action: GitCommitMenuAction, commit: GitCommit) => void
  t: TranslateNS<'workbench'>
}

/** 带真实父节点拓扑的提交图；提交详情仍在当前行下方展开。 */
export function GitGraphView(props: GitGraphViewProps) {
  const layout = buildGitGraph(props.graph?.commits ?? [])
  return (
    <div className={css.gitGraph} data-git-graph="">
      {props.graph === null
        ? <div className={css.gitSectionEmpty}>{props.t('git.graphLoading')}</div>
        : layout.rows.length === 0
          ? <div className={css.gitSectionEmpty}>{props.t('git.noGraph')}</div>
          : layout.rows.map(row => (
            <CommitEntry
              key={row.commit.hash}
              row={row}
              graphWidth={graphWidthFor(row.visibleLaneCount)}
              expanded={props.expandedCommit === row.commit.hash}
              detailKind={props.expandedKind}
              files={props.commitFiles[`${props.expandedKind}:${row.commit.hash}`]}
              fileLayout={props.fileLayout}
              selectedRevision={props.selectedRevision}
              selectedPath={props.selectedPath}
              selectedKind={props.selectedKind}
              onToggle={() => { props.onToggle(row.commit) }}
              onOpen={path => { props.onOpen(row.commit, path) }}
              onMenuAction={action => { props.onMenuAction(action, row.commit) }}
              t={props.t}
            />
          ))}
      {props.graph?.truncated === true && <div className={css.gitSectionEmpty}>{props.t('git.graphTruncated')}</div>}
    </div>
  )
}

function CommitEntry(props: {
  row: GitGraphRow
  graphWidth: number
  expanded: boolean
  detailKind: GitCommitDetailKind
  files: CommitFilesState | undefined
  fileLayout: GitFileLayout
  selectedRevision: string | undefined
  selectedPath: string | undefined
  selectedKind: GitCommitDetailKind | undefined
  onToggle: () => void
  onOpen: (path: string) => void
  onMenuAction: (action: GitCommitMenuAction) => void
  t: TranslateNS<'workbench'>
}) {
  const commit = props.row.commit
  const [menuOpen, setMenuOpen] = useState(false)
  const graphStyle = { '--git-row-graph-width': `${props.graphWidth}px` } as CSSProperties
  return (
    <div
      className={css.commitEntry}
      data-expanded={props.expanded || undefined}
      data-graph-lanes={props.row.visibleLaneCount}
      style={graphStyle}
    >
      <GraphLayer row={props.row} width={props.graphWidth} />
      <div className={css.commitRowShell} onContextMenu={(event) => { event.preventDefault(); setMenuOpen(true) }}>
        <Tooltip label={() => commitTooltip(commit, props.t)} side="right" delayMs={450} maxWidth={380}>
          <button type="button" className={css.commitRow} aria-expanded={props.expanded} onClick={props.onToggle}>
            <span className={css.gitGraphSpacer} aria-hidden="true" />
            <span className={css.commitSubject} data-commit-subject="">{commit.subject}</span>
            <span className={css.commitAuthor} data-commit-author="">{commit.author}</span>
            {commit.references.length > 0 && (
              <span className={css.commitRefs}>
                {commit.references.slice(0, 2).map(reference => (
                  <GitReferenceBadge
                    key={`${reference.kind}:${reference.name}`}
                    reference={reference}
                    color={graphColor(props.row.nodeColor)}
                  />
                ))}
                {commit.references.length > 2 && <span className={css.commitRefMore}>+{commit.references.length - 2}</span>}
              </span>
            )}
          </button>
        </Tooltip>
        <Menu
          open={menuOpen}
          onClose={() => { setMenuOpen(false) }}
          items={[
            { id: 'copy', label: props.t('git.commitMenu.copy'), icon: <IconCopyOutline16 size={14} /> },
            { id: 'branch', label: props.t('git.commitMenu.branch'), icon: <IconPlusOutline16 size={14} /> },
            { type: 'separator', id: 'history-separator' },
            { id: 'cherry-pick', label: props.t('git.commitMenu.cherryPick'), icon: <IconPlusOutline16 size={14} /> },
            { id: 'revert', label: props.t('git.commitMenu.revertCommit'), icon: <IconRefreshOutline16 size={14} /> },
            { type: 'separator', id: 'compare-separator' },
            { id: 'compare', label: props.t('git.commitMenu.compare'), icon: <IconCodeOutline16 size={14} /> },
          ]}
          onSelect={(id) => {
            setMenuOpen(false)
            if (id === 'copy' || id === 'branch' || id === 'cherry-pick' || id === 'revert' || id === 'compare') props.onMenuAction(id)
          }}
          align="end"
          dense
          portal
          anchor={(
            <Tooltip label={props.t('git.commitMenu.more')} side="bottom" delayMs={450}>
              <button type="button" className={css.commitMenuButton} aria-label={props.t('git.commitMenu.more')} aria-expanded={menuOpen} onClick={() => { setMenuOpen(value => !value) }}>
                <IconEllipsisOutline16 size={14} />
              </button>
            </Tooltip>
          )}
        />
      </div>
      {props.expanded && (
        <div className={css.commitFiles}>
          {props.detailKind === 'comparison' && <div className={css.commitComparisonLabel}>{props.t('git.commitMenu.comparisonFiles')}</div>}
          {props.files === undefined || props.files.state === 'loading'
            ? <div className={css.gitSectionEmpty}>{props.t('git.commitFilesLoading')}</div>
            : props.files.state === 'error'
              ? <div className={css.error} role="alert">{props.files.message}</div>
              : props.files.value.files.length === 0
                ? <div className={css.gitSectionEmpty}>{props.t('git.noCommitFiles')}</div>
                : (
                  <GitCommitFilesView
                    files={props.files.value.files}
                    layout={props.fileLayout}
                    selectedPath={props.selectedRevision === commit.hash && props.selectedKind === props.detailKind ? props.selectedPath : undefined}
                    onOpen={props.onOpen}
                  />
                )}
        </div>
      )}
    </div>
  )
}

function GraphLayer({ row, width }: { row: GitGraphRow; width: number }) {
  const nodeX = laneX(row.lane)
  return (
    <span className={css.gitGraphLayer} style={{ width }} aria-hidden="true">
      <svg className={css.gitGraphTopology} width={width} height={GRAPH_ROW_HEIGHT} viewBox={`0 0 ${width} ${GRAPH_ROW_HEIGHT}`}>
        {row.incoming && (
          <path
            data-graph-edge="incoming"
            d={`M ${nodeX} 0 L ${nodeX} ${GRAPH_NODE_Y}`}
            stroke={graphColor(row.incomingColor)}
          />
        )}
        {row.passing.map((edge, index) => (
          <path
            key={`passing:${index}:${edge.from}:${edge.to}`}
            data-graph-edge="passing"
            d={edgePath(edge, 0)}
            stroke={graphColor(edge.color)}
          />
        ))}
        {row.outgoing.map((edge, index) => (
          <path
            key={`outgoing:${index}:${edge.from}:${edge.to}`}
            data-graph-edge="outgoing"
            d={edgePath(edge, GRAPH_NODE_Y)}
            stroke={graphColor(edge.color)}
          />
        ))}
        <GraphNode row={row} x={nodeX} />
      </svg>
      {row.continuation.map(active => (
        <span
          key={`${active.lane}:${active.hash}`}
          className={css.gitGraphContinuation}
          data-graph-continuation=""
          style={{ left: laneX(active.lane), backgroundColor: graphColor(active.color) }}
        />
      ))}
    </span>
  )
}

function GraphNode({ row, x }: { row: GitGraphRow; x: number }) {
  const color = graphColor(row.nodeColor)
  if (row.nodeKind === 'merge') {
    return (
      <g data-graph-node="" data-node-kind="merge" data-lane={row.lane}>
        <circle cx={x} cy={GRAPH_NODE_Y} r="4.5" fill="var(--git-graph-node-bg)" stroke={color} strokeWidth="1.8" />
        <circle cx={x} cy={GRAPH_NODE_Y} r="1.7" fill={color} />
      </g>
    )
  }
  if (row.nodeKind === 'reference') {
    return (
      <g data-graph-node="" data-node-kind="reference" data-lane={row.lane}>
        <circle cx={x} cy={GRAPH_NODE_Y} r="4.1" fill="var(--git-graph-node-bg)" stroke={color} strokeWidth="1.8" />
      </g>
    )
  }
  return (
    <circle
      data-graph-node=""
      data-node-kind="commit"
      data-lane={row.lane}
      cx={x}
      cy={GRAPH_NODE_Y}
      r="3.15"
      fill={color}
    />
  )
}

function edgePath(edge: GitGraphEdge, startY: number): string {
  const from = laneX(edge.from)
  const to = laneX(edge.to)
  if (from === to) return `M ${from} ${startY} L ${to} ${GRAPH_ROW_HEIGHT}`
  const distance = GRAPH_ROW_HEIGHT - startY
  return `M ${from} ${startY} C ${from} ${startY + distance * 0.42}, ${to} ${GRAPH_ROW_HEIGHT - distance * 0.42}, ${to} ${GRAPH_ROW_HEIGHT}`
}

function graphWidthFor(laneCount: number): number {
  return GRAPH_INLINE_PADDING * 2 + Math.max(0, laneCount - 1) * GRAPH_LANE_GAP
}

function laneX(lane: number): number {
  return GRAPH_INLINE_PADDING + lane * GRAPH_LANE_GAP
}

function graphColor(index: number): string {
  return GRAPH_COLORS[index % GRAPH_COLORS.length]!
}

function commitTooltip(commit: GitCommit, t: TranslateNS<'workbench'>): string {
  const references = commit.references.map(reference => reference.name).join(' · ')
  const stats = commit.stats === undefined ? '' : t('git.commitStats', {
    files: commit.stats.filesChanged,
    additions: commit.stats.additions,
    deletions: commit.stats.deletions,
  })
  return [
    commit.subject,
    `${commit.author} · ${formatCommitTime(commit.authoredAt)}`,
    commit.shortHash,
    stats,
    references,
  ].filter(line => line !== '').join('\n')
}


function formatCommitTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}
