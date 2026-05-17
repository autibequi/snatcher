#!/usr/bin/env node
// lint-mythos.mjs — Garante que persona mythos não vaze para contextos proibidos.
//
// Contextos proibidos: h1-h6, label=, placeholder=
// Contextos permitidos: description prop de EmptyState, error toasts, tooltips
//
// Executar: npm run lint:mythos

import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Diretório raiz do frontend (um nível acima de scripts/)
const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = resolve(__dirname, '..')

// Termos mythos canônicos — fonte de verdade em src/lib/copy/mythos.ts
const FORBIDDEN_TERMS = [
  'Despachante',
  'Mensageiro',
  'Oráculo',
  'Censor',
  'Apostador',
  'Escriba',
  'Guardião',
  'Biblioteca',
  'Carteiro',
  'Taxonomista',
]

// Monta o padrão de alternância para grep
const termAlt = FORBIDDEN_TERMS.join('|')

// Padrões proibidos: termos mythos dentro de h1-h6, label=, placeholder=
const pattern = `(<h[1-6][^>]*>[^<]*\\b(${termAlt})\\b|label="[^"]*\\b(${termAlt})\\b|placeholder="[^"]*\\b(${termAlt})\\b)`

/**
 * Executa o grep contra src/ e retorna linhas com violações.
 * Exclui o arquivo fonte canônico (mythos.ts) e arquivos de teste.
 */
function findViolations() {
  const cmd = [
    'grep',
    '-rEn',
    `'${pattern}'`,
    'src/',
    "--include='*.tsx'",
    "--include='*.ts'",
    "| grep -v 'lib/copy/mythos.ts'",
    "| grep -v '__tests__'",
    '|| true',
  ].join(' ')

  const result = execSync(`cd ${FRONTEND_ROOT} && ${cmd}`, { encoding: 'utf-8' })
  return result.trim()
}

function main() {
  const violations = findViolations()

  if (violations) {
    console.error('Mythos vazou para contexto proibido (h1-h6 / label= / placeholder=):')
    console.error(violations)
    process.exit(1)
  }

  console.log('Mythos contained — zero vazamentos em headers/labels/placeholders.')
}

main()
