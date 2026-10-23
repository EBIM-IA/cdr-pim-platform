import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SharedCatalogView } from './shared-catalog-view';

const token = 'c'.repeat(43);
const otherToken = 'd'.repeat(43);
const catalog = {
  title: 'Catálogo de rodamientos',
  description: 'Selección industrial para el cliente.',
  fileName: 'rodamientos.pdf',
  fileSize: 12,
  validFrom: '2026-10-01',
  validUntil: '2026-12-31',
  expiresAt: '2026-11-01T12:00:00.000Z',
};
const fetcher = vi.fn();
const createObjectURL = vi.fn(() => 'blob:http://localhost/catalog-pdf');
const revokeObjectURL = vi.fn();
const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, '', `/shared/catalogs#${token}`);
  vi.stubGlobal('fetch', fetcher);
  fetcher.mockImplementation(async () => Response.json(catalog));
  createObjectURL.mockReturnValue('blob:http://localhost/catalog-pdf');
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('shared catalog page', () => {
  it('loads metadata with an anonymous POST while keeping the reloadable token only in the fragment', async () => {
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    render(<SharedCatalogView />);
    expect(await screen.findByRole('heading', { name: catalog.title })).toBeVisible();
    expect(screen.getByText(catalog.description)).toBeVisible();
    expect(screen.getByText(/Desde 1 de octubre de 2026/)).toBeVisible();
    expect(window.location.hash).toBe(`#${token}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/shared/catalogs/resolve');
    expect(url).not.toContain(token);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ token }));
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
    expect(persist).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain(token);
  });

  it.each(['/shared/catalogs', '/shared/catalogs?token=ignored', '/shared/catalogs#invalid'])(
    'rejects an absent or invalid fragment without a request (%s)',
    async (path) => {
      window.history.replaceState({}, '', path);
      render(<SharedCatalogView />);
      expect(await screen.findByRole('heading', { name: 'Catálogo no disponible' })).toBeVisible();
      expect(fetcher).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Descargar PDF' })).not.toBeInTheDocument();
    },
  );

  it('explains expired or revoked links and does not offer a file', async () => {
    fetcher.mockResolvedValue(
      Response.json({ message: 'El enlace no está disponible o ha vencido.' }, { status: 410 }),
    );
    render(<SharedCatalogView />);
    expect(await screen.findByText('El enlace no está disponible o ha vencido.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Descargar PDF' })).not.toBeInTheDocument();
  });

  it('requests a real PDF only after a click and exposes safe download and open links', async () => {
    fetcher
      .mockResolvedValueOnce(Response.json(catalog))
      .mockResolvedValueOnce(
        new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } }),
      );
    const { container, unmount } = render(<SharedCatalogView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Descargar PDF' }));
    expect(await screen.findByRole('link', { name: 'Abrir PDF' })).toHaveAttribute(
      'href',
      'blob:http://localhost/catalog-pdf',
    );
    expect(screen.getByRole('link', { name: 'Abrir PDF' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(screen.getByRole('link', { name: 'Abrir PDF' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Descargar PDF' })).toHaveAttribute(
      'download',
      catalog.fileName,
    );
    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/shared/catalogs/file');
    expect(init.body).toBe(JSON.stringify({ token }));
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
    expect(container.querySelector('iframe, object')).toBeNull();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/catalog-pdf');
  });

  it('rejects a non-PDF response and keeps download available for another attempt', async () => {
    fetcher
      .mockResolvedValueOnce(Response.json(catalog))
      .mockResolvedValueOnce(
        new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }),
      );
    render(<SharedCatalogView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Descargar PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El archivo recibido no tiene el formato PDF esperado.',
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled();
  });

  it('handles a link revoked between loading its metadata and requesting its PDF', async () => {
    fetcher
      .mockResolvedValueOnce(Response.json(catalog))
      .mockResolvedValueOnce(
        Response.json({ message: 'El enlace no está disponible o ha vencido.' }, { status: 410 }),
      );
    render(<SharedCatalogView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Descargar PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El enlace no está disponible o ha vencido.',
    );
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('releases a previous PDF when the fragment changes and resolves the new share independently', async () => {
    fetcher
      .mockResolvedValueOnce(Response.json(catalog))
      .mockResolvedValueOnce(
        new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } }),
      )
      .mockResolvedValueOnce(Response.json({ ...catalog, title: 'Otro catálogo' }));
    render(<SharedCatalogView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Descargar PDF' }));
    await screen.findByRole('link', { name: 'Abrir PDF' });
    await act(async () => {
      window.history.replaceState({}, '', `/shared/catalogs#${otherToken}`);
      window.dispatchEvent(new Event('hashchange'));
    });
    expect(await screen.findByRole('heading', { name: 'Otro catálogo' })).toBeVisible();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/catalog-pdf');
    expect(screen.queryByRole('link', { name: 'Abrir PDF' })).not.toBeInTheDocument();
    expect(fetcher.mock.calls[2]![0]).toBe('/api/shared/catalogs/resolve');
    expect(fetcher.mock.calls[2]![1].body).toBe(JSON.stringify({ token: otherToken }));
  });

  it('aborts a pending PDF request when the page unmounts', async () => {
    fetcher
      .mockResolvedValueOnce(Response.json(catalog))
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    const { unmount } = render(<SharedCatalogView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const signal = fetcher.mock.calls[1]![1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
