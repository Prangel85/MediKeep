import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';

const {
  useMedicalData,
  createItem,
  updateItem,
  deleteItem,
  refreshData,
  clearError,
  setError,
  setSuccessMessage,
  completeApi,
} = vi.hoisted(() => ({
  useMedicalData: vi.fn(),
  createItem: vi.fn(() => Promise.resolve({ id: 99 })),
  updateItem: vi.fn(() => Promise.resolve(true)),
  deleteItem: vi.fn(() => Promise.resolve(true)),
  refreshData: vi.fn(() => Promise.resolve()),
  clearError: vi.fn(),
  setError: vi.fn(),
  setSuccessMessage: vi.fn(),
  completeApi: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../../../hooks/useMedicalData', () => ({ useMedicalData }));
vi.mock('../../../hooks/useDateFormat', () => ({
  useDateFormat: () => ({ formatDateTime: v => v, formatDate: v => v }),
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
  usePractitioners: () => ({ practitioners: [{ id: 5, name: 'Dr. Rossi' }] }),
  usePractices: () => ({ practices: [] }),
}));
vi.mock('../../../services/api/schedulingApi', () => ({
  appointmentApi: {
    getAll: vi.fn(),
    getByPatient: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    complete: completeApi,
  },
}));
vi.mock('../../../services/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../hoc/withResponsive', () => ({ withResponsive: C => C }));
vi.mock('../../../components', () => ({
  PageHeader: ({ title }) => <div data-testid="page-header">{title}</div>,
}));
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
vi.mock('../../../components/shared/MedicalPageLoading', () => ({
  default: ({ message }) => <div data-testid="loading">{message}</div>,
}));
vi.mock('../../../components/shared/AnimatedCardGrid', () => ({
  default: ({ items, renderCard }) => (
    <div>
      {items.map(item => (
        <div key={item.id}>{renderCard(item)}</div>
      ))}
    </div>
  ),
}));
vi.mock('../../../components/medical/appointments', () => ({
  AppointmentCard: ({ appointment, practitionerName, onEdit, onComplete }) => (
    <div data-testid={`card-${appointment.id}`}>
      {appointment.title} / {practitionerName}
      <button onClick={() => onEdit(appointment)}>edit-{appointment.id}</button>
      <button onClick={() => onComplete(appointment)}>complete-{appointment.id}</button>
    </div>
  ),
  AppointmentViewModal: () => null,
  AppointmentCompleteModal: ({ isOpen, appointment, onConfirm }) =>
    isOpen ? (
      <button onClick={() => onConfirm(appointment, { notes: 'ok' })}>confirm-complete</button>
    ) : null,
  AppointmentFormWrapper: ({ isOpen, formData, onInputChange, onSubmit }) => {
    if (!isOpen) return null;
    const set = (name, value) => onInputChange({ target: { name, value } });
    return (
      <form data-testid="form" onSubmit={onSubmit}>
        <input data-testid="title" value={formData.title} onChange={e => set('title', e.target.value)} />
        <input data-testid="date" value={formData.date} onChange={e => set('date', e.target.value)} />
        <input data-testid="time" value={formData.time} onChange={e => set('time', e.target.value)} />
        <span data-testid="reminders">{formData.reminder_offsets_minutes.join(',')}</span>
        <button type="submit">submit</button>
      </form>
    );
  },
}));

import Appointments, {
  appointmentToForm,
  formToAppointmentPayload,
} from '../Appointments';

const appointment = {
  id: 1,
  title: 'Cardiology',
  scheduled_at: '2030-03-11T09:00:00+00:00',
  status: 'scheduled',
  practitioner_id: 5,
  practice_id: null,
  appointment_type: 'visit',
  location: null,
  duration_minutes: null,
  reminder_enabled: true,
  reminder_offsets_minutes: [1440],
  notes: null,
  tags: [],
};

const setup = (items = [appointment]) =>
  useMedicalData.mockReturnValue({
    items,
    currentPatient: { id: 7 },
    loading: false,
    error: null,
    successMessage: null,
    createItem,
    updateItem,
    deleteItem,
    refreshData,
    clearError,
    setError,
    setSuccessMessage,
  });

const renderPage = () =>
  render(
    <MantineProvider>
      <MemoryRouter>
        <Appointments />
      </MemoryRouter>
    </MantineProvider>
  );

describe('Appointments page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it('renders cards with practitioner names', () => {
    renderPage();
    expect(screen.getByTestId('card-1')).toHaveTextContent('Cardiology / Dr. Rossi');
  });

  it('shows the empty state', () => {
    setup([]);
    renderPage();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('creates an appointment with default reminders', async () => {
    renderPage();
    await userEvent.click(screen.getByText('+ Add Appointment'));
    expect(screen.getByTestId('reminders')).toHaveTextContent('10080,1440,120');
    await userEvent.type(screen.getByTestId('title'), 'Dentist');
    await userEvent.type(screen.getByTestId('date'), '2030-05-01');
    await userEvent.type(screen.getByTestId('time'), '14:30');
    await userEvent.click(screen.getByText('submit'));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0][0]).toMatchObject({
      title: 'Dentist',
      scheduled_at: '2030-05-01T14:30:00',
      status: 'scheduled',
      reminder_enabled: true,
      reminder_offsets_minutes: [10080, 1440, 120],
      patient_id: 7,
    });
  });

  it('requires date and time', async () => {
    renderPage();
    await userEvent.click(screen.getByText('+ Add Appointment'));
    await userEvent.type(screen.getByTestId('title'), 'Dentist');
    await userEvent.click(screen.getByText('submit'));
    expect(setError).toHaveBeenCalledWith('Date and time are required');
    expect(createItem).not.toHaveBeenCalled();
  });

  it('marks an appointment as completed', async () => {
    renderPage();
    await userEvent.click(screen.getByText('complete-1'));
    await userEvent.click(screen.getByText('confirm-complete'));
    await waitFor(() => expect(completeApi).toHaveBeenCalledWith(1, { notes: 'ok' }));
    expect(refreshData).toHaveBeenCalled();
    expect(setSuccessMessage).toHaveBeenCalled();
  });

  it('reports a failed completion', async () => {
    completeApi.mockRejectedValueOnce(new Error('409'));
    renderPage();
    await userEvent.click(screen.getByText('complete-1'));
    await userEvent.click(screen.getByText('confirm-complete'));
    await waitFor(() =>
      expect(setError).toHaveBeenCalledWith('Could not mark the appointment as completed')
    );
  });
});

describe('form mapping', () => {
  it('round-trips through the form in the facility timezone', async () => {
    const { timezoneService } = await import('../../../services/timezoneService');
    vi.spyOn(timezoneService, 'getTimezone').mockReturnValue('Europe/Rome');
    const form = appointmentToForm(appointment);
    expect(form.date).toBe('2030-03-11');
    expect(form.time).toBe('10:00');
    expect(form.practitioner_id).toBe(5);

    const payload = formToAppointmentPayload({ ...form, location: '  ' }, 7);
    expect(payload).toMatchObject({
      scheduled_at: '2030-03-11T10:00:00',
      practitioner_id: 5,
      practice_id: null,
      location: null,
      duration_minutes: null,
      appointment_type: 'visit',
      patient_id: 7,
    });
  });
});
