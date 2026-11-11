import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';
import AppointmentFormWrapper from '../AppointmentFormWrapper';

vi.mock('../../../adapters/DateInput', () => ({
  DateInput: ({ label, value }) => (
    <input aria-label={label} readOnly value={value ? 'set' : ''} />
  ),
}));
vi.mock('../../practitioners/PractitionerSelectWithCreate', () => ({
  default: ({ label }) => <div>{label}</div>,
}));
vi.mock('../../../common/TagInput', () => ({ TagInput: () => null }));
vi.mock('../../../../services/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const baseForm = {
  title: '',
  date: '',
  time: '',
  duration_minutes: '',
  appointment_type: '',
  status: 'scheduled',
  practitioner_id: '',
  practice_id: '',
  location: '',
  reminder_enabled: true,
  reminder_offsets_minutes: [1440],
  notes: '',
  tags: [],
};

const renderForm = (formData = baseForm, props = {}) =>
  render(
    <MantineProvider>
      <AppointmentFormWrapper
        isOpen
        onClose={vi.fn()}
        title="Add Appointment"
        formData={formData}
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
        {...props}
      />
    </MantineProvider>
  );

describe('AppointmentFormWrapper', () => {
  it('disables save until title, date and time are set', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Save Appointment' })).toBeDisabled();
  });

  it('enables save with the required fields', () => {
    renderForm({ ...baseForm, title: 'Dentist', date: '2030-05-01', time: '10:00' });
    expect(screen.getByRole('button', { name: 'Save Appointment' })).toBeEnabled();
  });

  it('reports title changes through onInputChange', async () => {
    const onInputChange = vi.fn();
    renderForm(baseForm, { onInputChange });
    await userEvent.type(screen.getByLabelText(/Title/), 'D');
    expect(onInputChange).toHaveBeenCalledWith({ target: { name: 'title', value: 'D' } });
  });

  it('shows the reminders tab', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('tab', { name: 'Reminders' }));
    expect(screen.getByText('Send reminders')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    renderForm(baseForm, { isOpen: false });
    expect(screen.queryByRole('button', { name: 'Save Appointment' })).toBeNull();
  });
});
