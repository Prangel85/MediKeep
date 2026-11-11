import PropTypes from 'prop-types';
import { Modal, Stack, Group, Badge, SimpleGrid, Title, Text, Anchor } from '@mantine/core';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ViewModalFooter from '../../shared/ViewModalFooter';
import NotesView from '../../shared/NotesView';
import DetailItem from '../scheduling/DetailItem';
import { useDateFormat } from '../../../hooks/useDateFormat';
import { formatLeadTime } from '../../../utils/schedulingUtils';
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  getOptionColor,
  getOptionLabel,
} from '../../../constants/schedulingConstants';

const AppointmentViewModal = ({
  isOpen,
  onClose,
  appointment,
  practitionerName,
  practiceName,
  onEdit,
  disableEdit = false,
  disableEditTooltip,
}) => {
  const { t } = useTranslation(['medical', 'shared']);
  const { formatDateTime } = useDateFormat();

  if (!isOpen || !appointment) return null;

  const notSpecified = t('shared:labels.notSpecified', 'Not specified');
  const reminders =
    appointment.reminder_enabled && appointment.reminder_offsets_minutes?.length
      ? appointment.reminder_offsets_minutes.map(m => formatLeadTime(m, t)).join(', ')
      : t('scheduling.reminders.none', 'No reminders');

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={appointment.title}
      size="lg"
      centered
      zIndex={2000}
    >
      <Stack gap="lg">
        <Group gap="xs">
          <Badge variant="light" color={getOptionColor(APPOINTMENT_STATUSES, appointment.status)}>
            {getOptionLabel(APPOINTMENT_STATUSES, appointment.status, t)}
          </Badge>
          {appointment.appointment_type && (
            <Badge
              variant="light"
              color={getOptionColor(APPOINTMENT_TYPES, appointment.appointment_type)}
            >
              {getOptionLabel(APPOINTMENT_TYPES, appointment.appointment_type, t)}
            </Badge>
          )}
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <DetailItem
            label={t('scheduling.fields.dateTime', 'Date and time')}
            value={formatDateTime(appointment.scheduled_at)}
          />
          <DetailItem
            label={t('scheduling.fields.duration', 'Duration')}
            value={
              appointment.duration_minutes
                ? t('scheduling.minutesShort', {
                    count: appointment.duration_minutes,
                    defaultValue: '{{count}} min',
                  })
                : notSpecified
            }
          />
          <DetailItem
            label={t('scheduling.fields.practitioner', 'Practitioner')}
            value={practitionerName || notSpecified}
          />
          <DetailItem
            label={t('scheduling.fields.practice', 'Practice')}
            value={practiceName || notSpecified}
          />
          <DetailItem
            label={t('scheduling.fields.location', 'Location')}
            value={appointment.location || notSpecified}
          />
          <DetailItem label={t('scheduling.tabs.reminders', 'Reminders')} value={reminders} />
        </SimpleGrid>

        {appointment.encounter_id && (
          <Text size="sm">
            {t('scheduling.appointments.linkedVisit', 'Recorded as a visit:')}{' '}
            <Anchor component={Link} to={`/visits?view=${appointment.encounter_id}`}>
              {t('scheduling.appointments.openVisit', 'open visit')}
            </Anchor>
          </Text>
        )}

        {appointment.notes && (
          <div>
            <Title order={4} mb="sm">
              {t('shared:tabs.notes', 'Notes')}
            </Title>
            <NotesView value={appointment.notes} />
          </div>
        )}

        {appointment.tags?.length > 0 && (
          <Group gap="xs">
            {appointment.tags.map(tag => (
              <Badge key={tag} variant="light" color="blue" size="sm">
                {tag}
              </Badge>
            ))}
          </Group>
        )}

        <ViewModalFooter
          onClose={onClose}
          onEdit={() => {
            onEdit(appointment);
            onClose();
          }}
          disableEdit={disableEdit}
          disableEditTooltip={disableEditTooltip}
        />
      </Stack>
    </Modal>
  );
};

AppointmentViewModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  appointment: PropTypes.object,
  practitionerName: PropTypes.string,
  practiceName: PropTypes.string,
  onEdit: PropTypes.func.isRequired,
  disableEdit: PropTypes.bool,
  disableEditTooltip: PropTypes.string,
};

export default AppointmentViewModal;
