// Helpers pra extrair mensagens de erro úteis de respostas HTTP/Cloudflare.

export function describeError(err: unknown): string {
  const e = err as any
  const status = e?.response?.status
  const code = e?.code
  const data = e?.response?.data

  // Cloudflare bad gateway / gateway timeout
  if (status === 502 || status === 504) {
    return `O servidor demorou demais para responder (${status}). A IA provavelmente passou do tempo limite — tente novamente em ~1 min ou troque o modelo.`
  }
  if (status === 503) {
    return 'Serviço temporariamente indisponível (503). Aguarde alguns segundos e tente de novo.'
  }
  if (status === 422) {
    return data?.error ?? 'Requisição inválida (422).'
  }
  if (status === 401 || status === 403) {
    return 'Sem permissão. Faça login novamente.'
  }
  if (code === 'ECONNABORTED' || /timeout/i.test(e?.message ?? '')) {
    return 'Timeout no cliente — a operação demorou mais que o esperado. Tente novamente.'
  }
  if (code === 'ERR_NETWORK') {
    return 'Sem conexão com o servidor.'
  }

  // Mensagem do backend (preferida)
  if (typeof data?.error === 'string') return data.error
  if (typeof data === 'string' && data.length < 300) return data
  if (typeof e?.message === 'string') return e.message

  return 'falha desconhecida'
}
