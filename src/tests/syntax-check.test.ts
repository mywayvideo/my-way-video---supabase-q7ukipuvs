import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as ts from 'typescript'
import * as child_process from 'child_process'

describe('classify-ncm Edge Function syntax and AST check', () => {


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

        // Do not recurse into nested blocks/functions for the current scope's direct declarations,
        // but do check them as their own scopes
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
