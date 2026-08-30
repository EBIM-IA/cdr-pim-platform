import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge';
import { Button } from './button';

describe('ui primitives', () => {
  it('renders a badge with its variant styling', () => {
    render(<Badge variant="success">operativo</Badge>);
    const badge = screen.getByText('operativo');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-emerald-600');
  });

  it('lets a caller override conflicting utility classes', () => {
    // The point of `cn`: the caller's class wins instead of both ending up in the DOM.
    render(<Button className="bg-slate-200">Guardar</Button>);
    const classes = screen.getByRole('button', { name: 'Guardar' }).className.split(/\s+/);
    expect(classes).toContain('bg-slate-200');
    // The base background is dropped entirely; the hover variant is a different property
    // and legitimately survives.
    expect(classes).not.toContain('bg-primary');
    expect(classes).toContain('hover:bg-primary/90');
  });

  it('forwards the disabled attribute', () => {
    render(<Button disabled>Publicar</Button>);
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  });
});
