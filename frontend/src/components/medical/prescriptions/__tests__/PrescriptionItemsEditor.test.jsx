import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';
import PrescriptionItemsEditor from '../PrescriptionItemsEditor';

const renderEditor = (items, onChange = vi.fn()) => {
  render(
    <MantineProvider>
      <PrescriptionItemsEditor items={items} onChange={onChange} />
    </MantineProvider>
  );
  return onChange;
};

describe('PrescriptionItemsEditor', () => {
  it('shows the empty hint and adds an item', async () => {
    const onChange = renderEditor([]);
    expect(screen.getByText(/No items yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(onChange).toHaveBeenCalledWith([{ description: '', code: '', quantity: '' }]);
  });

  it('edits and removes items', async () => {
    const items = [
      { description: 'CBC', code: '', quantity: '' },
      { description: 'Glucose', code: '', quantity: '' },
    ];
    const onChange = renderEditor(items);
    await userEvent.type(screen.getAllByLabelText('Code')[0], 'X');
    expect(onChange).toHaveBeenLastCalledWith([
      { description: 'CBC', code: 'X', quantity: '' },
      items[1],
    ]);
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove item' })[0]);
    expect(onChange).toHaveBeenLastCalledWith([items[1]]);
  });
});
