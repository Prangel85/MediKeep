import PropTypes from 'prop-types';
import { MultiSelect, Stack, Switch, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatDaysBefore, formatLeadTime } from '../../../utils/schedulingUtils';

/**
 * Reminder on/off switch plus a multi-select of lead times.
 *
 * mode="minutes": values are minutes before an appointment.
 * mode="days": values are days before a date (expiry / due date).
 * Values not in the presets (e.g. set through the API) are kept and shown.
 */
const ReminderSettings = ({
  enabled,
  values,
  presets,
  mode = 'minutes',
  onEnabledChange,
  onValuesChange,
  description,
}) => {
  const { t } = useTranslation(['medical', 'shared']);
  const format = mode === 'days' ? formatDaysBefore : formatLeadTime;

  const allValues = Array.from(new Set([...(presets || []), ...(values || [])])).sort(
    (a, b) => b - a
  );
  const data = allValues.map(v => ({ value: String(v), label: format(v, t) }));

  return (
    <Stack gap="sm">
      <Switch
        checked={!!enabled}
        onChange={e => onEnabledChange(e.currentTarget.checked)}
        label={t('scheduling.reminders.enabled', 'Send reminders')}
      />
      <MultiSelect
        label={t('scheduling.reminders.when', 'When to remind')}
        data={data}
        value={(values || []).map(String)}
        onChange={selected =>
          onValuesChange(selected.map(Number).sort((a, b) => b - a))
        }
        disabled={!enabled}
        clearable
        comboboxProps={{ withinPortal: true, zIndex: 3000 }}
        placeholder={t('scheduling.reminders.pick', 'Pick one or more')}
      />
      <Text size="xs" c="dimmed">
        {description ||
          t(
            'scheduling.reminders.help',
            'Reminders are sent through the notification channels set up in Settings > Notifications.'
          )}
      </Text>
    </Stack>
  );
};

ReminderSettings.propTypes = {
  enabled: PropTypes.bool,
  values: PropTypes.arrayOf(PropTypes.number),
  presets: PropTypes.arrayOf(PropTypes.number).isRequired,
  mode: PropTypes.oneOf(['minutes', 'days']),
  onEnabledChange: PropTypes.func.isRequired,
  onValuesChange: PropTypes.func.isRequired,
  description: PropTypes.string,
};

export default ReminderSettings;
