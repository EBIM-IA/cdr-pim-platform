'use client';

import type { WorkspaceDto, WorkspaceSlug } from '@cdr/contracts';
import { useCallback, useEffect, useState } from 'react';

import { fetchWorkspace } from '@/lib/workspace-api';

export function useWorkspaceData(slug: WorkspaceSlug) {
  const [workspace, setWorkspace] = useState<WorkspaceDto | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [settledRequest, setSettledRequest] = useState('');
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const requestKey = `${slug}:${revision}`;
  const loading = settledRequest !== requestKey;

  useEffect(() => {
    const controller = new AbortController();

    void fetchWorkspace(slug, controller.signal)
      .then((result) => {
        setWorkspace(result);
        setRequestError(null);
        setSettledRequest(requestKey);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setWorkspace(null);
        setRequestError(
          error instanceof Error ? error.message : 'No fue posible cargar el módulo operativo.',
        );
        setSettledRequest(requestKey);
      });

    return () => controller.abort();
  }, [requestKey, slug]);

  const activeWorkspace = workspace?.slug === slug ? workspace : null;

  return {
    workspace: activeWorkspace,
    loading,
    error: loading ? null : requestError,
    reload,
  };
}
