import PropTypes from 'prop-types';
import { Button, Group } from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import BaseMedicalCard from '../base/BaseMedicalCard';
import { useDateFormat } from '../../../hooks/useDateFormat';
import logger from '../../../services/logger';
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  getOptionColor,
  getOptionLabel,
} from '../../../constants/schedulingConstants';

export const canComplete = appointment =>
  !appointment.encounter_id &&
  ['scheduled', 'confirmed'].includes(appointment.status);

const AppointmentCard = ({
  appointment,
  practitionerName,
  practiceName,
  onEdit,
  onDelete,
  onView,
  onComplete,
  disableActions = false,
  disableActionsTooltip,
  onError,
}) => {
  const { t } = useTranslation(['medical', 'shared']);
  const { formatDateTime } = useDateFormat();

  const handleError = error => {
    logger.error('appointment_card_error', {
      message: 'Error in AppointmentCard',
      appointmentId: appointment?.id,
      error: error.message,
      component: 'AppointmentCard',
    });
    if (onError) onError(error);
  };

  try {
    const badges = [
      {
        label: getOptionLabel(APPOINTMENT_STATUSES, appointment.status, t),
        color: getOptionColor(APPOINTMENT_STATUSES, appointment.status),
      },
    ];
    if (appointment.appointment_type) {
      badges.push({
        label: getOptionLabel(APPOINTMENT_TYPES, appointment.appointment_type, t),
        color: getOptionColor(APPOINTMENT_TYPES, appointment.appointment_type),
      });
    }

    const fields = [
      {
        label: t('scheduling.fields.practitioner', 'Practitioner'),
        value: practitionerName,
      },
      { label: t('scheduling.fields.practice', 'Practice'), value: practiceName },
      { label: t('scheduling.fields.location', 'Location'), value: appointment.location },
      {
        label: t('scheduling.fields.duration', 'Duration'),
        value: appointment.duration_minutes
          ? t('scheduling.minutesShort', {
              count: appointment.duration_minutes,
              defaultValue: '{{count}} min',
            })
          : null,
      },
    ].filter(field => field.value);

    return (
      <BaseMedicalCard
        title={appointment.title}
        subtitle={formatDateTime(appointment.scheduled_at)}
        badges={badges}
        fields={fields}
        notes={appointment.notes}
        tags={appointment.tags}
        onView={() => onView(appointment)}
        onEdit={() => onEdit(appointment)}
        onDelete={() => onDelete(appointment.id)}
        disableActions={disableActions}
        disableActionsTooltip={disableActionsTooltip}
        onError={handleError}
      >
        {onComplete && canComplete(appointment) && (
          <Group justify="flex-end" mt="xs">
            <Button
              size="xs"
              variant="light"
              color="green"
              leftSection={<IconCircleCheck size={14} />}
              onClick={e => {
                e.stopPropagation();
                onComplete(appointment);
              }}
              disabled={disableActions}
            >
              {t('scheduling.appointments.markCompleted', 'Mark as completed')}
            </Button>
          </Group>
        )}
      </BaseMedicalCard>
    );
  } catch (error) {
    handleError(error);
    return null;
  }
};

AppointmentCard.propTypes = {
  appointment: PropTypes.shape({
    id: PropTypes.number,
    title: PropTypes.string,
    scheduled_at: PropTypes.string,
    status: PropTypes.string,
    appointment_type: PropTypes.string,
    location: PropTypes.string,
    duration_minutes: PropTypes.number,
    encounter_id: PropTypes.number,
    notes: PropTypes.string,
    tags: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  practitionerName: PropTypes.string,
  practiceName: PropTypes.string,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onView: PropTypes.func.isRequired,
  onComplete: PropTypes.func,
  disableActions: PropTypes.bool,
  disableActionsTooltip: PropTypes.string,
  onError: PropTypes.func,
};

export default AppointmentCard;
