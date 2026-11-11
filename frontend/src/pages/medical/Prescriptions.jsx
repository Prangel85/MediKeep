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
import { usePractitioners } from '../../hooks/useGlobalData';
import { useSchedulingLinks } from '../../hooks/useSchedulingLinks';
import { prescriptionApi } from '../../services/api/schedulingApi';
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
  PrescriptionCard,
  PrescriptionFormWrapper,
  PrescriptionViewModal,
} from '../../components/medical/prescriptions';
import {
  DEFAULT_PRESCRIPTION_REMINDER_DAYS,
  PRESCRIPTION_STATUSES,
  PRESCRIPTION_TYPES,
  getOptionLabel,
  toSelectOptions,
} from '../../constants/schedulingConstants';
import { emptyToNull, idOrNull, toNumberOrNull } from '../../utils/schedulingUtils';

export const EMPTY_PRESCRIPTION_FORM = {
  title: '',
  prescription_type: 'exam',
  prescription_number: '',
  status: 'active',
  practitioner_id: '',
  issued_date: '',
  expiry_date: '',
  used_date: '',
  priority: '',
  exemption_code: '',
  appointment_id: '',
  medication_id: '',
  items: [],
  reminder_enabled: true,
  expiry_reminder_days: DEFAULT_PRESCRIPTION_REMINDER_DAYS,
  notes: '',
  tags: [],
};

export const prescriptionToForm = p => ({
  title: p.title || '',
  prescription_type: p.prescription_type || 'other',
  prescription_number: p.prescription_number || '',
  status: p.status || 'active',
  practitioner_id: p.practitioner_id ?? '',
  issued_date: p.issued_date || '',
  expiry_date: p.expiry_date || '',
  used_date: p.used_date || '',
  priority: p.priority || '',
  exemption_code: p.exemption_code || '',
  appointment_id: p.appointment_id ?? '',
  medication_id: p.medication_id ?? '',
  items: (p.items || []).map(item => ({
    description: item.description || '',
    code: item.code || '',
    quantity: item.quantity ?? '',
  })),
  reminder_enabled: p.reminder_enabled ?? true,
  expiry_reminder_days: p.expiry_reminder_days || [],
  notes: p.notes || '',
  tags: p.tags || [],
});

export const formToPrescriptionPayload = (formData, patientId) => ({
  title: formData.title.trim(),
  prescription_type: formData.prescription_type,
  prescription_number: emptyToNull(formData.prescription_number?.trim()),
  status: formData.status || 'active',
  practitioner_id: idOrNull(formData.practitioner_id),
  issued_date: formData.issued_date,
  expiry_date: emptyToNull(formData.expiry_date),
  used_date: emptyToNull(formData.used_date),
  priority: emptyToNull(formData.priority?.trim()),
  exemption_code: emptyToNull(formData.exemption_code?.trim()),
  appointment_id: idOrNull(formData.appointment_id),
  medication_id: idOrNull(formData.medication_id),
  items: (formData.items || [])
    .filter(item => item.description?.trim())
    .map(item => ({
      description: item.description.trim(),
      code: emptyToNull(item.code?.trim()),
      quantity: toNumberOrNull(item.quantity),
    })),
  reminder_enabled: !!formData.reminder_enabled,
  expiry_reminder_days: formData.expiry_reminder_days || [],
  notes: emptyToNull(formData.notes),
  tags: formData.tags || [],
  patient_id: patientId,
});

