import type { WorkspaceQuery } from '@cdr/contracts';

/** Keep the browser and server proxy serialization identical, including repeated field keys. */
export function workspaceQueryParams(query: WorkspaceQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((field) => params.append(key, String(field)));
    else if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params;
}
