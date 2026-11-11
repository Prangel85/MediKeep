import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';
import AppointmentCard, { canComplete } from '../AppointmentCard';

vi.mock('../../../../hooks/useDateFormat', () => ({
  useDateFormat: () => ({ formatDateTime: v => (v ? `dt:${v}` : '') }),
}));
vi.mock('../../../../services/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const base = {
  id: 3,
  title: 'Cardiology check-up',
  scheduled_at: '2030-03-11T09:00:00+00:00',
  status: 'scheduled',
  appointment_type: 'visit',
  location: 'Room 2',
  duration_minutes: 30,
  encounter_id: null,
  notes: '',
  tags: [],
};

const renderCard = (props = {}) =>
  render(
    <MantineProvider>
      <AppointmentCard
        appointment={base}
        practitionerName="Dr. Rossi"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onView={vi.fn()}
        {...props}
      />
    </MantineProvider>
  );

describe('AppointmentCard', () => {
  it('shows title, date, badges and fields', () => {
    renderCard();
    expect(screen.getByText('Cardiology check-up')).toBeInTheDocument();
    expect(screen.getByText('dt:2030-03-11T09:00:00+00:00')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Visit')).toBeInTheDocument();
    expect(screen.getByText('Dr. Rossi')).toBeInTheDocument();
    expect(screen.getByText('Room 2')).toBeInTheDocument();
  });

  it('offers "mark as completed" for an open appointment', async () => {
    const onComplete = vi.fn();
    const onView = vi.fn();
    renderCard({ onComplete, onView });
    await userEvent.click(screen.getByRole('button', { name: 'Mark as completed' }));
    expect(onComplete).toHaveBeenCalledWith(base);
    expect(onView).not.toHaveBeenCalled();
  });

  it('hides "mark as completed" when already linked or cancelled', () => {
    renderCard({ appointment: { ...base, encounter_id: 9 }, onComplete: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Mark as completed' })).toBeNull();
  });
});

describe('canComplete', () => {
  it.each([
    [{ status: 'scheduled', encounter_id: null }, true],
    [{ status: 'confirmed', encounter_id: null }, true],
    [{ status: 'cancelled', encounter_id: null }, false],
    [{ status: 'completed', encounter_id: null }, false],
    [{ status: 'scheduled', encounter_id: 4 }, false],
  ])('%o -> %s', (appointment, expected) => {
    expect(canComplete(appointment)).toBe(expected);
  });
});
