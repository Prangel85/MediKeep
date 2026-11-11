import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Stack, Container, Paper } from '@mantine/core';
import { useMedicalData } from '../../hooks/useMedicalData';
import { useViewModalNavigation } from '../../hooks/useViewModalNavigation';
import { usePersistedViewMode } from '../../hooks/usePersistedViewMode';
import { useResponsive } from '../../hooks/useResponsive';
import { usePagination } from '../../hooks/usePagination';
import { useDataManagement } from '../../hooks/useDataManagement';
import { useDateFormat } from '../../hooks/useDateFormat';
import { usePatientPermissions } from '../../hooks/usePatientPermissions';
import { usePractitioners, usePractices } from '../../hooks/useGlobalData';
import { appointmentApi } from '../../services/api/schedulingApi';
import logger from '../../services/logger';
import { PageHeader } from '../../components';
import { withResponsive } from '../../hoc/withResponsive';
import { ResponsiveTable } from '../../components/adapters';
import PaginationControls from '../../components/shared/PaginationControls';
import MedicalPageFilters from '../../components/shared/MedicalPageFilters';
import MedicalPageActions from '../../components/shared/MedicalPageActions';
import EmptyState from '../../components/shared/EmptyState';
import MedicalPageLoading from '../../components/shared/MedicalPageLoading';
import AnimatedCardGrid from '../../components/shared/AnimatedCardGrid';
import MedicalPageAlerts from '../../components/shared/MedicalPageAlerts';
import {
  AppointmentCard,
  AppointmentFormWrapper,
  AppointmentViewModal,
  AppointmentCompleteModal,
} from '../../components/medical/appointments';
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  DEFAULT_APPOINTMENT_REMINDERS,
  getOptionLabel,
  toSelectOptions,
} from '../../constants/schedulingConstants';
import {
  emptyToNull,
  facilityPartsToApi,
  idOrNull,
  toNumberOrNull,
  utcToFacilityParts,
} from '../../utils/schedulingUtils';

export const EMPTY_APPOINTMENT_FORM = {
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
  reminder_offsets_minutes: DEFAULT_APPOINTMENT_REMINDERS,
  notes: '',
  tags: [],
};

/** API record -> form state (facility-local date/time parts). */
export const appointmentToForm = appointment => {
  const { date, time } = utcToFacilityParts(appointment.scheduled_at);
  return {
    title: appointment.title || '',
    date,
    time,
    duration_minutes: appointment.duration_minutes ?? '',
    appointment_type: appointment.appointment_type || '',
    status: appointment.status || 'scheduled',
    practitioner_id: appointment.practitioner_id ?? '',
    practice_id: appointment.practice_id ?? '',
    location: appointment.location || '',
    reminder_enabled: appointment.reminder_enabled ?? true,
    reminder_offsets_minutes: appointment.reminder_offsets_minutes || [],
    notes: appointment.notes || '',
    tags: appointment.tags || [],
  };
};

/** Form state -> API payload. */
export const formToAppointmentPayload = (formData, patientId) => ({
  title: formData.title.trim(),
  scheduled_at: facilityPartsToApi(formData.date, formData.time),
  duration_minutes: toNumberOrNull(formData.duration_minutes),
  appointment_type: emptyToNull(formData.appointment_type),
  status: formData.status || 'scheduled',
  practitioner_id: idOrNull(formData.practitioner_id),
  practice_id: idOrNull(formData.practice_id),
  location: emptyToNull(formData.location?.trim()),
  reminder_enabled: !!formData.reminder_enabled,
  reminder_offsets_minutes: formData.reminder_offsets_minutes || [],
  notes: emptyToNull(formData.notes),
  tags: formData.tags || [],
  patient_id: patientId,
});

