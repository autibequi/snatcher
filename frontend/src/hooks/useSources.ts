import { useQuery } from '@tanstack/react-query'
import type { Source } from '../types/extended'
import { getSources } from '../api'

export function useSources() {
  return useQuery<Source[]>({
    queryKey: ['sources'],
    queryFn: () => getSources(),
    staleTime: 1000 * 60 * 60, // 1h
  })
}

export function useEnabledSources(category?: 'ecommerce' | 'cdkey') {
  const { data, ...rest } = useSources()
  return {
    ...rest,
    data: data?.filter(s => s.enabled && (!category || s.category === category)),
  }
}
