import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';

const { getSummary } = vi.hoisted(() => ({ getSummary: vi.fn() }));

vi.mock('../../../../services/api/schedulingApi', () => ({ paymentApi: { getSummary } }));
vi.mock('../../../../services/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import PaymentSummaryCard from '../PaymentSummaryCard';

describe('PaymentSummaryCard', () => {
  beforeEach(() => {
    getSummary.mockReset();
  });

  it('loads the current year and shows totals per currency', async () => {
    getSummary.mockResolvedValue([
      { currency: 'EUR', total_paid: 150.5, total_due: 20, total_tax_deductible_paid: 100, count: 3 },
      { currency: 'USD', total_paid: 30, total_due: 0, total_tax_deductible_paid: 0, count: 1 },
    ]);
    render(
      <MantineProvider>
        <PaymentSummaryCard patientId={7} refreshKey={1} />
      </MantineProvider>
    );
    await waitFor(() =>
      expect(getSummary).toHaveBeenCalledWith(7, new Date().getFullYear(), expect.anything())
    );
    expect(await screen.findByText(/150[.,]50/)).toBeInTheDocument();
    expect(screen.getByText(/\$30\.00/)).toBeInTheDocument();
    expect(screen.getByText(/20[.,]00/)).toBeInTheDocument();
    expect(screen.getByText(/100[.,]00/)).toBeInTheDocument();
  });

  it('does nothing without a patient', () => {
    render(
      <MantineProvider>
        <PaymentSummaryCard patientId={null} />
      </MantineProvider>
    );
    expect(getSummary).not.toHaveBeenCalled();
  });
});
