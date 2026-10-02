'use client';

import { useCallback, useEffect, useState } from 'react';

import { fetchProducts } from '@/lib/catalog-api';
import type { Product, ProductQuery } from '@/lib/types';

export function useProductsData({
  q,
  line,
  brand,
  status,
  page = 1,
  pageSize = 100,
}: ProductQuery = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [resolvedPage, setResolvedPage] = useState(page);
  const [resolvedPageSize, setResolvedPageSize] = useState(pageSize);
  const [totalPages, setTotalPages] = useState(1);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [settledRequest, setSettledRequest] = useState('');
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const requestKey = JSON.stringify({
    q,
    line,
    brand,
    status,
    page,
    pageSize,
    revision,
  });
  const loading = settledRequest !== requestKey;
  const error = loading ? null : requestError;

  useEffect(() => {
    const controller = new AbortController();

    void fetchProducts({ q, line, brand, status, page, pageSize }, controller.signal)
      .then((result) => {
        setProducts(result.items);
        setTotal(result.total);
        setResolvedPage(result.page);
        setResolvedPageSize(result.pageSize);
        setTotalPages(result.totalPages);
        setRequestError(null);
        setSettledRequest(requestKey);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === 'AbortError') return;
        setRequestError(
          requestError instanceof Error
            ? requestError.message
            : 'No fue posible cargar el catálogo.',
        );
        setProducts([]);
        setTotal(0);
        setResolvedPage(page);
        setResolvedPageSize(pageSize);
        setTotalPages(1);
        setSettledRequest(requestKey);
      });

    return () => controller.abort();
  }, [brand, line, page, pageSize, q, requestKey, status]);

  return {
    products,
    total,
    page: resolvedPage,
    pageSize: resolvedPageSize,
    totalPages,
    loading,
    error,
    reload,
  };
}
