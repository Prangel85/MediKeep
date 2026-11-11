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
  NumberInput,
  Tabs,
  Box,
} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import { IconCalendarEvent, IconBell, IconNotes } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { DateInput } from '../../adapters/DateInput';
import FormLoadingOverlay from '../../shared/FormLoadingOverlay';
import SubmitButton from '../../shared/SubmitButton';
import { TagInput } from '../../common/TagInput';
import PractitionerSelectWithCreate from '../practitioners/PractitionerSelectWithCreate';
import ReminderSettings from '../scheduling/ReminderSettings';
import { parseDateInput, formatDateInputChange } from '../../../utils/dateUtils';
import {
  APPOINTMENT_REMINDER_PRESETS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  toSelectOptions,
} from '../../../constants/schedulingConstants';
import logger from '../../../services/logger';

const AppointmentFormWrapper = ({
  isOpen,
  onClose,
  title,
  editingAppointment = null,
  formData,
  onInputChange,
  onSubmit,
  practitioners = [],
  practices = [],
  isLoading = false,
}) => {
  const { t } = useTranslation(['medical', 'shared']);
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
      logger.error('appointment_form_wrapper_error', {
        message: 'Error in AppointmentFormWrapper',
        appointmentId: editingAppointment?.id,
        error: error.message,
        component: 'AppointmentFormWrapper',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const practiceOptions = practices.map(p => ({ value: String(p.id), label: p.name }));
  const canSubmit = formData.title?.trim() && formData.date && formData.time;

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
        message={t('scheduling.appointments.saving', 'Saving appointment...')}
      />
      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="details" leftSection={<IconCalendarEvent size={16} />}>
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
                      label={t('scheduling.fields.title', 'Title')}
                      value={formData.title || ''}
                      onChange={e => setField('title', e.currentTarget.value)}
                      placeholder={t(
                        'scheduling.appointments.titlePlaceholder',
                        'e.g., Cardiology check-up, Blood tests'
                      )}
                      required
                      maxLength={200}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <DateInput
                      label={t('scheduling.fields.date', 'Date')}
                      value={parseDateInput(formData.date)}
                      onChange={date => setField('date', formatDateInputChange(date))}
                      required
                      popoverProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 3 }}>
                    <TimeInput
                      label={t('scheduling.fields.time', 'Time')}
                      value={formData.time || ''}
                      onChange={e => setField('time', e.currentTarget.value)}
                      required
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 3 }}>
                    <NumberInput
                      label={t('scheduling.fields.durationMinutes', 'Duration (min)')}
                      value={formData.duration_minutes ?? ''}
                      onChange={value => setField('duration_minutes', value)}
                      min={1}
                      max={1440}
                      allowDecimal={false}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Select
                      label={t('scheduling.fields.appointmentType', 'Type')}
                      value={formData.appointment_type || null}
                      data={toSelectOptions(APPOINTMENT_TYPES, t)}
                      onChange={value => setField('appointment_type', value || '')}
                      clearable
                      comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Select
                      label={t('scheduling.fields.status', 'Status')}
                      value={formData.status || 'scheduled'}
                      data={toSelectOptions(APPOINTMENT_STATUSES, t)}
                      onChange={value => setField('status', value || 'scheduled')}
                      allowDeselect={false}
                      comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <PractitionerSelectWithCreate
                      value={formData.practitioner_id ? String(formData.practitioner_id) : null}
                      onChange={value => setField('practitioner_id', value || '')}
                      practitioners={practitioners}
                      label={t('scheduling.fields.practitioner', 'Practitioner')}
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
                  <Grid.Col span={12}>
                    <TextInput
                      label={t('scheduling.fields.location', 'Location')}
                      value={formData.location || ''}
                      onChange={e => setField('location', e.currentTarget.value)}
                      placeholder={t(
                        'scheduling.appointments.locationPlaceholder',
                        'e.g., Hospital, building B, floor 2'
                      )}
                      maxLength={300}
                    />
                  </Grid.Col>
                </Grid>
              </Box>
            </Tabs.Panel>

            <Tabs.Panel value="reminders">
              <Box mt="md">
                <ReminderSettings
                  enabled={formData.reminder_enabled}
                  values={formData.reminder_offsets_minutes}
                  presets={APPOINTMENT_REMINDER_PRESETS}
                  mode="minutes"
                  onEnabledChange={value => setField('reminder_enabled', value)}
                  onValuesChange={value => setField('reminder_offsets_minutes', value)}
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
                    placeholder={t(
                      'scheduling.appointments.notesPlaceholder',
                      'What to bring, preparation, questions to ask...'
                    )}
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
              {editingAppointment
                ? t('scheduling.appointments.update', 'Update Appointment')
                : t('scheduling.appointments.save', 'Save Appointment')}
            </SubmitButton>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

AppointmentFormWrapper.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  editingAppointment: PropTypes.shape({ id: PropTypes.number }),
  formData: PropTypes.shape({
    title: PropTypes.string,
    date: PropTypes.string,
    time: PropTypes.string,
    duration_minutes: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    appointment_type: PropTypes.string,
    status: PropTypes.string,
    practitioner_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    practice_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    location: PropTypes.string,
    reminder_enabled: PropTypes.bool,
    reminder_offsets_minutes: PropTypes.arrayOf(PropTypes.number),
    notes: PropTypes.string,
    tags: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  onInputChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  practitioners: PropTypes.array,
  practices: PropTypes.array,
  isLoading: PropTypes.bool,
};

export default AppointmentFormWrapper;
