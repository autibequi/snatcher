import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import axios from 'axios'

interface PublicGroup {
  id: string
  name: string
  description?: string
  search_prompt: string
  invite_link?: string
}

const getPublicGroups = (): Promise<PublicGroup[]> => axios.get('/api/public/groups').then(r => r.data)

export default function Frontpage(): React.ReactElement {
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['publicGroups'],
    queryFn: getPublicGroups,
    staleTime: 60000,
  }) as { data: PublicGroup[], isLoading: boolean }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Hero */}
      <div className="text-center pt-16 pb-12 px-4">
        <span className="text-6xl">🔥</span>
        <h1 className="text-4xl font-bold text-white mt-4">Promo Snatcher</h1>
      </div>

      {/* Groups grid */}
      <div className="max-w-4xl mx-auto px-4 pb-20">
        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="text-gray-500 text-sm">Carregando grupos...</div>
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <p className="text-center text-gray-500">Nenhum grupo disponível no momento.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {groups.map((g, i) => (
            <div
              key={i}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 hover:border-green-700 transition-colors"
            >
              <div>
                <h2 className="text-xl font-semibold text-white">{g.name}</h2>
                {g.description && (
                  <p className="text-sm text-gray-400 mt-1">{g.description}</p>
                )}
                <p className="text-xs text-gray-600 italic mt-2">"{g.search_prompt}"</p>
              </div>

              <div className="mt-auto">
                {g.invite_link ? (
                  <a
                    href={g.invite_link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-500 text-white font-medium py-3 rounded-xl transition-colors text-sm"
                  >
                    <span>📱</span>
                    <span>Entrar no grupo</span>
                  </a>
                ) : (
                  <div className="text-center text-xs text-gray-600 py-2">
                    Link em breve
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-16 pt-8 border-t border-gray-800">
          <Link to="/login" className="text-gray-700 hover:text-gray-400 text-xs transition-colors">
            Powered by Promo Snatcher
          </Link>
        </div>
      </div>
    </div>
  )
}
