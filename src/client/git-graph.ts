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
  color: number
  incoming: boolean
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
 * 第一父提交延续当前颜色，额外父提交建立新轨道；已存在的父轨道会被汇合复用。
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

    for (const [parentIndex, hash] of parents.entries()) {
      if (after.some(candidate => candidate.hash === hash)) continue
      const insertion = parentIndex === 0
        ? Math.min(lane, after.length)
        : Math.min(lane + parentIndex, after.length)
      after.splice(insertion, 0, {
        hash,
        color: parentIndex === 0 ? current.color : nextColor++,
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

    laneCount = Math.max(laneCount, before.length, after.length)
    rows.push({ commit, lane, color: current.color, incoming, passing, outgoing, continuation })
    lanes = after
  }

  return { rows, laneCount }
}