const Prescriptions = () => {
  const responsive = useResponsive();
  const { t } = useTranslation(['medical', 'shared']);
  const { formatDate } = useDateFormat();
  const { isViewOnly, viewOnlyTooltip } = usePatientPermissions();
  const { practitioners } = usePractitioners();
  const [viewMode, setViewMode] = usePersistedViewMode('prescriptions');
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
    items: prescriptions,
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
  } = useMedicalData({
    entityName: 'prescription',
    entityLabel: t('scheduling.entityNames.prescription', 'prescription'),
    apiMethodsConfig: {
      getAll: signal => prescriptionApi.getAll(signal),
      getByPatient: (patientId, signal) => prescriptionApi.getByPatient(patientId, signal),
      create: (data, signal) => prescriptionApi.create(data, signal),
      update: (id, data, signal) => prescriptionApi.update(id, data, signal),
      delete: (id, signal) => prescriptionApi.delete(id, signal),
    },
    requiresPatient: true,
  });

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(EMPTY_PRESCRIPTION_FORM);
  const { appointments, medications } = useSchedulingLinks(
    currentPatient?.id,
    ['appointments', 'medications'],
    showModal
  );

  const practitionerNames = useMemo(
    () => Object.fromEntries((practitioners || []).map(p => [p.id, p.name])),
    [practitioners]
  );

  const filterConfig = useMemo(
    () => ({
      filtering: {
        searchFields: ['title', 'prescription_number', 'exemption_code', 'notes'],
        statusOptions: [
          { value: 'all', label: t('scheduling.filters.allStatuses', 'All Statuses') },
          ...toSelectOptions(PRESCRIPTION_STATUSES, t),
        ],
        typeField: 'prescription_type',
        typeOptions: [
          { value: 'all', label: t('scheduling.filters.allTypes', 'All Types') },
          ...toSelectOptions(PRESCRIPTION_TYPES, t),
        ],
        dateField: 'issued_date',
      },
      sorting: {
        defaultSortBy: 'issued_date',
        defaultSortOrder: 'desc',
        sortOptions: [
          { value: 'issued_date', label: t('scheduling.fields.issuedDate', 'Issued') },
          { value: 'expiry_date', label: t('scheduling.fields.expiryDate', 'Expires') },
          { value: 'title', label: t('scheduling.fields.title', 'Title') },
        ],
        sortTypes: { issued_date: 'date', expiry_date: 'date', title: 'string' },
      },
      filterControls: {
        searchPlaceholder: 'searchPlaceholders.generic',
        showStatus: true,
        showType: true,
        showDateRange: true,
        typePlaceholder: t('scheduling.fields.prescriptionType', 'Type'),
      },
    }),
    [t]
  );
  const dataManagement = useDataManagement(prescriptions, filterConfig);

  const {
    isOpen: showViewModal,
    viewingItem,
    openModal: handleView,
    closeModal: handleCloseView,
  } = useViewModalNavigation({ items: prescriptions, loading });

  const handleAdd = () => {
    setEditing(null);
    setFormData(EMPTY_PRESCRIPTION_FORM);
    setShowModal(true);
  };

  const handleEdit = prescription => {
    setEditing(prescription);
    setFormData(prescriptionToForm(prescription));
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
    if (!formData.issued_date) {
      setError(t('scheduling.validation.issuedDateRequired', 'Issue date is required'));
      return;
    }
    if (formData.expiry_date && formData.expiry_date < formData.issued_date) {
      setError(
        t('scheduling.validation.expiryBeforeIssue', 'Expiry date cannot be before the issue date')
      );
      return;
    }
    if (!currentPatient?.id) {
      setError(t('shared:labels.patientInfoNotAvailable', 'Patient information not available'));
      return;
    }
    const payload = formToPrescriptionPayload(formData, currentPatient.id);
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
        message={t('scheduling.prescriptions.loading', 'Loading prescriptions...')}
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
        <PageHeader title={t('scheduling.prescriptions.title', 'Prescriptions')} icon="📝" />

        <Stack gap="sm" mt="md">
          <MedicalPageAlerts
            error={error}
            successMessage={successMessage}
            onClearError={clearError}
          />

          <MedicalPageActions
            primaryAction={{
              label: t('scheduling.prescriptions.add', '+ Add Prescription'),
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
              emoji="📝"
              title={t('scheduling.prescriptions.noneFound', 'No Prescriptions Found')}
              hasActiveFilters={dataManagement.hasActiveFilters}
              filteredMessage={t(
                'shared:emptyStates.adjustSearch',
                'Try adjusting your search or filter criteria.'
              )}
              noDataMessage={t(
                'scheduling.prescriptions.startAdding',
                'Add your prescriptions and referrals to be warned before they expire.'
              )}
              actionButton={
                <Button variant="filled" onClick={handleAdd} disabled={isViewOnly}>
                  {t('scheduling.prescriptions.addFirst', 'Add Your First Prescription')}
                </Button>
              }
            />
          ) : (
            <>
              {viewMode === 'cards' ? (
                <AnimatedCardGrid
                  items={paginated}
                  columns={{ base: 12, sm: 6, lg: 4 }}
                  renderCard={prescription => (
                    <PrescriptionCard
                      prescription={prescription}
                      practitionerName={practitionerNames[prescription.practitioner_id]}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onView={handleView}
                      disableActions={isViewOnly}
                      disableActionsTooltip={viewOnlyTooltip}
                    />
                  )}
                />
              ) : (
                <Paper shadow="sm" radius="md" withBorder>
                  <ResponsiveTable
                    persistKey="prescriptions"
                    data={paginated}
                    pagination={false}
                    disableEdit={isViewOnly}
                    disableDelete={isViewOnly}
                    disableActionsTooltip={viewOnlyTooltip}
                    columns={[
                      {
                        header: t('scheduling.fields.issuedDate', 'Issued'),
                        accessor: 'issued_date',
                        priority: 'high',
                        width: 130,
                        render: value => formatDate(value),
                      },
                      {
                        header: t('scheduling.fields.title', 'Title'),
                        accessor: 'title',
                        priority: 'high',
                        width: 220,
                      },
                      {
                        header: t('scheduling.fields.prescriptionType', 'Type'),
                        accessor: 'prescription_type',
                        priority: 'medium',
                        width: 150,
                        render: value => getOptionLabel(PRESCRIPTION_TYPES, value, t),
                      },
                      {
                        header: t('scheduling.fields.status', 'Status'),
                        accessor: 'status',
                        priority: 'medium',
                        width: 130,
                        render: value => getOptionLabel(PRESCRIPTION_STATUSES, value, t),
                      },
                      {
                        header: t('scheduling.fields.expiryDate', 'Expires'),
                        accessor: 'expiry_date',
                        priority: 'low',
                        width: 130,
                        render: value => (value ? formatDate(value) : ''),
                      },
                    ]}
                    patientData={currentPatient}
                    tableName={t('scheduling.prescriptions.title', 'Prescriptions')}
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

      <PrescriptionFormWrapper
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={
          editing
            ? t('scheduling.prescriptions.editTitle', 'Edit Prescription')
            : t('scheduling.prescriptions.addTitle', 'Add Prescription')
        }
        editingPrescription={editing}
        formData={formData}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        practitioners={practitioners}
        appointments={appointments}
        medications={medications}
      />

      <PrescriptionViewModal
        isOpen={showViewModal}
        onClose={handleCloseView}
        prescription={viewingItem}
        practitionerName={practitionerNames[viewingItem?.practitioner_id]}
        onEdit={handleEdit}
        disableEdit={isViewOnly}
        disableEditTooltip={viewOnlyTooltip}
      />
    </>
  );
};

export default withResponsive(Prescriptions, {
  injectResponsive: true,
  displayName: 'ResponsivePrescriptions',
});
