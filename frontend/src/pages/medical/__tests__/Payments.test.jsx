import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';

const { useMedicalData, createItem, updateItem, refreshData, setError } = vi.hoisted(() => ({
  useMedicalData: vi.fn(),
  createItem: vi.fn(() => Promise.resolve({ id: 99 })),
  updateItem: vi.fn(() => Promise.resolve(true)),
  refreshData: vi.fn(() => Promise.resolve()),
  setError: vi.fn(),
}));

vi.mock('../../../hooks/useMedicalData', () => ({ useMedicalData }));
vi.mock('../../../hooks/useDateFormat', () => ({
  useDateFormat: () => ({ formatDate: v => v, formatDateTime: v => v }),
}));
vi.mock('../../../hooks/useViewModalNavigation', () => ({
  useViewModalNavigation: () => ({
    isOpen: false,
    viewingItem: null,
    openModal: vi.fn(),
    closeModal: vi.fn(),
  }),
}));
vi.mock('../../../hooks/usePersistedViewMode', () => ({
  usePersistedViewMode: () => ['cards', vi.fn()],
}));
vi.mock('../../../hooks/usePagination', () => ({
  usePagination: () => ({
    page: 1,
    setPage: vi.fn(),
    pageSize: 20,
    handlePageSizeChange: vi.fn(),
    paginateData: data => data,
    totalPages: () => 1,
    resetPage: vi.fn(),
    clampPage: vi.fn(),
    PAGE_SIZE_OPTIONS: [{ value: '20', label: '20' }],
  }),
}));
vi.mock('../../../hooks/usePatientPermissions', () => ({
  usePatientPermissions: () => ({ isViewOnly: false, viewOnlyTooltip: undefined }),
}));
vi.mock('../../../hooks/useGlobalData', () => ({
  usePractices: () => ({ practices: [{ id: 3, name: 'City Hospital' }] }),
}));
vi.mock('../../../hooks/useSchedulingLinks', () => ({
  useSchedulingLinks: () => ({ appointments: [], medications: [], prescriptions: [] }),
}));
vi.mock('../../../services/api/schedulingApi', () => ({ paymentApi: {} }));
vi.mock('../../../services/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../hoc/withResponsive', () => ({ withResponsive: C => C }));
vi.mock('../../../components', () => ({ PageHeader: ({ title }) => <h1>{title}</h1> }));
vi.mock('../../../components/shared/PaginationControls', () => ({ default: () => null }));
vi.mock('../../../components/shared/MedicalPageFilters', () => ({ default: () => null }));
vi.mock('../../../components/shared/MedicalPageActions', () => ({
  default: ({ primaryAction }) => (
    <button onClick={primaryAction?.onClick}>{primaryAction?.label}</button>
  ),
}));
vi.mock('../../../components/shared/EmptyState', () => ({
  default: ({ title }) => <div data-testid="empty-state">{title}</div>,
}));
vi.mock('../../../components/shared/MedicalPageAlerts', () => ({ default: () => null }));
vi.mock('../../../components/shared/MedicalPageLoading', () => ({ default: () => null }));
vi.mock('../../../components/shared/AnimatedCardGrid', () => ({
  default: ({ items, renderCard }) => (
    <div>
      {items.map(item => (
        <div key={item.id}>{renderCard(item)}</div>
      ))}
    </div>
  ),
}));
vi.mock('../../../components/medical/payments', () => ({
  PaymentCard: ({ payment, practiceName, onEdit }) => (
    <button onClick={() => onEdit(payment)}>
      edit-{payment.id} {practiceName}
    </button>
  ),
  PaymentViewModal: () => null,
  PaymentSummaryCard: ({ patientId }) => <div data-testid="summary">{patientId}</div>,
  PaymentFormWrapper: ({ isOpen, formData, onInputChange, onSubmit }) => {
    if (!isOpen) return null;
    const set = (name, value) => onInputChange({ target: { name, value } });
    return (
      <form onSubmit={onSubmit}>
        <input data-testid="description" value={formData.description} onChange={e => set('description', e.target.value)} />
        <input data-testid="amount" value={formData.amount} onChange={e => set('amount', e.target.value)} />
        <input data-testid="currency" value={formData.currency} onChange={e => set('currency', e.target.value)} />
        <button type="submit">submit</button>
      </form>
    );
  },
}));

import Payments, { paymentToForm, formToPaymentPayload } from '../Payments';

const existing = {
  id: 1,
  description: 'Copay',
  amount: 36.15,
  currency: 'EUR',
  payment_type: 'copay',
  status: 'due',
  due_date: '2030-04-01',
  paid_date: null,
  practice_id: 3,
  tax_deductible: false,
  reminder_enabled: true,
  due_reminder_days: [3],
  tags: [],
};

const setup = (items = [existing]) =>
  useMedicalData.mockReturnValue({
    items,
    currentPatient: { id: 7 },
    loading: false,
    error: null,
    successMessage: null,
    createItem,
    updateItem,
    deleteItem: vi.fn(),
    refreshData,
    clearError: vi.fn(),
    setError,
  });

const renderPage = () =>
  render(
    <MantineProvider>
      <MemoryRouter>
        <Payments />
      </MemoryRouter>
    </MantineProvider>
  );

describe('Payments page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it('shows the summary and practice names', () => {
    renderPage();
    expect(screen.getByTestId('summary')).toHaveTextContent('7');
    expect(screen.getByText(/edit-1 City Hospital/)).toBeInTheDocument();
  });

  it('creates a payment with defaults', async () => {
    renderPage();
    await userEvent.click(screen.getByText('+ Add Payment'));
    await userEvent.type(screen.getByTestId('description'), 'Blood tests');
    await userEvent.type(screen.getByTestId('amount'), '36.1');
    await userEvent.click(screen.getByText('submit'));
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0][0]).toMatchObject({
      description: 'Blood tests',
      amount: '36.10',
      currency: 'EUR',
      payment_type: 'copay',
      status: 'due',
      tax_deductible: false,
      due_reminder_days: [3, 1],
      patient_id: 7,
    });
  });

  it('validates amount and currency', async () => {
    renderPage();
    await userEvent.click(screen.getByText('+ Add Payment'));
    await userEvent.type(screen.getByTestId('description'), 'Visit');
    await userEvent.click(screen.getByText('submit'));
    expect(setError).toHaveBeenCalledWith('Enter a valid amount');

    await userEvent.type(screen.getByTestId('amount'), '10');
    await userEvent.clear(screen.getByTestId('currency'));
    await userEvent.type(screen.getByTestId('currency'), 'EURO');
    await userEvent.click(screen.getByText('submit'));
    expect(setError).toHaveBeenCalledWith('3-letter code, e.g. EUR');
    expect(createItem).not.toHaveBeenCalled();
  });

  it('edits an existing payment', async () => {
    renderPage();
    await userEvent.click(screen.getByText(/edit-1/));
    await userEvent.click(screen.getByText('submit'));
    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1));
    expect(updateItem.mock.calls[0][1]).toMatchObject({
      amount: '36.15',
      practice_id: 3,
      due_reminder_days: [3],
    });
  });
});

describe('payment form mapping', () => {
  it('maps to form and back', () => {
    const form = paymentToForm(existing);
    expect(form.paid_date).toBe('');
    const payload = formToPaymentPayload({ ...form, currency: ' usd ', payee: ' ' }, 2);
    expect(payload).toMatchObject({ currency: 'USD', payee: null, paid_date: null, patient_id: 2 });
  });
});
