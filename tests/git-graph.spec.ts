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
    expect(graph.rows[0]).toMatchObject({ nodeKind: 'merge', nodeColor: 0, incomingColor: 0 })
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

  it('在分支引用处开启稳定的新色段而不改变拓扑轨道', () => {
    const graph = buildGitGraph([
      commit('a', ['b'], [{ name: 'main', kind: 'head' }]),
      commit('b', ['c'], [{ name: 'origin/main', kind: 'remote' }]),
      commit('c', []),
    ])

    expect(graph.rows[0]).toMatchObject({ nodeKind: 'reference', nodeColor: 0, incomingColor: 0 })
    expect(graph.rows[1]).toMatchObject({
      lane: 0,
      nodeKind: 'reference',
      nodeColor: 1,
      incomingColor: 0,
    })
    expect(graph.rows[1]?.outgoing).toEqual([{ from: 0, to: 0, color: 1 }])
    expect(graph.rows[2]).toMatchObject({ nodeKind: 'commit', nodeColor: 1, incomingColor: 1 })
  })

  it('在远程引用与合并点之间建立可辨认的颜色分段', () => {
    const graph = buildGitGraph([
      commit('a', ['b'], [{ name: 'main', kind: 'head' }]),
      commit('b', ['m']),
      commit('m', ['c', 'd'], [{ name: 'origin/main', kind: 'remote' }]),
      commit('c', ['r']),
      commit('d', ['r']),
      commit('r', []),
    ])

    expect(graph.rows[0]).toMatchObject({ nodeKind: 'reference', nodeColor: 0 })
    expect(graph.rows[2]).toMatchObject({ nodeKind: 'merge', nodeColor: 0, incomingColor: 0 })
    expect(graph.rows[2]?.outgoing.map(edge => edge.color)).toEqual([1, 2])
    expect(graph.rows[3]).toMatchObject({ nodeKind: 'commit', nodeColor: 1, incomingColor: 1 })
    expect(graph.rows[4]).toMatchObject({ nodeKind: 'commit', nodeColor: 2, incomingColor: 2 })
  })
})

function commit(
  value: string,
  parents: string[],
  references: GitCommit['references'] = [],
): GitCommit {
  return {
    hash: hash(value),
    shortHash: value.repeat(7),
    parents: parents.map(hash),
    subject: value,
    author: 'Tester',
    authoredAt: '2026-08-23T10:00:00Z',
    references,
  }
}

function hash(value: string): string {
  return value.repeat(40)
}
