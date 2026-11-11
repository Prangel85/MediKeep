import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';
import PrescriptionFormWrapper from '../PrescriptionFormWrapper';

vi.mock('../../../adapters/DateInput', () => ({
  DateInput: ({ label }) => <input aria-label={label} readOnly />,
}));
vi.mock('../../practitioners/PractitionerSelectWithCreate', () => ({
  default: ({ label }) => <div>{label}</div>,
}));
vi.mock('../../../common/TagInput', () => ({ TagInput: () => null }));
vi.mock('../../../../hooks/useDateFormat', () => ({
  useDateFormat: () => ({ formatDateTime: v => v }),
}));
vi.mock('../../../../services/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const form = {
  title: '',
  prescription_type: 'exam',
  status: 'active',
  issued_date: '',
  items: [],
  reminder_enabled: true,
  expiry_reminder_days: [7, 1],
  tags: [],
};

const renderForm = formData =>
  render(
    <MantineProvider>
      <PrescriptionFormWrapper
        isOpen
        onClose={vi.fn()}
        title="Add Prescription"
        formData={formData}
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    </MantineProvider>
  );

describe('PrescriptionFormWrapper', () => {
  it('requires title, type and issue date', () => {
    renderForm(form);
    expect(screen.getByRole('button', { name: 'Save Prescription' })).toBeDisabled();
  });

  it('enables save when complete and shows the generic fields', () => {
    renderForm({ ...form, title: 'MRI', issued_date: '2030-01-01' });
    expect(screen.getByRole('button', { name: 'Save Prescription' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Priority' })).toBeInTheDocument();
    expect(screen.getByLabelText('Exemption')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Number/)).toBeInTheDocument();
  });

  it('has items and reminders tabs', async () => {
    renderForm(form);
    await userEvent.click(screen.getByRole('tab', { name: 'Items' }));
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Reminders' }));
    expect(screen.getByText('Send reminders')).toBeInTheDocument();
  });
});
