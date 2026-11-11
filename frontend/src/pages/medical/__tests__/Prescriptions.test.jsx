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
  usePractitioners: () => ({ practitioners: [] }),
}));
vi.mock('../../../hooks/useSchedulingLinks', () => ({
  useSchedulingLinks: () => ({ appointments: [], medications: [], prescriptions: [] }),
}));
vi.mock('../../../services/api/schedulingApi', () => ({ prescriptionApi: {} }));
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
vi.mock('../../../components/medical/prescriptions', () => ({
  PrescriptionCard: ({ prescription, onEdit }) => (
    <button onClick={() => onEdit(prescription)}>edit-{prescription.id}</button>
  ),
  PrescriptionViewModal: () => null,
  PrescriptionFormWrapper: ({ isOpen, formData, onInputChange, onSubmit }) => {
    if (!isOpen) return null;
    const set = (name, value) => onInputChange({ target: { name, value } });
    return (
      <form onSubmit={onSubmit}>
        <input data-testid="title" value={formData.title} onChange={e => set('title', e.target.value)} />
        <input data-testid="issued" value={formData.issued_date} onChange={e => set('issued_date', e.target.value)} />
        <input data-testid="expiry" value={formData.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
        <button type="button" onClick={() => set('items', [{ description: ' CBC ', code: '', quantity: '2' }, { description: '  ' }])}>
          set-items
        </button>
        <button type="submit">submit</button>
      </form>
    );
  },
}));

import Prescriptions, { prescriptionToForm, formToPrescriptionPayload } from '../Prescriptions';

const existing = {
  id: 1,
  title: 'MRI',
  prescription_type: 'exam',
  issued_date: '2030-01-01',
  expiry_date: null,
  status: 'active',
  items: [{ description: 'MRI knee', code: null, quantity: null }],
  reminder_enabled: true,
  expiry_reminder_days: [7],
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
        <Prescriptions />
      </MemoryRouter>
    </MantineProvider>
  );

describe('Prescriptions page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it('creates a prescription, dropping blank items', async () => {
    renderPage();
    await userEvent.click(screen.getByText('+ Add Prescription'));
    await userEvent.type(screen.getByTestId('title'), 'Blood tests');
    await userEvent.type(screen.getByTestId('issued'), '2030-01-05');
    await userEvent.click(screen.getByText('set-items'));
    await userEvent.click(screen.getByText('submit'));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0][0]).toMatchObject({
      title: 'Blood tests',
      prescription_type: 'exam',
      issued_date: '2030-01-05',
      expiry_date: null,
      items: [{ description: 'CBC', code: null, quantity: 2 }],
      expiry_reminder_days: [7, 1],
      patient_id: 7,
    });
  });

  it('rejects an expiry before the issue date', async () => {
    renderPage();
    await userEvent.click(screen.getByText('+ Add Prescription'));
    await userEvent.type(screen.getByTestId('title'), 'X ray');
    await userEvent.type(screen.getByTestId('issued'), '2030-01-05');
    await userEvent.type(screen.getByTestId('expiry'), '2030-01-01');
    await userEvent.click(screen.getByText('submit'));
    expect(setError).toHaveBeenCalledWith('Expiry date cannot be before the issue date');
    expect(createItem).not.toHaveBeenCalled();
  });

  it('edits an existing prescription', async () => {
    renderPage();
    await userEvent.click(screen.getByText('edit-1'));
    await userEvent.click(screen.getByText('submit'));
    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1));
    expect(updateItem.mock.calls[0][0]).toBe(1);
    expect(updateItem.mock.calls[0][1]).toMatchObject({ title: 'MRI', expiry_reminder_days: [7] });
  });
});

describe('prescription form mapping', () => {
  it('maps nulls to empty form values and back', () => {
    const form = prescriptionToForm(existing);
    expect(form.expiry_date).toBe('');
    expect(form.items).toEqual([{ description: 'MRI knee', code: '', quantity: '' }]);
    const payload = formToPrescriptionPayload({ ...form, priority: ' U ' }, 3);
    expect(payload).toMatchObject({
      expiry_date: null,
      priority: 'U',
      practitioner_id: null,
      items: [{ description: 'MRI knee', code: null, quantity: null }],
      patient_id: 3,
    });
  });
});