const Appointments = () => {
  const responsive = useResponsive();
  const { t } = useTranslation(['medical', 'shared']);
  const { formatDateTime } = useDateFormat();
  const { isViewOnly, viewOnlyTooltip } = usePatientPermissions();
  const { practitioners } = usePractitioners();
  const { practices } = usePractices();
  const [viewMode, setViewMode] = usePersistedViewMode('appointments');
  const {
    page,
    setPage,
    pageSize,
    handlePageSizeChange,
    paginateData,
    totalPages,
    resetPage,
    clampPage,
    PAGE_SIZE_OPTIONS,
  } = usePagination();

  const {
    items: appointments,
    currentPatient,
    loading,
    error,
    successMessage,
    createItem,
    updateItem,
    deleteItem,
    refreshData,
    clearError,
    setError,
    setSuccessMessage,
  } = useMedicalData({
    entityName: 'appointment',
    entityLabel: t('scheduling.entityNames.appointment', 'appointment'),
    apiMethodsConfig: {
      getAll: signal => appointmentApi.getAll(signal),
      getByPatient: (patientId, signal) => appointmentApi.getByPatient(patientId, signal),
      create: (data, signal) => appointmentApi.create(data, signal),
      update: (id, data, signal) => appointmentApi.update(id, data, signal),
      delete: (id, signal) => appointmentApi.delete(id, signal),
    },
    requiresPatient: true,
  });

  const practitionerNames = useMemo(
    () => Object.fromEntries((practitioners || []).map(p => [p.id, p.name])),
    [practitioners]
  );
  const practiceNames = useMemo(
    () => Object.fromEntries((practices || []).map(p => [p.id, p.name])),
    [practices]
  );

  const filterConfig = useMemo(
    () => ({
      filtering: {
        searchFields: ['title', 'location', 'notes'],
        statusOptions: [
          { value: 'all', label: t('scheduling.filters.allStatuses', 'All Statuses') },
          ...toSelectOptions(APPOINTMENT_STATUSES, t),
        ],
        typeField: 'appointment_type',
        typeOptions: [
          { value: 'all', label: t('scheduling.filters.allTypes', 'All Types') },
          ...toSelectOptions(APPOINTMENT_TYPES, t),
        ],
        dateField: 'scheduled_at',
      },
      sorting: {
        defaultSortBy: 'scheduled_at',
        defaultSortOrder: 'asc',
        sortOptions: [
          { value: 'scheduled_at', label: t('scheduling.fields.dateTime', 'Date and time') },
          { value: 'title', label: t('scheduling.fields.title', 'Title') },
          { value: 'status', label: t('scheduling.fields.status', 'Status') },
        ],
        sortTypes: { scheduled_at: 'date', title: 'string', status: 'string' },
      },
      filterControls: {
        searchPlaceholder: 'searchPlaceholders.generic',
        showStatus: true,
        showType: true,
        showDateRange: true,
        typePlaceholder: t('scheduling.fields.appointmentType', 'Type'),
      },
    }),
    [t]
  );
  const dataManagement = useDataManagement(appointments, filterConfig);

  const {
    isOpen: showViewModal,
    viewingItem: viewingAppointment,
    openModal: handleView,
    closeModal: handleCloseView,
  } = useViewModalNavigation({ items: appointments, loading });

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(EMPTY_APPOINTMENT_FORM);
  const [completing, setCompleting] = useState(null);

  const handleAdd = () => {
    setEditing(null);
    setFormData(EMPTY_APPOINTMENT_FORM);
    setShowModal(true);
  };

  const handleEdit = appointment => {
    setEditing(appointment);
    setFormData(appointmentToForm(appointment));
    setShowModal(true);
  };

  const handleDelete = async id => {
    const success = await deleteItem(id);
    if (success) await refreshData();
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!formData.title?.trim()) {
      setError(t('scheduling.validation.titleRequired', 'Title is required'));
      return;
    }
    if (!formData.date || !formData.time) {
      setError(t('scheduling.validation.dateTimeRequired', 'Date and time are required'));
      return;
    }
    if (!currentPatient?.id) {
      setError(t('shared:labels.patientInfoNotAvailable', 'Patient information not available'));
      return;
    }
    const payload = formToAppointmentPayload(formData, currentPatient.id);
    const success = editing
      ? await updateItem(editing.id, payload)
      : await createItem(payload);
    if (success) {
      setShowModal(false);
      await refreshData();
    }
  };

  const handleInputChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleConfirmComplete = async (appointment, body) => {
    try {
      await appointmentApi.complete(appointment.id, body);
      setCompleting(null);
      setSuccessMessage(
        t('scheduling.appointments.completed', 'Appointment recorded in your visit history')
      );
      setTimeout(() => setSuccessMessage(''), 3000);
      await refreshData();
    } catch (err) {
      logger.error('appointment_complete_error', {
        message: 'Failed to complete appointment',
        appointmentId: appointment.id,
        error: err?.message,
        component: 'Appointments',
      });
      setError(
        t('scheduling.appointments.completeFailed', 'Could not mark the appointment as completed')
      );
    }
  };

  const filtered = dataManagement.data;
  const paginated = paginateData(filtered);

  useEffect(() => {
    resetPage();
  }, [dataManagement.hasActiveFilters, resetPage]);
  useEffect(() => {
    clampPage(filtered.length);
  }, [filtered.length, clampPage]);

  if (loading) {
    return (
      <MedicalPageLoading
        message={t('scheduling.appointments.loading', 'Loading appointments...')}
        hint={t(
          'shared:labels.ifThisTakesTooLongPleaseRefreshThePage',
          'If this takes too long, please refresh the page'
        )}
      />
    );
  }

  return (
    <>
      <Container size="xl" py="sm">
        <PageHeader title={t('scheduling.appointments.title', 'Appointments')} icon="🗓️" />

        <Stack gap="sm" mt="md">
          <MedicalPageAlerts
            error={error}
            successMessage={successMessage}
            onClearError={clearError}
          />

          <MedicalPageActions
            primaryAction={{
              label: t('scheduling.appointments.add', '+ Add Appointment'),
              onClick: handleAdd,
              size: 'sm',
              disabled: isViewOnly,
              tooltip: viewOnlyTooltip,
            }}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            viewToggleSize="sm"
            mb={0}
          />

          <MedicalPageFilters dataManagement={dataManagement} config={filterConfig} />

          {filtered.length === 0 ? (
            <EmptyState
              emoji="🗓️"
              title={t('scheduling.appointments.noneFound', 'No Appointments Found')}
              hasActiveFilters={dataManagement.hasActiveFilters}
              filteredMessage={t(
                'shared:emptyStates.adjustSearch',
                'Try adjusting your search or filter criteria.'
              )}
              noDataMessage={t(
                'scheduling.appointments.startAdding',
                'Add your upcoming visits and exams to get reminders.'
              )}
              actionButton={
                <Button variant="filled" onClick={handleAdd} disabled={isViewOnly}>
                  {t('scheduling.appointments.addFirst', 'Add Your First Appointment')}
                </Button>
              }
            />
          ) : (
            <>
              {viewMode === 'cards' ? (
                <AnimatedCardGrid
                  items={paginated}
                  columns={{ base: 12, sm: 6, lg: 4 }}
                  renderCard={appointment => (
                    <AppointmentCard
                      appointment={appointment}
                      practitionerName={practitionerNames[appointment.practitioner_id]}
                      practiceName={practiceNames[appointment.practice_id]}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onView={handleView}
                      onComplete={setCompleting}
                      disableActions={isViewOnly}
                      disableActionsTooltip={viewOnlyTooltip}
                    />
                  )}
                />
              ) : (
                <Paper shadow="sm" radius="md" withBorder>
                  <ResponsiveTable
                    persistKey="appointments"
                    data={paginated}
                    pagination={false}
                    disableEdit={isViewOnly}
                    disableDelete={isViewOnly}
                    disableActionsTooltip={viewOnlyTooltip}
                    columns={[
                      {
                        header: t('scheduling.fields.dateTime', 'Date and time'),
                        accessor: 'scheduled_at',
                        priority: 'high',
                        width: 180,
                        render: value => formatDateTime(value),
                      },
                      {
                        header: t('scheduling.fields.title', 'Title'),
                        accessor: 'title',
                        priority: 'high',
                        width: 220,
                      },
                      {
                        header: t('scheduling.fields.status', 'Status'),
                        accessor: 'status',
                        priority: 'medium',
                        width: 130,
                        render: value => getOptionLabel(APPOINTMENT_STATUSES, value, t),
                      },
                      {
                        header: t('scheduling.fields.practitioner', 'Practitioner'),
                        accessor: 'practitioner_id',
                        priority: 'low',
                        width: 180,
                        render: value => practitionerNames[value] || '',
                      },
                      {
                        header: t('scheduling.fields.location', 'Location'),
                        accessor: 'location',
                        priority: 'low',
                        width: 180,
                      },
                    ]}
                    patientData={currentPatient}
                    tableName={t('scheduling.appointments.title', 'Appointments')}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    dataType="medical"
                    responsive={responsive}
                  />
                </Paper>
              )}
              <PaginationControls
                page={page}
                totalPages={totalPages(filtered.length)}
                pageSize={pageSize}
                totalRecords={filtered.length}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
              />
            </>
          )}
        </Stack>
      </Container>

      <AppointmentFormWrapper
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={
          editing
            ? t('scheduling.appointments.editTitle', 'Edit Appointment')
            : t('scheduling.appointments.addTitle', 'Add Appointment')
        }
        editingAppointment={editing}
        formData={formData}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        practitioners={practitioners}
        practices={practices}
      />

      <AppointmentViewModal
        isOpen={showViewModal}
        onClose={handleCloseView}
        appointment={viewingAppointment}
        practitionerName={practitionerNames[viewingAppointment?.practitioner_id]}
        practiceName={practiceNames[viewingAppointment?.practice_id]}
        onEdit={handleEdit}
        disableEdit={isViewOnly}
        disableEditTooltip={viewOnlyTooltip}
      />

      <AppointmentCompleteModal
        isOpen={!!completing}
        onClose={() => setCompleting(null)}
        appointment={completing}
        patientId={currentPatient?.id}
        onConfirm={handleConfirmComplete}
      />
    </>
  );
};

export default withResponsive(Appointments, {
  injectResponsive: true,
  displayName: 'ResponsiveAppointments',
});
