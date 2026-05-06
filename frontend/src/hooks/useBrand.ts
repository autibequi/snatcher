import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'

interface Brand {
  app_name?: string
  app_domain?: string
  public_url?: string
  llm_provider?: string
}

// useBrand retorna a configuração de white-label vinda de /api/brand.
// Cacheia por 5min — settings mudam raramente.
export function useBrand() {
  return useQuery<Brand>({
    queryKey: ['brand'],
    queryFn: () =>
      apiClient
        .get('/api/brand')
        .then(r => r.data)
        .catch(() => ({})),
    staleTime: 5 * 60_000,
  })
}

// publicLinkPrefix retorna o domínio formatado pra usar como prefixo de short link.
// Ex: "snatcher.link/" — sem protocolo, com barra final.
export function usePublicLinkPrefix(): string {
  const { data } = useBrand()
  const domain = data?.app_domain?.trim()
  if (domain) return `${domain}/`
  // fallback derivado do public_url
  const pub = data?.public_url?.trim() ?? ''
  const stripped = pub.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return stripped ? `${stripped}/` : 'snatcher.link/'
}

// publicLinkBaseURL retorna URL completa pra copiar/clipboard.
export function usePublicLinkBaseURL(): string {
  const { data } = useBrand()
  if (data?.public_url) return data.public_url.replace(/\/$/, '')
  if (data?.app_domain) return `https://${data.app_domain}`
  return 'https://snatcher.link'
}
