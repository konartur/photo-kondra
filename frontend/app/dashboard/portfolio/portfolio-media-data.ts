'use client';

import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import type { AdminPortfolioMediaDto, AdminPortfolioMediaListDto } from '@/lib/portfolio/contracts';

export const mediaPath = '/api/portfolio/media';
export const mediaKey = ['portfolio-admin', 'media'] as const;
export const mediaDetailKey = (id: string) => [...mediaKey, 'detail', id] as const;

export const jsonRequest = (method: 'POST' | 'PUT' | 'DELETE', body: object): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
});

export function usePortfolioMedia(search = '', enabled = true) {
  const normalized = search.trim();
  return useInfiniteQuery({
    queryKey: [...mediaKey, 'list', normalized],
    enabled,
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '24' });
      if (normalized) params.set('search', normalized);
      if (pageParam) params.set('cursor', pageParam);
      return apiRequest<AdminPortfolioMediaListDto>(mediaPath + '?' + params, { signal, cache: 'no-store' });
    },
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchInterval: query => query.state.data?.pages.some(page => page.items.some(item => item.status === 'PROCESSING')) ? 3500 : false,
    retry: false,
  });
}

export function useMediaSearch() {
  const [search, setSearch] = useState('');
  const [querySearch, setQuerySearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setQuerySearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  return { search, setSearch, querySearch, pending: search.trim() !== querySearch };
}

export function fetchPortfolioMedia(id: string, signal?: AbortSignal) {
  return apiRequest<AdminPortfolioMediaDto>(mediaPath + '/' + encodeURIComponent(id), { signal, cache: 'no-store' });
}
