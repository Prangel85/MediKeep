import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';
import PaymentCard, { getDueBadge } from '../PaymentCard';
import { isValidCurrency } from '../PaymentFormWrapper';

vi.mock('../../../../hooks/useDateFormat', () => ({
  useDateFormat: () => ({ formatDate: v => (v ? `d:${v}` : '') }),
}));
vi.mock('../../../../services/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const t = (key, opts) =>
  typeof opts === 'string'
    ? opts
    : (opts?.defaultValue || key).replace('{{count}}', opts?.count);

const base = {
  id: 2,
  description: 'Physiotherapy session',
  amount: 45.5,
  currency: 'EUR',
  payment_type: 'private',
  status: 'paid',
  due_date: null,
  paid_date: '2030-02-01',
  payment_method: 'card',
  payee: 'Studio Fisio',
  tax_deductible: true,
  notes: '',
  tags: [],
};

describe('PaymentCard', () => {
  it('shows amount, badges and fields', () => {
    render(
      <MantineProvider>
        <PaymentCard payment={base} onEdit={vi.fn()} onDelete={vi.fn()} onView={vi.fn()} />
      </MantineProvider>
    );
    expect(screen.getByText('Physiotherapy session')).toBeInTheDocument();
    expect(screen.getAllByText(/45[.,]50/).length).toBeGreaterThan(0);
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
    expect(screen.getByText('Tax deductible')).toBeInTheDocument();
    expect(screen.getByText('Studio Fisio')).toBeInTheDocument();
    expect(screen.getByText('Card')).toBeInTheDocument();
  });

  it('prefers the practice name over free-text payee', () => {
    render(
      <MantineProvider>
        <PaymentCard
          payment={base}
          practiceName="City Hospital"
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onView={vi.fn()}
        />
      </MantineProvider>
    );
    expect(screen.getByText('City Hospital')).toBeInTheDocument();
    expect(screen.queryByText('Studio Fisio')).toBeNull();
  });
});

describe('getDueBadge', () => {
  const today = '2030-03-10';
  it.each([
    ['2030-03-01', 'Overdue', 'red'],
    ['2030-03-10', 'Due today', 'red'],
    ['2030-03-12', 'Due in 2 days', 'orange'],
  ])('due %s -> %s', (due, label, color) => {
    expect(getDueBadge({ ...base, status: 'due', due_date: due }, t, today)).toEqual({
      label,
      color,
    });
  });

  it('is null when paid, far away or without due date', () => {
    expect(getDueBadge({ ...base, status: 'paid', due_date: today }, t, today)).toBeNull();
    expect(getDueBadge({ ...base, status: 'due', due_date: '2030-05-01' }, t, today)).toBeNull();
    expect(getDueBadge({ ...base, status: 'due', due_date: null }, t, today)).toBeNull();
  });
});

describe('isValidCurrency', () => {
  it.each([
    ['EUR', true],
    ['usd', true],
    ['EU', false],
    ['EURO', false],
    ['', false],
    ['€', false],
  ])('%s -> %s', (value, expected) => {
    expect(isValidCurrency(value)).toBe(expected);
  });
});
