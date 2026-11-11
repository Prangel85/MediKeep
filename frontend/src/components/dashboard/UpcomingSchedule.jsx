import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Anchor, Badge, Card, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconCalendarEvent, IconFileText, IconReceipt } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { appointmentApi, paymentApi, prescriptionApi } from '../../services/api/schedulingApi';
import { useDateFormat } from '../../hooks/useDateFormat';
import logger from '../../services/logger';
import { daysUntil, formatMoney } from '../../utils/schedulingUtils';

export const WINDOW_DAYS = 30;
const MAX_ITEMS = 5;

/**
 * Builds one sorted list from upcoming appointments, expiring prescriptions
 * and due payments. ``sortKey`` is an ISO string so all kinds sort together.
 */
export const buildScheduleItems = ({ appointments = [], prescriptions = [], payments = [] }) =>
  [
    ...appointments.map(a => ({
      kind: 'appointment',
      id: a.id,
      title: a.title,
      sortKey: a.scheduled_at,
      record: a,
    })),
    ...prescriptions.map(p => ({
      kind: 'prescription',
      id: p.id,
      title: p.title,
      sortKey: p.expiry_date,
      record: p,
    })),
    ...payments.map(p => ({
      kind: 'payment',
      id: p.id,
      title: p.description,
      sortKey: p.due_date,
      record: p,
    })),
  ].sort((a, b) => (a.sortKey || '').localeCompare(b.sortKey || ''));

const KIND_CONFIG = {
  appointment: { icon: IconCalendarEvent, color: 'blue', path: '/appointments' },
  prescription: { icon: IconFileText, color: 'violet', path: '/prescriptions' },
  payment: { icon: IconReceipt, color: 'orange', path: '/payments' },
};

const UpcomingSchedule = ({ patientId }) => {
  const { t, i18n } = useTranslation(['medical', 'shared']);
  const { formatDate, formatDateTime } = useDateFormat();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!patientId) return undefined;
    const controller = new AbortController();
    const { signal } = controller;
    // Each source is independent: one failing must not hide the others.
    const safe = (promise, source) =>
      promise.catch(err => {
        if (err?.name !== 'AbortError') {
          logger.error('upcoming_schedule_load_error', {
            message: 'Failed to load upcoming items',
            source,
            error: err?.message,
            component: 'UpcomingSchedule',
          });
        }
        return [];
      });
    Promise.all([
      safe(appointmentApi.getUpcoming(patientId, WINDOW_DAYS, signal), 'appointments'),
      safe(prescriptionApi.getExpiring(patientId, WINDOW_DAYS, signal), 'prescriptions'),
      safe(paymentApi.getDue(patientId, WINDOW_DAYS, signal), 'payments'),
    ]).then(([appointments, prescriptions, payments]) => {
      if (signal.aborted) return;
      setItems(
        buildScheduleItems({
          appointments: Array.isArray(appointments) ? appointments : [],
          prescriptions: Array.isArray(prescriptions) ? prescriptions : [],
          payments: Array.isArray(payments) ? payments : [],
        })
      );
      setLoaded(true);
    });
    return () => controller.abort();
  }, [patientId]);

  if (!patientId || !loaded) return null;

  const describe = item => {
    const r = item.record;
    if (item.kind === 'appointment') return formatDateTime(r.scheduled_at);
    if (item.kind === 'prescription') {
      return t('scheduling.dashboard.expires', {
        date: formatDate(r.expiry_date),
        defaultValue: 'Expires {{date}}',
      });
    }
    const amount = formatMoney(r.amount, r.currency, i18n.language);
    return daysUntil(r.due_date) < 0
      ? t('scheduling.dashboard.overdue', {
          amount,
          date: formatDate(r.due_date),
          defaultValue: '{{amount}} - overdue since {{date}}',
        })
      : t('scheduling.dashboard.due', {
          amount,
          date: formatDate(r.due_date),
          defaultValue: '{{amount}} - due {{date}}',
        });
  };

  return (
    <Card shadow="sm" padding={16} radius="md" withBorder>
      <Group justify="space-between" mb={12}>
        <Text size="15px" fw={600}>
          {t('scheduling.dashboard.title', 'Upcoming')}
        </Text>
        <Anchor size="xs" onClick={() => navigate('/appointments')}>
          {t('scheduling.dashboard.viewAll', 'View appointments')}
        </Anchor>
      </Group>
      {items.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t(
            'scheduling.dashboard.empty',
            'No appointments, expiring prescriptions or payments due in the next 30 days.'
          )}
        </Text>
      ) : (
        <Stack gap={8}>
          {items.slice(0, MAX_ITEMS).map(item => {
            const { icon: Icon, color, path } = KIND_CONFIG[item.kind];
            return (
              <UnstyledButton
                key={`${item.kind}-${item.id}`}
                onClick={() => navigate(`${path}?view=${item.id}`)}
              >
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Icon size={18} color={`var(--mantine-color-${color}-filled)`} />
                  <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {item.title}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {describe(item)}
                    </Text>
                  </Stack>
                </Group>
              </UnstyledButton>
            );
          })}
          {items.length > MAX_ITEMS && (
            <Badge variant="light" color="gray" style={{ alignSelf: 'flex-start' }}>
              {t('scheduling.dashboard.more', {
                count: items.length - MAX_ITEMS,
                defaultValue: '+{{count}} more',
              })}
            </Badge>
          )}
        </Stack>
      )}
    </Card>
  );
};

UpcomingSchedule.propTypes = {
  patientId: PropTypes.number,
};

export default UpcomingSchedule;
