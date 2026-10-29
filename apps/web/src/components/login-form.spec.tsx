import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from './login-form';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => vi.clearAllMocks());

describe('LoginForm', () => {
  it('renders a POST form with disabled controls before hydration', () => {
    const serverMarkup = document.createElement('div');
    serverMarkup.innerHTML = renderToString(<LoginForm returnTo="/" />);
    expect(serverMarkup.querySelector('form')).toHaveAttribute('method', 'post');
    expect(serverMarkup.querySelector('input[name="email"]')).toBeDisabled();
    expect(serverMarkup.querySelector('input[name="password"]')).toBeDisabled();
    expect(serverMarkup.querySelector('button[type="submit"]')).toBeDisabled();
  });

  it('enables the hydrated form and submits credentials only in the POST body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ redirectTo: '/products' }));
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<LoginForm returnTo="/products" />);
    const submit = screen.getByRole('button', { name: 'Iniciar sesión' });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'person@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña', { exact: true }), {
      target: { value: 'development-test-password' },
    });
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/products'));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'person@example.test',
        password: 'development-test-password',
        returnTo: '/products',
      }),
    });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});
