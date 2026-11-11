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
  Tabs,
  Box,
} from '@mantine/core';
import { IconFileText, IconList, IconBell, IconNotes } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { DateInput } from '../../adapters/DateInput';
import FormLoadingOverlay from '../../shared/FormLoadingOverlay';
import SubmitButton from '../../shared/SubmitButton';
import { TagInput } from '../../common/TagInput';
import PractitionerSelectWithCreate from '../practitioners/PractitionerSelectWithCreate';
import ReminderSettings from '../scheduling/ReminderSettings';
import PrescriptionItemsEditor from './PrescriptionItemsEditor';
import { useDateFormat } from '../../../hooks/useDateFormat';
import { parseDateInput, formatDateInputChange } from '../../../utils/dateUtils';
import {
  DAY_REMINDER_PRESETS,
  PRESCRIPTION_STATUSES,
  PRESCRIPTION_TYPES,
  PRIORITY_SUGGESTIONS,
  toSelectOptions,
} from '../../../constants/schedulingConstants';
import logger from '../../../services/logger';

const PrescriptionFormWrapper = ({
  isOpen,
  onClose,
  title,
  editingPrescription = null,
  formData,
  onInputChange,
  onSubmit,
  practitioners = [],
  appointments = [],
  medications = [],
  isLoading = false,
}) => {
  const { t } = useTranslation(['medical', 'shared']);
  const { formatDateTime } = useDateFormat();
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
      logger.error('prescription_form_wrapper_error', {
        message: 'Error in PrescriptionFormWrapper',
        prescriptionId: editingPrescription?.id,
        error: error.message,
        component: 'PrescriptionFormWrapper',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Autocomplete stores the typed text: suggest the short codes and show
  // their description in the dropdown.
  const prioritySuggestions = PRIORITY_SUGGESTIONS.map(p => p.value);
  const priorityLabels = Object.fromEntries(
    PRIORITY_SUGGESTIONS.map(p => [p.value, t(p.labelKey, p.fallback)])
  );
  const appointmentOptions = appointments.map(a => ({
    value: String(a.id),
    label: `${formatDateTime(a.scheduled_at)} - ${a.title}`,
  }));
  const medicationOptions = medications.map(m => ({
    value: String(m.id),
    label: m.medication_name,
  }));
  const canSubmit =
    formData.title?.trim() && formData.prescription_type && formData.issued_date;

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
        message={t('scheduling.prescriptions.saving', 'Saving prescription...')}
      />
      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="details" leftSection={<IconFileText size={16} />}>
                {t('scheduling.tabs.details', 'Details')}
              </Tabs.Tab>
              <Tabs.Tab value="items" leftSection={<IconList size={16} />}>
                {t('scheduling.tabs.items', 'Items')}
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
                      label={t('scheduling.fields.title', 'Title')}
                      value={formData.title || ''}
                      onChange={e => setField('title', e.currentTarget.value)}
                      placeholder={t(
                        'scheduling.prescriptions.titlePlaceholder',
                        'e.g., Blood tests, Cardiology referral'
                      )}
                      required
                      maxLength={200}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Select
                      label={t('scheduling.fields.prescriptionType', 'Type')}
                      value={formData.prescription_type || null}
                      data={toSelectOptions(PRESCRIPTION_TYPES, t)}
                      onChange={value => setField('prescription_type', value || '')}
                      required
                      allowDeselect={false}
                      comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Select
                      label={t('scheduling.fields.status', 'Status')}
                      value={formData.status || 'active'}
                      data={toSelectOptions(PRESCRIPTION_STATUSES, t)}
                      onChange={value => setField('status', value || 'active')}
                      allowDeselect={false}
                      comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput
                      label={t('scheduling.fields.prescriptionNumber', 'Number')}
                      description={t(
                        'scheduling.prescriptions.numberHelp',
                        'Identifier printed on the prescription'
                      )}
                      value={formData.prescription_number || ''}
                      onChange={e => setField('prescription_number', e.currentTarget.value)}
                      maxLength={100}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <PractitionerSelectWithCreate
                      value={formData.practitioner_id ? String(formData.practitioner_id) : null}
                      onChange={value => setField('practitioner_id', value || '')}
                      practitioners={practitioners}
                      label={t('scheduling.fields.prescriber', 'Prescribed by')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <DateInput
                      label={t('scheduling.fields.issuedDate', 'Issued')}
                      value={parseDateInput(formData.issued_date)}
                      onChange={date => setField('issued_date', formatDateInputChange(date))}
                      maxDate={new Date()}
                      required
                      popoverProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <DateInput
                      label={t('scheduling.fields.expiryDate', 'Expires')}
                      value={parseDateInput(formData.expiry_date)}
                      onChange={date => setField('expiry_date', formatDateInputChange(date))}
                      minDate={parseDateInput(formData.issued_date) || undefined}
                      clearable
                      popoverProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <DateInput
                      label={t('scheduling.fields.usedDate', 'Used on')}
                      value={parseDateInput(formData.used_date)}
                      onChange={date => setField('used_date', formatDateInputChange(date))}
                      maxDate={new Date()}
                      clearable
                      popoverProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Autocomplete
                      label={t('scheduling.fields.priority', 'Priority')}
                      value={formData.priority || ''}
                      onChange={value => setField('priority', value)}
                      data={prioritySuggestions}
                      renderOption={({ option }) => priorityLabels[option.value] || option.value}
                      maxLength={30}
                      comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput
                      label={t('scheduling.fields.exemptionCode', 'Exemption')}
                      value={formData.exemption_code || ''}
                      onChange={e => setField('exemption_code', e.currentTarget.value)}
                      maxLength={50}
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
                      label={t('scheduling.fields.medication', 'Medication')}
                      value={formData.medication_id ? String(formData.medication_id) : null}
                      data={medicationOptions}
                      onChange={value => setField('medication_id', value || '')}
                      clearable
                      searchable
                      comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                </Grid>
              </Box>
            </Tabs.Panel>

            <Tabs.Panel value="items">
              <Box mt="md">
                <PrescriptionItemsEditor
                  items={formData.items}
                  onChange={items => setField('items', items)}
                />
              </Box>
            </Tabs.Panel>

            <Tabs.Panel value="reminders">
              <Box mt="md">
                <ReminderSettings
                  enabled={formData.reminder_enabled}
                  values={formData.expiry_reminder_days}
                  presets={DAY_REMINDER_PRESETS}
                  mode="days"
                  onEnabledChange={value => setField('reminder_enabled', value)}
                  onValuesChange={value => setField('expiry_reminder_days', value)}
                  description={t(
                    'scheduling.prescriptions.remindersHelp',
                    'Sent before the expiry date while the prescription is not used yet.'
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
              {editingPrescription
                ? t('scheduling.prescriptions.update', 'Update Prescription')
                : t('scheduling.prescriptions.save', 'Save Prescription')}
            </SubmitButton>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

PrescriptionFormWrapper.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  editingPrescription: PropTypes.shape({ id: PropTypes.number }),
  formData: PropTypes.object.isRequired,
  onInputChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  practitioners: PropTypes.array,
  appointments: PropTypes.array,
  medications: PropTypes.array,
  isLoading: PropTypes.bool,
};

export default PrescriptionFormWrapper;
