'use client';

import type { WorkspaceDto, WorkspaceQuery, WorkspaceSlug } from '@cdr/contracts';
import { useCallback, useEffect, useState } from 'react';

import { fetchWorkspace } from '@/lib/workspace-api';

export function useWorkspaceData(slug: WorkspaceSlug, query: WorkspaceQuery = {}) {
  const [workspace, setWorkspace] = useState<WorkspaceDto | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [settledRequest, setSettledRequest] = useState('');
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const queryKey = JSON.stringify(query, Object.keys(query).sort());
  const requestKey = `${slug}:${queryKey}:${revision}`;
  const loading = settledRequest !== requestKey;

  useEffect(() => {
    const controller = new AbortController();

    void fetchWorkspace(slug, controller.signal, JSON.parse(queryKey) as WorkspaceQuery)
      .then((result) => {
        if (controller.signal.aborted) return;
        setWorkspace(result);
        setRequestError(null);
        setSettledRequest(requestKey);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError'))
          return;
        setWorkspace(null);
        setRequestError(
          error instanceof Error ? error.message : 'No fue posible cargar el módulo operativo.',
        );
        setSettledRequest(requestKey);
      });

    return () => controller.abort();
  }, [queryKey, requestKey, slug]);

  const activeWorkspace = workspace?.slug === slug ? workspace : null;

  return {
    workspace: activeWorkspace,
    loading,
    error: loading ? null : requestError,
    reload,
  };
}
