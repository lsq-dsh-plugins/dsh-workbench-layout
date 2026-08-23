export type GitFileLayout = 'list' | 'tree'

export interface GitPathEntry {
  path: string
}

export interface GitPathTreeNode<Entry extends GitPathEntry> {
  name: string
  path: string
  directories: GitPathTreeNode<Entry>[]
  files: Entry[]
}

interface MutableTreeNode<Entry extends GitPathEntry> {
  name: string
  path: string
  directories: Map<string, MutableTreeNode<Entry>>
  files: Entry[]
}

/** 将任意 Git 文件清单转换成稳定排序的目录树。 */
export function buildGitPathTree<Entry extends GitPathEntry>(files: Entry[]): GitPathTreeNode<Entry> {
  const root: MutableTreeNode<Entry> = { name: '', path: '', directories: new Map(), files: [] }
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

function freezeTree<Entry extends GitPathEntry>(node: MutableTreeNode<Entry>): GitPathTreeNode<Entry> {
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
