import type { GitFileStatus } from '../contracts.ts'

export interface GitChangeTreeNode {
  name: string
  path: string
  directories: GitChangeTreeNode[]
  files: GitFileStatus[]
}

interface MutableTreeNode {
  name: string
  path: string
  directories: Map<string, MutableTreeNode>
  files: GitFileStatus[]
}

/** 将 Git 的扁平路径转换成稳定排序的目录树。 */
export function buildGitChangeTree(files: GitFileStatus[]): GitChangeTreeNode {
  const root: MutableTreeNode = { name: '', path: '', directories: new Map(), files: [] }
  for (const file of files) {
    const parts = file.path.split('/')
    let node = root
    for (const part of parts.slice(0, -1)) {
      const path = node.path === '' ? part : `${node.path}/${part}`
      let child = node.directories.get(part)
      if (child === undefined) {
        child = { name: part, path, directories: new Map(), files: [] }
        node.directories.set(part, child)
      }
      node = child
    }
    node.files.push(file)
  }
  return freezeTree(root)
}

function freezeTree(node: MutableTreeNode): GitChangeTreeNode {
  return {
    name: node.name,
    path: node.path,
    directories: [...node.directories.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(freezeTree),
    files: [...node.files].sort((left, right) => fileName(left.path).localeCompare(fileName(right.path))),
  }
}

function fileName(path: string): string {
  return path.split('/').at(-1) ?? path
}
