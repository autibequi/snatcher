import React, { useState, FC } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCoverage, postCoverageSync } from '../api'

interface CoverageData {
  accounts: Array<{ id: string; name: string }>
  targets: Array<{ id: string; name: string }>
  matrix: Array<Array<'present' | 'fallback' | 'absent'>>
}

interface ConfirmModalProps {
  accountId: string
  accountName: string
  targetIds: string[]
  targetNames: Record<string, string>
  onConfirm: () => void
  onCancel: () => void
}

const ConfirmModal: FC<ConfirmModalProps> = ({ accountId, accountName, targetIds, targetNames, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md mx-4">
        <h3 className="text-base font-semibold text-white mb-4">Confirmar sincronizacao</h3>
        <p className="text-sm text-gray-300 mb-4">
          Esta acao adicionara conta <strong>{accountName}</strong> em {targetIds.length} grupo(s):
        </p>
        <ul className="bg-gray-900 border border-gray-700 rounded p-3 mb-4 max-h-48 overflow-y-auto">
          {targetIds.map(tid => (
            <li key={tid} className="text-xs text-gray-400 py-1">• {targetNames[tid] || tid}</li>
          ))}
        </ul>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-white">
            Cancelar
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-lg bg-green-700 hover:bg-green-600 text-white">
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

export const CoverageMatrix: FC = () => {
  const qc = useQueryClient()
  const { data: coverage, isLoading } = useQuery({
    queryKey: ['coverage'],
    queryFn: getCoverage as () => Promise<CoverageData>,
    retry: false,
  })

  const sync = useMutation({
    mutationFn: (data: any) => postCoverageSync(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coverage'] })
      setConfirmModal(null)
    },
  })

  const [confirmModal, setConfirmModal] = useState<{
    accountId: string
    accountName: string
    targetIds: string[]
  } | null>(null)

  if (isLoading) return <div className="text-gray-400 text-sm">Carregando matriz...</div>
  if (!coverage) return <div className="text-red-400 text-sm">Erro ao carregar cobertura</div>

  const { accounts, targets, matrix } = coverage

  // Encontra celulas vermelhas (absent)
  const redCells: Array<{ accountIdx: number; targetIdx: number }> = []
  matrix.forEach((row, ai) => {
    row.forEach((cell, ti) => {
      if (cell === 'absent') {
        redCells.push({ accountIdx: ai, targetIdx: ti })
      }
    })
  })

  // Agrupa por conta
  const redByAccount = redCells.reduce((acc, { accountIdx, targetIdx }) => {
    if (!acc[accountIdx]) acc[accountIdx] = []
    acc[accountIdx].push(targetIdx)
    return acc
  }, {} as Record<number, number[]>)

  const handleSyncAll = () => {
    if (Object.keys(redByAccount).length === 0) {
      alert('Nenhuma celula vermelha para sincronizar')
      return
    }
    // Modal confirmacao agregada com todas as contas
    const allTargetIndices = new Set<number>()
    Object.values(redByAccount).forEach(tids => tids.forEach(tid => allTargetIndices.add(tid)))
    setConfirmModal({
      accountId: '', // nao usado em sync multi
      accountName: 'todas as contas vermelhas',
      targetIds: Array.from(allTargetIndices).map(idx => targets[idx]?.id || String(idx)),
    })
  }

  const handleCellClick = (accountIdx: number, targetIdx: number) => {
    const cell = matrix[accountIdx]?.[targetIdx]
    if (cell === 'absent') {
      setConfirmModal({
        accountId: accounts[accountIdx].id,
        accountName: accounts[accountIdx].name,
        targetIds: [targets[targetIdx].id],
      })
    }
  }

  const getCellColor = (cell: string) => {
    switch (cell) {
      case 'present': return 'bg-green-900'
      case 'fallback': return 'bg-yellow-900'
      case 'absent': return 'bg-red-900 cursor-pointer hover:bg-red-800'
      default: return 'bg-gray-700'
    }
  }

  const handleConfirm = () => {
    if (!confirmModal) return
    sync.mutate({
      account_id: confirmModal.accountId,
      target_ids: confirmModal.targetIds,
      confirmed: true,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 justify-between items-center">
        <h3 className="text-base font-semibold text-white">Matriz de Cobertura</h3>
        <button
          onClick={handleSyncAll}
          disabled={Object.keys(redByAccount).length === 0 || sync.isPending}
          className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg">
          {sync.isPending ? '...' : `Sincronizar ${Object.keys(redByAccount).length} actas`}
        </button>
      </div>

      {/* Legenda */}
      <div className="flex gap-4 text-xs text-gray-300">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-900 rounded"></div>
          <span>Ativa (present)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-900 rounded"></div>
          <span>Fallback (fallback)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-900 rounded"></div>
          <span>Ausente (absent)</span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto border border-gray-700 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-800 sticky top-0">
            <tr>
              <th className="bg-gray-800 sticky left-0 z-10 px-3 py-2 text-left font-semibold text-gray-300 border-r border-gray-700">Conta</th>
              {targets.map(t => (
                <th key={t.id} className="px-2 py-2 text-left font-semibold text-gray-300 whitespace-nowrap">{t.name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {accounts.map((acc, ai) => (
              <tr key={acc.id} className="divide-x divide-gray-700">
                <td className="bg-gray-900 sticky left-0 z-10 px-3 py-2 font-medium text-gray-300 border-r border-gray-700">{acc.name}</td>
                {matrix[ai]?.map((cell, ti) => (
                  <td
                    key={`${ai}-${ti}`}
                    onClick={() => handleCellClick(ai, ti)}
                    className={`px-2 py-2 h-8 ${getCellColor(cell)} transition-colors`}
                    title={`${acc.name} → ${targets[ti]?.name}: ${cell}`}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmModal && (
        <ConfirmModal
          accountId={confirmModal.accountId}
          accountName={confirmModal.accountName}
          targetIds={confirmModal.targetIds}
          targetNames={Object.fromEntries(targets.map((t: any) => [t.id, t.name]))}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  )
}
