import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';
import PrescriptionCard, { getExpiryBadge } from '../PrescriptionCard';

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
  id: 4,
  title: 'Cardiology referral',
  prescription_type: 'referral',
  prescription_number: '1500A4001234567',
  issued_date: '2030-01-10',
  expiry_date: '2099-01-10',
  status: 'active',
  priority: 'B',
  exemption_code: '048',
  items: [{ description: 'Cardiology visit' }, { description: 'ECG' }],
  notes: '',
  tags: [],
};

describe('PrescriptionCard', () => {
  it('shows the generic fields with their values', () => {
    render(
      <MantineProvider>
        <PrescriptionCard
          prescription={base}
          practitionerName="Dr. Bianchi"
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onView={vi.fn()}
        />
      </MantineProvider>
    );
    expect(screen.getByText('Cardiology referral')).toBeInTheDocument();
    expect(screen.getByText('Specialist referral')).toBeInTheDocument();
    expect(screen.getByText('Not used yet')).toBeInTheDocument();
    expect(screen.getByText('1500A4001234567')).toBeInTheDocument();
    expect(screen.getByText('Dr. Bianchi')).toBeInTheDocument();
    expect(screen.getByText('048')).toBeInTheDocument();
    expect(screen.getByText('Cardiology visit, ECG')).toBeInTheDocument();
  });
});

describe('getExpiryBadge', () => {
  const today = '2030-03-10';
  it.each([
    ['2030-03-09', 'Expired', 'red'],
    ['2030-03-10', 'Expires today', 'red'],
    ['2030-03-13', 'Expires in 3 days', 'orange'],
  ])('expiry %s -> %s', (expiry, label, color) => {
    expect(getExpiryBadge({ ...base, expiry_date: expiry }, t, today)).toEqual({ label, color });
  });

  it('is null when far, used, or without expiry', () => {
    expect(getExpiryBadge({ ...base, expiry_date: '2030-04-30' }, t, today)).toBeNull();
    expect(getExpiryBadge({ ...base, status: 'used', expiry_date: today }, t, today)).toBeNull();
    expect(getExpiryBadge({ ...base, expiry_date: null }, t, today)).toBeNull();
  });
});
