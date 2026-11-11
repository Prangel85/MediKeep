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
import { usePractices } from '../../hooks/useGlobalData';
import { useSchedulingLinks } from '../../hooks/useSchedulingLinks';
import { paymentApi } from '../../services/api/schedulingApi';
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
  PaymentCard,
  PaymentFormWrapper,
  PaymentViewModal,
  PaymentSummaryCard,
} from '../../components/medical/payments';
import {
  DEFAULT_CURRENCY,
  DEFAULT_PAYMENT_REMINDER_DAYS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  getOptionLabel,
  toSelectOptions,
} from '../../constants/schedulingConstants';
import { emptyToNull, formatMoney, idOrNull } from '../../utils/schedulingUtils';

export const EMPTY_PAYMENT_FORM = {
  description: '',
  amount: '',
  currency: DEFAULT_CURRENCY,
  payment_type: 'copay',
  status: 'due',
  due_date: '',
  paid_date: '',
  payment_method: '',
  reference_number: '',
  payee: '',
  practice_id: '',
  tax_deductible: false,
  appointment_id: '',
  prescription_id: '',
  reminder_enabled: true,
  due_reminder_days: DEFAULT_PAYMENT_REMINDER_DAYS,
  notes: '',
  tags: [],
};

export const paymentToForm = p => ({
  description: p.description || '',
  amount: p.amount ?? '',
  currency: p.currency || DEFAULT_CURRENCY,
  payment_type: p.payment_type || 'other',
  status: p.status || 'due',
  due_date: p.due_date || '',
  paid_date: p.paid_date || '',
  payment_method: p.payment_method || '',
  reference_number: p.reference_number || '',
  payee: p.payee || '',
  practice_id: p.practice_id ?? '',
  tax_deductible: !!p.tax_deductible,
  appointment_id: p.appointment_id ?? '',
  prescription_id: p.prescription_id ?? '',
  reminder_enabled: p.reminder_enabled ?? true,
  due_reminder_days: p.due_reminder_days || [],
  notes: p.notes || '',
  tags: p.tags || [],
});

export const formToPaymentPayload = (formData, patientId) => ({
  description: formData.description.trim(),
  // Two decimals as a string: the API stores an exact decimal.
  amount: Number(formData.amount).toFixed(2),
  currency: formData.currency.trim().toUpperCase(),
  payment_type: formData.payment_type,
  status: formData.status || 'due',
  due_date: emptyToNull(formData.due_date),
  paid_date: emptyToNull(formData.paid_date),
  payment_method: emptyToNull(formData.payment_method),
  reference_number: emptyToNull(formData.reference_number?.trim()),
  payee: emptyToNull(formData.payee?.trim()),
  practice_id: idOrNull(formData.practice_id),
  tax_deductible: !!formData.tax_deductible,
  appointment_id: idOrNull(formData.appointment_id),
  prescription_id: idOrNull(formData.prescription_id),
  reminder_enabled: !!formData.reminder_enabled,
  due_reminder_days: formData.due_reminder_days || [],
  notes: emptyToNull(formData.notes),
  tags: formData.tags || [],
  patient_id: patientId,
});

