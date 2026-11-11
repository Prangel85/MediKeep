import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Stack, Radio, Group, Select, Textarea, Button, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { apiService } from '../../../services/api';
import { useDateFormat } from '../../../hooks/useDateFormat';
import logger from '../../../services/logger';

/**
 * "Mark as completed": creates a new visit from the appointment, or links
 * an existing visit of the same patient.
 */
const AppointmentCompleteModal = ({ isOpen, onClose, appointment, patientId, onConfirm }) => {
  const { t } = useTranslation(['medical', 'shared']);
  const { formatDate } = useDateFormat();
  const [mode, setMode] = useState('create');
  const [encounterId, setEncounterId] = useState(null);
  const [notes, setNotes] = useState('');
  const [visits, setVisits] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    setMode('create');
    setEncounterId(null);
    setNotes('');
    if (!patientId) return undefined;
    const controller = new AbortController();
    apiService
      .getPatientEncounters(patientId, controller.signal)
      .then(data => setVisits(Array.isArray(data) ? data : []))
      .catch(err => {
        if (err?.name === 'AbortError') return;
        logger.error('appointment_complete_visits_error', {
          message: 'Failed to load visits',
          error: err?.message,
          component: 'AppointmentCompleteModal',
        });
      });
    return () => controller.abort();
  }, [isOpen, patientId]);

  if (!isOpen || !appointment) return null;

  const visitOptions = visits.map(v => ({
    value: String(v.id),
    label: `${formatDate(v.date)} - ${v.reason}`,
  }));

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const body =
        mode === 'link' ? { encounter_id: Number(encounterId) } : { notes: notes || null };
      await onConfirm(appointment, body);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={t('scheduling.appointments.completeTitle', 'Mark appointment as completed')}
      centered
      zIndex={2000}
    >
      <Stack>
        <Text size="sm">
          {t(
            'scheduling.appointments.completeHelp',
            'The appointment is recorded in your visit history.'
          )}
        </Text>
        <Radio.Group value={mode} onChange={setMode}>
          <Stack gap="xs">
            <Radio
              value="create"
              label={t('scheduling.appointments.createVisit', 'Create a new visit from this appointment')}
            />
            <Radio
              value="link"
              label={t('scheduling.appointments.linkVisit', 'Link a visit I already recorded')}
              disabled={visitOptions.length === 0}
            />
          </Stack>
        </Radio.Group>
        {mode === 'create' ? (
          <Textarea
            label={t('scheduling.appointments.visitNotes', 'Visit notes (optional)')}
            value={notes}
            onChange={e => setNotes(e.currentTarget.value)}
            autosize
            minRows={2}
          />
        ) : (
          <Select
            label={t('scheduling.appointments.chooseVisit', 'Visit')}
            data={visitOptions}
            value={encounterId}
            onChange={setEncounterId}
            searchable
            comboboxProps={{ withinPortal: true, zIndex: 3000 }}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={submitting}>
            {t('shared:fields.cancel', 'Cancel')}
          </Button>
          <Button
            color="green"
            onClick={handleConfirm}
            loading={submitting}
            disabled={mode === 'link' && !encounterId}
          >
            {t('scheduling.appointments.markCompleted', 'Mark as completed')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

AppointmentCompleteModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  appointment: PropTypes.object,
  patientId: PropTypes.number,
  onConfirm: PropTypes.func.isRequired,
};

export default AppointmentCompleteModal;
