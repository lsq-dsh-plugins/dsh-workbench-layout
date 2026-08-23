import { describe, expect, it } from 'vitest'
import type { GitCommit } from '../src/contracts.ts'
import { buildGitGraph } from '../src/client/git-graph.ts'

describe('Git Graph 拓扑', () => {
  it('让普通提交沿同一条轨道延续到根提交', () => {
    const graph = buildGitGraph([
      commit('a', ['b']),
      commit('b', ['c']),
      commit('c', []),
    ])

    expect(graph.laneCount).toBe(1)
    expect(graph.rows.map(row => ({ lane: row.lane, incoming: row.incoming }))).toEqual([
      { lane: 0, incoming: false },
      { lane: 0, incoming: true },
      { lane: 0, incoming: true },
    ])
    expect(graph.rows[0]?.outgoing).toEqual([{ from: 0, to: 0, color: 0 }])
    expect(graph.rows[2]?.continuation).toEqual([])
  })

  it('为分叉和 Merge commit 建立独立轨道并在共同父提交前汇合', () => {
    const graph = buildGitGraph([
      commit('m', ['a', 'b']),
      commit('a', ['c']),
      commit('b', ['c']),
      commit('c', []),
    ])

    expect(graph.laneCount).toBe(2)
    expect(graph.rows[0]?.outgoing.map(edge => [edge.from, edge.to])).toEqual([[0, 0], [0, 1]])
    expect(graph.rows[1]?.passing.map(edge => [edge.from, edge.to])).toEqual([[1, 1]])
    expect(graph.rows[2]).toMatchObject({ lane: 1, incoming: true })
    expect(graph.rows[2]?.outgoing.map(edge => [edge.from, edge.to])).toEqual([[1, 0]])
    expect(graph.rows[3]).toMatchObject({ lane: 0, incoming: true, outgoing: [], continuation: [] })
  })

  it('保留指向未加载父提交的底部延续轨道', () => {
    const graph = buildGitGraph([commit('a', ['b'])])

    expect(graph.rows[0]?.continuation).toEqual([{ hash: hash('b'), lane: 0, color: 0 }])
    expect(graph.rows[0]?.outgoing).toHaveLength(1)
  })
})

function commit(value: string, parents: string[]): GitCommit {
  return {
    hash: hash(value),
    shortHash: value.repeat(7),
    parents: parents.map(hash),
    subject: value,
    author: 'Tester',
    authoredAt: '2026-08-23T10:00:00Z',
    references: [],
  }
}

function hash(value: string): string {
  return value.repeat(40)
}
