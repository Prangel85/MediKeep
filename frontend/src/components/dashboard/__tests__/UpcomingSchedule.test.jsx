import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';

const { getUpcoming, getExpiring, getDue, navigate } = vi.hoisted(() => ({
  getUpcoming: vi.fn(),
  getExpiring: vi.fn(),
  getDue: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../../../services/api/schedulingApi', () => ({
  appointmentApi: { getUpcoming },
  prescriptionApi: { getExpiring },
  paymentApi: { getDue },
}));
vi.mock('../../../hooks/useDateFormat', () => ({
  useDateFormat: () => ({ formatDate: v => `d:${v}`, formatDateTime: v => `dt:${v}` }),
}));
vi.mock('../../../services/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

import UpcomingSchedule, { buildScheduleItems, WINDOW_DAYS } from '../UpcomingSchedule';

const renderWidget = (patientId = 7) =>
  render(
    <MantineProvider>
      <MemoryRouter>
        <UpcomingSchedule patientId={patientId} />
      </MemoryRouter>
    </MantineProvider>
  );

describe('UpcomingSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUpcoming.mockResolvedValue([
      { id: 1, title: 'Cardiology', scheduled_at: '2030-03-12T09:00:00+00:00' },
    ]);
    getExpiring.mockResolvedValue([{ id: 2, title: 'MRI referral', expiry_date: '2030-03-11' }]);
    getDue.mockResolvedValue([
      { id: 3, description: 'Copay', amount: 36.15, currency: 'EUR', due_date: '2099-03-15' },
    ]);
  });

  it('loads the three sources for the patient and lists them by date', async () => {
    renderWidget();
    await screen.findByText('Cardiology');
    expect(getUpcoming).toHaveBeenCalledWith(7, WINDOW_DAYS, expect.anything());
    expect(getExpiring).toHaveBeenCalledWith(7, WINDOW_DAYS, expect.anything());
    expect(getDue).toHaveBeenCalledWith(7, WINDOW_DAYS, expect.anything());

    const titles = screen.getAllByText(/Cardiology|MRI referral|Copay/).map(el => el.textContent);
    expect(titles).toEqual(['MRI referral', 'Cardiology', 'Copay']);
    expect(screen.getByText('Expires d:2030-03-11')).toBeInTheDocument();
    expect(screen.getByText(/due d:2099-03-15/)).toBeInTheDocument();
  });

  it('navigates to the record when clicked', async () => {
    renderWidget();
    await userEvent.click(await screen.findByText('Copay'));
    expect(navigate).toHaveBeenCalledWith('/payments?view=3');
  });

  it('still shows the other sources when one fails', async () => {
    getExpiring.mockRejectedValue(new Error('500'));
    renderWidget();
    expect(await screen.findByText('Cardiology')).toBeInTheDocument();
    expect(screen.queryByText('MRI referral')).toBeNull();
  });

  it('shows an empty message', async () => {
    getUpcoming.mockResolvedValue([]);
    getExpiring.mockResolvedValue([]);
    getDue.mockResolvedValue([]);
    renderWidget();
    expect(await screen.findByText(/No appointments, expiring prescriptions/)).toBeInTheDocument();
  });

  it('renders nothing without a patient', async () => {
    renderWidget(null);
    await waitFor(() => expect(getUpcoming).not.toHaveBeenCalled());
    expect(screen.queryByText('Upcoming')).toBeNull();
  });
});

describe('buildScheduleItems', () => {
  it('merges and sorts by date', () => {
    const items = buildScheduleItems({
      appointments: [{ id: 1, title: 'B', scheduled_at: '2030-01-02T10:00:00+00:00' }],
      prescriptions: [{ id: 1, title: 'A', expiry_date: '2030-01-01' }],
      payments: [{ id: 1, description: 'C', due_date: '2030-01-03' }],
    });
    expect(items.map(i => `${i.kind}:${i.title}`)).toEqual([
      'prescription:A',
      'appointment:B',
      'payment:C',
    ]);
  });
});
