import React from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Spinner, Badge } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface Channel {
  id: number
  name: string
  platform: string
}

interface DispatchTarget {
  channel_id: number
}

interface DispatchPayload {
  product_id?: number
  message: { text: string }
  targets: DispatchTarget[]
}

interface DispatchResponse {
  id: number
}

interface ComposePreviewResponse {
  text?: string
}

export default function Composer() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const productId = params.get('productId')
  const targetsParam = params.get('targets') ?? ''
  const targetIds = React.useMemo(
    () =>
      targetsParam
        .split(',')
        .map(Number)
        .filter((n) => !Number.isNaN(n) && n > 0),
    [targetsParam]
  )

  const [text, setText] = React.useState('')
  const [includeImage, setIncludeImage] = React.useState(true)
  const [includeLink, setIncludeLink] = React.useState(true)
  const [includeHashtags, setIncludeHashtags] = React.useState(false)
  const [showConfirm, setShowConfirm] = React.useState(false)

  // Buscar preview gerado pelo LLM — onSuccess nao existe em RQ5, usar useEffect
  const { data: previewData, isLoading: loadingPreview } = useQuery<ComposePreviewResponse>({
    queryKey: ['compose', 'preview', productId],
    queryFn: () =>
      apiClient
        .post('/api/compose/preview', {
          product_id: productId ? Number(productId) : undefined,
        })
        .then((r) => r.data),
    enabled: !!productId,
    staleTime: Infinity,
  })

  React.useEffect(() => {
    if (previewData?.text && !text) {
      setText(previewData.text)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewData])

  // Buscar detalhes dos canais selecionados
  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['channels', targetIds],
    queryFn: () =>
      apiClient.get('/api/channels').then((r) => {
        const all: Channel[] = Array.isArray(r.data) ? r.data : (r.data?.items ?? [])
        return targetIds.length > 0
          ? all.filter((c) => targetIds.includes(c.id))
          : all
      }),
    enabled: targetIds.length > 0,
  })

  const dispatch = useMutation<DispatchResponse, Error, DispatchTarget[]>({
    mutationFn: (targets) =>
      apiClient
        .post<DispatchResponse>('/api/dispatches', {
          product_id: productId ? Number(productId) : undefined,
          message: { text },
          targets,
        } as DispatchPayload)
        .then((r) => r.data),
    onSuccess: (data) => navigate(`/logs?dispatchId=${data.id}`),
  })

  const handleDispatch = () => {
    const targets: DispatchTarget[] =
      targetIds.length > 0
        ? targetIds.map((id) => ({ channel_id: id }))
        : channels.map((c) => ({ channel_id: c.id }))
    dispatch.mutate(targets)
  }

  const previewLines = text
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-fg mb-6">Compor disparo</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna esquerda: produtos selecionados */}
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-md p-4">
            <p className="text-xs font-medium text-fg-2 mb-3 uppercase tracking-wide">
              Produto
            </p>
            {productId ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-fg font-mono">#{productId}</span>
                <button
                  type="button"
                  className="text-xs text-accent hover:underline"
                  onClick={() => navigate('/match')}
                >
                  Trocar
                </button>
              </div>
            ) : (
              <p className="text-sm text-fg-3">
                Nenhum produto selecionado.{' '}
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() => navigate('/match')}
                >
                  Escolher
                </button>
              </p>
            )}
          </div>

          {/* Opcoes de formatacao */}
          <div className="bg-surface border border-border rounded-md p-4 space-y-3">
            <p className="text-xs font-medium text-fg-2 uppercase tracking-wide">Opcoes</p>
            {[
              { label: 'Incluir imagem', value: includeImage, set: setIncludeImage },
              { label: 'Incluir link afiliado', value: includeLink, set: setIncludeLink },
              { label: 'Adicionar hashtags', value: includeHashtags, set: setIncludeHashtags },
            ].map(({ label, value, set }) => (
              <label key={label} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => set(e.target.checked)}
                  className="accent-accent"
                />
                <span className="text-sm text-fg-2">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Centro: editor + preview */}
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-md p-4">
            <label className="text-xs font-medium text-fg-2 mb-2 block uppercase tracking-wide">
              Mensagem
            </label>
            {loadingPreview && !text ? (
              <div className="flex items-center gap-2 text-fg-3 text-sm py-4">
                <Spinner size="sm" /> Gerando copy com IA...
              </div>
            ) : (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                className="w-full resize-none text-sm text-fg bg-transparent outline-none placeholder:text-fg-3"
                placeholder="Escreva a mensagem do disparo..."
              />
            )}
          </div>

          {/* Preview WhatsApp */}
          <div className="bg-surface border border-border rounded-md p-4">
            <p className="text-xs font-medium text-fg-3 mb-3 uppercase tracking-wide">
              Preview WhatsApp
            </p>
            <div className="bg-[#005c4b] rounded-lg p-3 max-w-xs ml-auto shadow-md">
              <p className="text-sm text-white whitespace-pre-wrap break-words">
                {previewLines || '...'}
              </p>
              <p className="text-xs text-green-200 mt-1 text-right opacity-70">
                agora
              </p>
            </div>
          </div>
        </div>

        {/* Direita: destinos + acoes */}
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-md p-4">
            <p className="text-sm font-medium text-fg mb-3">
              Disparar para
              {channels.length > 0 && (
                <span className="ml-2 text-fg-3 font-normal text-xs">
                  ({channels.length} canal{channels.length !== 1 ? 'is' : ''})
                </span>
              )}
            </p>
            {channels.length === 0 ? (
              <p className="text-xs text-fg-3">
                Nenhum canal selecionado.{' '}
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() =>
                    navigate(productId ? `/match?productId=${productId}` : '/match')
                  }
                >
                  Selecionar canais
                </button>
              </p>
            ) : (
              <div className="space-y-2">
                {channels.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-fg">{c.name}</span>
                    <Badge variant="default">{c.platform}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              loading={dispatch.isPending}
              disabled={!text.trim() || dispatch.isPending}
              onClick={() => setShowConfirm(true)}
            >
              Disparar agora
            </Button>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              Voltar
            </Button>
          </div>
        </div>
      </div>
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowConfirm(false)}>
          <div
            className="bg-surface border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-modal"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-fg mb-2">Confirmar disparo</h3>
            <p className="text-sm text-fg-2 mb-4">
              A mensagem será enviada para os grupos selecionados. Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm rounded-md bg-surface-2 text-fg-2 hover:bg-border"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { setShowConfirm(false); handleDispatch() }}
                className="px-4 py-2 text-sm rounded-md bg-accent text-white hover:bg-accent-hover"
              >
                Confirmar disparo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
