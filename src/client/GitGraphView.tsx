import type { CSSProperties } from 'react'
import {
  IconCodeOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitCommit, GitCommitFiles, GitGraph } from '../contracts.ts'
import { buildGitGraph, type GitGraphEdge, type GitGraphRow } from './git-graph.ts'
import css from './Workbench.module.css'

const GRAPH_ROW_HEIGHT = 31
const GRAPH_NODE_Y = GRAPH_ROW_HEIGHT / 2
const GRAPH_LANE_GAP = 12
const GRAPH_INLINE_PADDING = 7
const GRAPH_COLORS = [
  'var(--dsw-alias-state-business-primary)',
  'var(--dsw-alias-state-success-primary)',
  'var(--dsw-alias-state-warn-primary)',
  'var(--dsw-alias-state-error-primary)',
  'var(--dsw-alias-brand-text)',
  'var(--dsw-alias-label-secondary)',
] as const

export type CommitFilesState =
  | { state: 'loading' }
  | { state: 'ready'; value: GitCommitFiles }
  | { state: 'error'; message: string }

interface GitGraphViewProps {
  graph: GitGraph | null
  expandedCommit: string | null
  commitFiles: Record<string, CommitFilesState>
  selectedRevision: string | undefined
  selectedPath: string | undefined
  onToggle: (commit: GitCommit) => void
  onOpen: (commit: GitCommit, path: string) => void
  t: TranslateNS<'workbench'>
}

/** 带真实父节点拓扑的提交图；提交详情仍在当前行下方展开。 */
export function GitGraphView(props: GitGraphViewProps) {
  const layout = buildGitGraph(props.graph?.commits ?? [])
  const graphWidth = graphWidthFor(layout.laneCount)
  const graphStyle = { '--git-graph-width': `${graphWidth}px` } as CSSProperties
  return (
    <div className={css.gitGraph} style={graphStyle} data-git-graph="">
      {props.graph === null
        ? <div className={css.gitSectionEmpty}>{props.t('git.graphLoading')}</div>
        : layout.rows.length === 0
          ? <div className={css.gitSectionEmpty}>{props.t('git.noGraph')}</div>
          : layout.rows.map(row => (
            <CommitEntry
              key={row.commit.hash}
              row={row}
              graphWidth={graphWidth}
              expanded={props.expandedCommit === row.commit.hash}
              files={props.commitFiles[row.commit.hash]}
              selectedRevision={props.selectedRevision}
              selectedPath={props.selectedPath}
              onToggle={() => { props.onToggle(row.commit) }}
              onOpen={path => { props.onOpen(row.commit, path) }}
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
  files: CommitFilesState | undefined
  selectedRevision: string | undefined
  selectedPath: string | undefined
  onToggle: () => void
  onOpen: (path: string) => void
  t: TranslateNS<'workbench'>
}) {
  const commit = props.row.commit
  return (
    <div className={css.commitEntry} data-expanded={props.expanded || undefined}>
      <GraphLayer row={props.row} width={props.graphWidth} />
      <Tooltip label={() => commitTooltip(commit)} side="right" delayMs={450} maxWidth={380}>
        <button type="button" className={css.commitRow} aria-expanded={props.expanded} onClick={props.onToggle}>
          <span className={css.gitGraphSpacer} aria-hidden="true" />
          {commit.references.length > 0 && (
            <span className={css.commitRefs}>
              {commit.references.slice(0, 2).map(reference => (
                <span key={`${reference.kind}:${reference.name}`} data-kind={reference.kind}>{reference.name}</span>
              ))}
              {commit.references.length > 2 && <span data-kind="more">+{commit.references.length - 2}</span>}
            </span>
          )}
          <span className={css.commitSubject}>{commit.subject}</span>
          <span className={css.commitAuthor}>{commit.author}</span>
        </button>
      </Tooltip>
      {props.expanded && (
        <div className={css.commitFiles}>
          {props.files === undefined || props.files.state === 'loading'
            ? <div className={css.gitSectionEmpty}>{props.t('git.commitFilesLoading')}</div>
            : props.files.state === 'error'
              ? <div className={css.error} role="alert">{props.files.message}</div>
              : props.files.value.files.length === 0
                ? <div className={css.gitSectionEmpty}>{props.t('git.noCommitFiles')}</div>
                : props.files.value.files.map(file => (
                  <button
                    type="button"
                    key={`${commit.hash}:${file.path}`}
                    className={css.graphFileRow}
                    data-selected={props.selectedRevision === commit.hash && props.selectedPath === file.path || undefined}
                    title={file.originalPath === undefined ? file.path : `${file.originalPath} → ${file.path}`}
                    onClick={() => { props.onOpen(file.path) }}
                  >
                    <IconCodeOutline16 size={14} />
                    <span className={css.gitFileText}>
                      <span className={css.rowName}>{fileName(file.path)}</span>
                      <span className={css.gitFileDirectory}>{directoryName(file.path)}</span>
                    </span>
                    <span className={css.statusBadge} data-status={normalizeStatus(file.status)}>{normalizeStatus(file.status)}</span>
                  </button>
                ))}
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
            stroke={graphColor(row.color)}
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
        <circle
          data-graph-node=""
          data-lane={row.lane}
          cx={nodeX}
          cy={GRAPH_NODE_Y}
          r="3.4"
          fill={graphColor(row.color)}
        />
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

function commitTooltip(commit: GitCommit): string {
  const references = commit.references.map(reference => reference.name).join(' · ')
  return [
    commit.subject,
    `${commit.author} · ${formatCommitTime(commit.authoredAt)}`,
    commit.hash,
    references,
  ].filter(line => line !== '').join('\n')
}

function normalizeStatus(status: string): string {
  return status === '?' ? 'U' : status === ' ' ? 'M' : status
}

function fileName(path: string): string {
  return path.split('/').at(-1) ?? path
}

function directoryName(path: string): string {
  const boundary = path.lastIndexOf('/')
  return boundary < 0 ? '' : path.slice(0, boundary)
}

function formatCommitTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}