const Payments = () => {
  const responsive = useResponsive();
  const { t, i18n } = useTranslation(['medical', 'shared']);
  const { formatDate } = useDateFormat();
  const { isViewOnly, viewOnlyTooltip } = usePatientPermissions();
  const { practices } = usePractices();
  const [viewMode, setViewMode] = usePersistedViewMode('payments');
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
    items: payments,
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
    entityName: 'payment',
    entityLabel: t('scheduling.entityNames.payment', 'payment'),
    apiMethodsConfig: {
      getAll: signal => paymentApi.getAll(signal),
      getByPatient: (patientId, signal) => paymentApi.getByPatient(patientId, signal),
      create: (data, signal) => paymentApi.create(data, signal),
      update: (id, data, signal) => paymentApi.update(id, data, signal),
      delete: (id, signal) => paymentApi.delete(id, signal),
    },
    requiresPatient: true,
  });

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(EMPTY_PAYMENT_FORM);
  const { appointments, prescriptions } = useSchedulingLinks(
    currentPatient?.id,
    ['appointments', 'prescriptions'],
    showModal
  );

  const practiceNames = useMemo(
    () => Object.fromEntries((practices || []).map(p => [p.id, p.name])),
    [practices]
  );

  const filterConfig = useMemo(
    () => ({
      filtering: {
        searchFields: ['description', 'payee', 'reference_number', 'notes'],
        statusOptions: [
          { value: 'all', label: t('scheduling.filters.allStatuses', 'All Statuses') },
          ...toSelectOptions(PAYMENT_STATUSES, t),
        ],
        typeField: 'payment_type',
        typeOptions: [
          { value: 'all', label: t('scheduling.filters.allTypes', 'All Types') },
          ...toSelectOptions(PAYMENT_TYPES, t),
        ],
        dateField: 'due_date',
      },
      sorting: {
        defaultSortBy: 'due_date',
        defaultSortOrder: 'desc',
        sortOptions: [
          { value: 'due_date', label: t('scheduling.fields.dueDate', 'Due date') },
          { value: 'paid_date', label: t('scheduling.fields.paidDate', 'Paid on') },
          { value: 'amount', label: t('scheduling.fields.amount', 'Amount') },
        ],
        sortTypes: { due_date: 'date', paid_date: 'date', amount: 'number' },
      },
      filterControls: {
        searchPlaceholder: 'searchPlaceholders.generic',
        showStatus: true,
        showType: true,
        showDateRange: true,
        typePlaceholder: t('scheduling.fields.paymentType', 'Type'),
      },
    }),
    [t]
  );
  const dataManagement = useDataManagement(payments, filterConfig);

  const {
    isOpen: showViewModal,
    viewingItem,
    openModal: handleView,
    closeModal: handleCloseView,
  } = useViewModalNavigation({ items: payments, loading });

  const handleAdd = () => {
    setEditing(null);
    setFormData(EMPTY_PAYMENT_FORM);
    setShowModal(true);
  };

  const handleEdit = payment => {
    setEditing(payment);
    setFormData(paymentToForm(payment));
    setShowModal(true);
  };

  const handleDelete = async id => {
    const success = await deleteItem(id);
    if (success) await refreshData();
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!formData.description?.trim()) {
      setError(t('scheduling.validation.descriptionRequired', 'Description is required'));
      return;
    }
    const amount = Number(formData.amount);
    if (formData.amount === '' || Number.isNaN(amount) || amount < 0) {
      setError(t('scheduling.validation.amount', 'Enter a valid amount'));
      return;
    }
    if (!/^[A-Za-z]{3}$/.test(formData.currency || '')) {
      setError(t('scheduling.validation.currency', '3-letter code, e.g. EUR'));
      return;
    }
    if (!currentPatient?.id) {
      setError(t('shared:labels.patientInfoNotAvailable', 'Patient information not available'));
      return;
    }
    const payload = formToPaymentPayload(formData, currentPatient.id);
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
        message={t('scheduling.payments.loading', 'Loading payments...')}
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
        <PageHeader title={t('scheduling.payments.title', 'Payments')} icon="💶" />

        <Stack gap="sm" mt="md">
          <MedicalPageAlerts
            error={error}
            successMessage={successMessage}
            onClearError={clearError}
          />

          <PaymentSummaryCard patientId={currentPatient?.id} refreshKey={payments} />

          <MedicalPageActions
            primaryAction={{
              label: t('scheduling.payments.add', '+ Add Payment'),
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
              emoji="💶"
              title={t('scheduling.payments.noneFound', 'No Payments Found')}
              hasActiveFilters={dataManagement.hasActiveFilters}
              filteredMessage={t(
                'shared:emptyStates.adjustSearch',
                'Try adjusting your search or filter criteria.'
              )}
              noDataMessage={t(
                'scheduling.payments.startAdding',
                'Track copays and medical expenses, with receipts and due-date reminders.'
              )}
              actionButton={
                <Button variant="filled" onClick={handleAdd} disabled={isViewOnly}>
                  {t('scheduling.payments.addFirst', 'Add Your First Payment')}
                </Button>
              }
            />
          ) : (
            <>
              {viewMode === 'cards' ? (
                <AnimatedCardGrid
                  items={paginated}
                  columns={{ base: 12, sm: 6, lg: 4 }}
                  renderCard={payment => (
                    <PaymentCard
                      payment={payment}
                      practiceName={practiceNames[payment.practice_id]}
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
                    persistKey="payments"
                    data={paginated}
                    pagination={false}
                    disableEdit={isViewOnly}
                    disableDelete={isViewOnly}
                    disableActionsTooltip={viewOnlyTooltip}
                    columns={[
                      {
                        header: t('scheduling.fields.description', 'Description'),
                        accessor: 'description',
                        priority: 'high',
                        width: 220,
                      },
                      {
                        header: t('scheduling.fields.amount', 'Amount'),
                        accessor: 'amount',
                        priority: 'high',
                        width: 120,
                        render: (value, row) => formatMoney(value, row.currency, i18n.language),
                      },
                      {
                        header: t('scheduling.fields.status', 'Status'),
                        accessor: 'status',
                        priority: 'medium',
                        width: 110,
                        render: value => getOptionLabel(PAYMENT_STATUSES, value, t),
                      },
                      {
                        header: t('scheduling.fields.dueDate', 'Due date'),
                        accessor: 'due_date',
                        priority: 'medium',
                        width: 120,
                        render: value => (value ? formatDate(value) : ''),
                      },
                      {
                        header: t('scheduling.fields.paidDate', 'Paid on'),
                        accessor: 'paid_date',
                        priority: 'low',
                        width: 120,
                        render: value => (value ? formatDate(value) : ''),
                      },
                    ]}
                    patientData={currentPatient}
                    tableName={t('scheduling.payments.title', 'Payments')}
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

      <PaymentFormWrapper
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={
          editing
            ? t('scheduling.payments.editTitle', 'Edit Payment')
            : t('scheduling.payments.addTitle', 'Add Payment')
        }
        editingPayment={editing}
        formData={formData}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        practices={practices}
        appointments={appointments}
        prescriptions={prescriptions}
      />

      <PaymentViewModal
        isOpen={showViewModal}
        onClose={handleCloseView}
        payment={viewingItem}
        practiceName={practiceNames[viewingItem?.practice_id]}
        onEdit={handleEdit}
        disableEdit={isViewOnly}
        disableEditTooltip={viewOnlyTooltip}
      />
    </>
  );
};

export default withResponsive(Payments, {
  injectResponsive: true,
  displayName: 'ResponsivePayments',
});
