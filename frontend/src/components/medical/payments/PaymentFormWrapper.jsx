import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Modal,
  Stack,
  Group,
  Button,
  Grid,
  TextInput,
  Textarea,
  Select,
  Autocomplete,
  NumberInput,
  Switch,
  Tabs,
  Box,
} from '@mantine/core';
import { IconReceipt, IconBell, IconNotes } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { DateInput } from '../../adapters/DateInput';
import FormLoadingOverlay from '../../shared/FormLoadingOverlay';
import SubmitButton from '../../shared/SubmitButton';
import { TagInput } from '../../common/TagInput';
import ReminderSettings from '../scheduling/ReminderSettings';
import { useDateFormat } from '../../../hooks/useDateFormat';
import { parseDateInput, formatDateInputChange } from '../../../utils/dateUtils';
import {
  COMMON_CURRENCIES,
  DAY_REMINDER_PRESETS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  toSelectOptions,
} from '../../../constants/schedulingConstants';
import logger from '../../../services/logger';

export const isValidCurrency = value => /^[A-Za-z]{3}$/.test((value || '').trim());

const PaymentFormWrapper = ({
  isOpen,
  onClose,
  title,
  editingPayment = null,
  formData,
  onInputChange,
  onSubmit,
  practices = [],
  appointments = [],
  prescriptions = [],
  isLoading = false,
}) => {
  const { t } = useTranslation(['medical', 'shared']);
  const { formatDate, formatDateTime } = useDateFormat();
  const [activeTab, setActiveTab] = useState('details');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) setActiveTab('details');
    else setIsSubmitting(false);
  }, [isOpen]);

  const setField = (name, value) => onInputChange({ target: { name, value } });

  const handleSubmit = async e => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(e);
    } catch (error) {
      logger.error('payment_form_wrapper_error', {
        message: 'Error in PaymentFormWrapper',
        paymentId: editingPayment?.id,
        error: error.message,
        component: 'PaymentFormWrapper',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const practiceOptions = practices.map(p => ({ value: String(p.id), label: p.name }));
  const appointmentOptions = appointments.map(a => ({
    value: String(a.id),
    label: `${formatDateTime(a.scheduled_at)} - ${a.title}`,
  }));
  const prescriptionOptions = prescriptions.map(p => ({
    value: String(p.id),
    label: `${formatDate(p.issued_date)} - ${p.title}`,
  }));
  const currencyInvalid = formData.currency && !isValidCurrency(formData.currency);
  const canSubmit =
    formData.description?.trim() &&
    formData.amount !== '' &&
    formData.amount !== null &&
    isValidCurrency(formData.currency) &&
    formData.payment_type;

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={title}
      size="xl"
      centered
      zIndex={2000}
      closeOnClickOutside={!isLoading && !isSubmitting}
      closeOnEscape={!isLoading && !isSubmitting}
    >
      <FormLoadingOverlay
        visible={isSubmitting || isLoading}
        message={t('scheduling.payments.saving', 'Saving payment...')}
      />
      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="details" leftSection={<IconReceipt size={16} />}>
                {t('scheduling.tabs.details', 'Details')}
              </Tabs.Tab>
              <Tabs.Tab value="reminders" leftSection={<IconBell size={16} />}>
                {t('scheduling.tabs.reminders', 'Reminders')}
              </Tabs.Tab>
              <Tabs.Tab value="notes" leftSection={<IconNotes size={16} />}>
                {t('shared:tabs.notes', 'Notes')}
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="details">
              <Box mt="md">
                <Grid>
                  <Grid.Col span={12}>
                    <TextInput
                      label={t('scheduling.fields.description', 'Description')}
                      value={formData.description || ''}
                      onChange={e => setField('description', e.currentTarget.value)}
                      placeholder={t(
                        'scheduling.payments.descriptionPlaceholder',
                        'e.g., Copay for blood tests, Physiotherapy session'
                      )}
                      required
                      maxLength={200}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 8, sm: 4 }}>
                    <NumberInput
                      label={t('scheduling.fields.amount', 'Amount')}
                      value={formData.amount ?? ''}
                      onChange={value => setField('amount', value)}
                      min={0}
                      max={99999999.99}
                      decimalScale={2}
                      required
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 4, sm: 2 }}>
                    <Autocomplete
                      label={t('scheduling.fields.currency', 'Currency')}
                      value={formData.currency || ''}
                      onChange={value => setField('currency', value.toUpperCase())}
                      data={COMMON_CURRENCIES}
                      maxLength={3}
                      required
                      error={
                        currencyInvalid
                          ? t('scheduling.validation.currency', '3-letter code, e.g. EUR')
                          : null
                      }
                      comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 3 }}>
                    <Select
                      label={t('scheduling.fields.paymentType', 'Type')}
                      value={formData.payment_type || null}
                      data={toSelectOptions(PAYMENT_TYPES, t)}
                      onChange={value => setField('payment_type', value || '')}
                      required
                      allowDeselect={false}
                      comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 3 }}>
                    <Select
                      label={t('scheduling.fields.status', 'Status')}
                      value={formData.status || 'due'}
                      data={toSelectOptions(PAYMENT_STATUSES, t)}
                      onChange={value => setField('status', value || 'due')}
                      allowDeselect={false}
                      comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <DateInput
                      label={t('scheduling.fields.dueDate', 'Due date')}
                      value={parseDateInput(formData.due_date)}
                      onChange={date => setField('due_date', formatDateInputChange(date))}
                      clearable
                      popoverProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <DateInput
                      label={t('scheduling.fields.paidDate', 'Paid on')}
                      value={parseDateInput(formData.paid_date)}
                      onChange={date => setField('paid_date', formatDateInputChange(date))}
                      maxDate={new Date()}
                      clearable
                      popoverProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <Select
                      label={t('scheduling.fields.paymentMethod', 'Method')}
                      value={formData.payment_method || null}
                      data={toSelectOptions(PAYMENT_METHODS, t)}
                      onChange={value => setField('payment_method', value || '')}
                      clearable
                      comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Select
                      label={t('scheduling.fields.practice', 'Practice')}
                      value={formData.practice_id ? String(formData.practice_id) : null}
                      data={practiceOptions}
                      onChange={value => setField('practice_id', value || '')}
                      clearable
                      searchable
                      comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput
                      label={t('scheduling.fields.payee', 'Paid to')}
                      description={t(
                        'scheduling.payments.payeeHelp',
                        'If not a saved practice (pharmacy, lab, ...)'
                      )}
                      value={formData.payee || ''}
                      onChange={e => setField('payee', e.currentTarget.value)}
                      maxLength={200}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput
                      label={t('scheduling.fields.referenceNumber', 'Receipt / invoice number')}
                      value={formData.reference_number || ''}
                      onChange={e => setField('reference_number', e.currentTarget.value)}
                      maxLength={100}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }} style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <Switch
                      checked={!!formData.tax_deductible}
                      onChange={e => setField('tax_deductible', e.currentTarget.checked)}
                      label={t('scheduling.fields.taxDeductible', 'Tax deductible')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Select
                      label={t('scheduling.fields.appointment', 'Appointment')}
                      value={formData.appointment_id ? String(formData.appointment_id) : null}
                      data={appointmentOptions}
                      onChange={value => setField('appointment_id', value || '')}
                      clearable
                      searchable
                      comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Select
                      label={t('scheduling.fields.prescription', 'Prescription')}
                      value={formData.prescription_id ? String(formData.prescription_id) : null}
                      data={prescriptionOptions}
                      onChange={value => setField('prescription_id', value || '')}
                      clearable
                      searchable
                      comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                </Grid>
              </Box>
            </Tabs.Panel>

            <Tabs.Panel value="reminders">
              <Box mt="md">
                <ReminderSettings
                  enabled={formData.reminder_enabled}
                  values={formData.due_reminder_days}
                  presets={DAY_REMINDER_PRESETS}
                  mode="days"
                  onEnabledChange={value => setField('reminder_enabled', value)}
                  onValuesChange={value => setField('due_reminder_days', value)}
                  description={t(
                    'scheduling.payments.remindersHelp',
                    'Sent before the due date while the payment is still to pay.'
                  )}
                />
              </Box>
            </Tabs.Panel>

            <Tabs.Panel value="notes">
              <Box mt="md">
                <Stack>
                  <Textarea
                    label={t('shared:tabs.notes', 'Notes')}
                    value={formData.notes || ''}
                    onChange={e => setField('notes', e.currentTarget.value)}
                    autosize
                    minRows={3}
                  />
                  <TagInput
                    value={formData.tags || []}
                    onChange={tags => setField('tags', tags)}
                    label={t('shared:labels.tags', 'Tags')}
                    placeholder={t('shared:fields.addTags', 'Add tags...')}
                  />
                </Stack>
              </Box>
            </Tabs.Panel>
          </Tabs>

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={onClose} disabled={isLoading || isSubmitting}>
              {t('shared:fields.cancel', 'Cancel')}
            </Button>
            <SubmitButton loading={isLoading || isSubmitting} disabled={!canSubmit}>
              {editingPayment
                ? t('scheduling.payments.update', 'Update Payment')
                : t('scheduling.payments.save', 'Save Payment')}
            </SubmitButton>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

PaymentFormWrapper.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  editingPayment: PropTypes.shape({ id: PropTypes.number }),
  formData: PropTypes.object.isRequired,
  onInputChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  practices: PropTypes.array,
  appointments: PropTypes.array,
  prescriptions: PropTypes.array,
  isLoading: PropTypes.bool,
};

export default PaymentFormWrapper;
