import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScreenGuide } from './screen-guide';

vi.mock('next/navigation', () => ({
  usePathname: () => '/products',
}));

const props = {
  objective: 'Resume el alcance funcional de la pantalla.',
  actions: ['Consultar los datos persistidos.'],
  dataSource: 'API operativa del PIM.',
} as const;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('ScreenGuide', () => {
  it('starts collapsed so product data remains the primary content', () => {
    const view = render(<ScreenGuide {...props} />);
    const rendered = within(view.container);

    const summary = rendered.getByText('¿Qué es esta pantalla?').closest('summary');
    const details = summary?.closest('details');

    expect(details).not.toHaveAttribute('open');
    expect(summary).not.toHaveTextContent(props.objective);
    expect(rendered.getByText(props.objective)).toBeInTheDocument();
  });

  it('opens on demand and persists the preference for the current screen', async () => {
    const view = render(<ScreenGuide {...props} />);
    const rendered = within(view.container);

    const summary = rendered.getByText('¿Qué es esta pantalla?').closest('summary');
    const details = summary?.closest('details');
    expect(summary).not.toBeNull();

    fireEvent.click(summary as HTMLElement);

    await waitFor(() => expect(details).toHaveAttribute('open'));
    expect(window.localStorage.getItem('cdr:screen-guide:/products')).toBe('open');
  });
});
