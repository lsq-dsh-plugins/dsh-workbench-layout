import type { GitCommit } from '../contracts.ts'

export interface GitGraphLane {
  hash: string
  lane: number
  color: number
}

export interface GitGraphEdge {
  from: number
  to: number
  color: number
}

export interface GitGraphRow {
  commit: GitCommit
  lane: number
  visibleLaneCount: number
  nodeColor: number
  incomingColor: number
  incoming: boolean
  nodeKind: 'commit' | 'reference' | 'merge'
  passing: GitGraphEdge[]
  outgoing: GitGraphEdge[]
  continuation: GitGraphLane[]
}

export interface GitGraphLayout {
  rows: GitGraphRow[]
  laneCount: number
}

interface ActiveLane {
  hash: string
  color: number
}

/**
 * 将 `git log --topo-order` 的提交序列转换为稳定轨道。
 * 第一父提交通常延续当前颜色；遇到引用边界或 Merge commit 时开启新色段，
 * 额外父提交建立独立轨道，已存在的父轨道会被汇合复用。
 */
export function buildGitGraph(commits: readonly GitCommit[]): GitGraphLayout {
  let lanes: ActiveLane[] = []
  let nextColor = 0
  let laneCount = 1
  const rows: GitGraphRow[] = []

  for (const commit of commits) {
    let lane = lanes.findIndex(candidate => candidate.hash === commit.hash)
    const incoming = lane >= 0
    if (!incoming) {
      lane = lanes.length
      lanes.push({ hash: commit.hash, color: nextColor++ })
    }

    const before = lanes
    const current = before[lane]!
    const after = before.filter((_, index) => index !== lane)
    const parents = commit.parents.filter((hash, index, values) => values.indexOf(hash) === index)
    const startsNewFirstParentSegment = incoming && parents.length > 0
      && (commit.references.length > 0 || parents.length > 1)

    for (const [parentIndex, hash] of parents.entries()) {
      if (after.some(candidate => candidate.hash === hash)) continue
      const insertion = parentIndex === 0
        ? Math.min(lane, after.length)
        : Math.min(lane + parentIndex, after.length)
      after.splice(insertion, 0, {
        hash,
        color: parentIndex === 0 && !startsNewFirstParentSegment ? current.color : nextColor++,
      })
    }

    const passing = before.flatMap((active, from) => {
      if (from === lane) return []
      const to = after.findIndex(candidate => candidate.hash === active.hash)
      return to < 0 ? [] : [{ from, to, color: active.color }]
    })
    const outgoing = parents.map((hash) => {
      const to = after.findIndex(candidate => candidate.hash === hash)
      return { from: lane, to, color: after[to]!.color }
    })
    const continuation = after.map((active, index) => ({ ...active, lane: index }))
    const firstParentLane = parents[0] === undefined
      ? undefined
      : after.find(candidate => candidate.hash === parents[0])
    const referenceBoundary = incoming && parents.length === 1 && commit.references.length > 0
    const nodeColor = referenceBoundary ? firstParentLane?.color ?? current.color : current.color
    const nodeKind = parents.length > 1
      ? 'merge'
      : commit.references.length > 0 ? 'reference' : 'commit'

    const visibleLaneCount = Math.max(1, before.length, after.length)
    laneCount = Math.max(laneCount, visibleLaneCount)
    rows.push({
      commit,
      lane,
      visibleLaneCount,
      nodeColor,
      incomingColor: current.color,
      incoming,
      nodeKind,
      passing,
      outgoing,
      continuation,
    })
    lanes = after
  }

  return { rows, laneCount }
}
