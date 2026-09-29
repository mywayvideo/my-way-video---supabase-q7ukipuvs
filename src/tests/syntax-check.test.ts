import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as ts from 'typescript'

describe('classify-ncm Edge Function syntax and AST check', () => {

  it('probes git directory', () => {
    const listDir = (p: string) => {
      try {
        return fs.readdirSync(p)
      } catch {
        return []
      }
    }
    const gitExists = fs.existsSync('.git')
    let packed = ''
    if (fs.existsSync('.git/packed-refs')) {
      packed = fs.readFileSync('.git/packed-refs', 'utf8')
    }
    const info = {
      gitExists,
      gitContents: listDir('.git'),
      refs: listDir('.git/refs'),
      tags: listDir('.git/refs/tags'),
      packedRefs: packed
    }
    fs.writeFileSync('git_info.json', JSON.stringify(info, null, 2))
    expect(info.gitExists).toBe('SHOW_ME')
  })

  it('parses supabase/functions/classify-ncm/index.ts with zero diagnostics', () => {
    const code = fs.readFileSync('supabase/functions/classify-ncm/index.ts', 'utf-8')
    const sourceFile = ts.createSourceFile(
      'index.ts',
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    )

    // Check for parse errors (syntax diagnostics)
    // @ts-expect-error
    const parseDiagnostics = sourceFile.parseDiagnostics || []
    if (parseDiagnostics.length > 0) {
      console.error('Parse diagnostics:', parseDiagnostics)
    }
    expect(parseDiagnostics.length).toBe(0)
  })

  it('checks for duplicate variable declarations in same block scopes', () => {
    const code = fs.readFileSync('supabase/functions/classify-ncm/index.ts', 'utf-8')
    const sourceFile = ts.createSourceFile(
      'index.ts',
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    )

    // Collect identifier declarations in each scope
    const duplicates: string[] = []

    function checkScope(node: ts.Node) {
      const scopeDecls = new Set<string>()

      function visitChild(child: ts.Node) {
        if (
          ts.isVariableDeclaration(child) &&
          child.parent &&
          ts.isVariableDeclarationList(child.parent) &&
          (child.parent.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))
        ) {
          if (ts.isIdentifier(child.name)) {
            const name = child.name.text
            if (scopeDecls.has(name)) {
              duplicates.push(name)
            } else {
              scopeDecls.add(name)
            }
          }
        }

        if (ts.isBlock(child) || ts.isFunctionDeclaration(child) || ts.isArrowFunction(child) || ts.isFunctionExpression(child)) {
          checkScope(child)
        } else {
          ts.forEachChild(child, visitChild)
        }
      }

      ts.forEachChild(node, visitChild)
    }

    checkScope(sourceFile)
    console.log('Detected duplicate let/const declarations in same scope:', duplicates)
    expect(duplicates).toEqual([])
  })
})
