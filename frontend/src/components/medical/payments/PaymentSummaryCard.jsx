import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Card, Group, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { paymentApi } from '../../../services/api/schedulingApi';
import logger from '../../../services/logger';
import { formatMoney } from '../../../utils/schedulingUtils';

const Stat = ({ label, values, currencyKey, locale }) => (
  <Stack gap={2}>
    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
      {label}
    </Text>
    {values.length === 0 ? (
      <Text fw={600}>-</Text>
    ) : (
      values.map(v => (
        <Text key={v.currency} fw={600}>
          {formatMoney(v[currencyKey], v.currency, locale)}
        </Text>
      ))
    )}
  </Stack>
);

Stat.propTypes = {
  label: PropTypes.string.isRequired,
  values: PropTypes.array.isRequired,
  currencyKey: PropTypes.string.isRequired,
  locale: PropTypes.string,
};

/**
 * Paid / to-pay / tax-deductible totals per currency for a year (or all
 * years). Reloads when ``refreshKey`` changes, e.g. after an edit.
 */
const PaymentSummaryCard = ({ patientId, refreshKey }) => {
  const { t, i18n } = useTranslation(['medical', 'shared']);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [summary, setSummary] = useState([]);

  useEffect(() => {
    if (!patientId) return undefined;
    const controller = new AbortController();
    paymentApi
      .getSummary(patientId, year === 'all' ? null : Number(year), controller.signal)
      .then(data => setSummary(Array.isArray(data) ? data : []))
      .catch(err => {
        if (err?.name === 'AbortError') return;
        logger.error('payment_summary_error', {
          message: 'Failed to load payment summary',
          error: err?.message,
          component: 'PaymentSummaryCard',
        });
      });
    return () => controller.abort();
  }, [patientId, year, refreshKey]);

  const yearOptions = [
    { value: 'all', label: t('scheduling.payments.allYears', 'All years') },
    ...Array.from({ length: 6 }, (_, i) => String(currentYear - i)).map(y => ({
      value: y,
      label: y,
    })),
  ];
  const nonZero = key => summary.filter(row => row[key] > 0);

  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>{t('scheduling.payments.summary', 'Summary')}</Text>
        <Select
          size="xs"
          w={130}
          value={year}
          onChange={value => setYear(value || String(currentYear))}
          data={yearOptions}
          allowDeselect={false}
          aria-label={t('scheduling.payments.year', 'Year')}
        />
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Stat
          label={t('scheduling.payments.totalPaid', 'Paid')}
          values={nonZero('total_paid')}
          currencyKey="total_paid"
          locale={i18n.language}
        />
        <Stat
          label={t('scheduling.payments.totalDue', 'To pay')}
          values={nonZero('total_due')}
          currencyKey="total_due"
          locale={i18n.language}
        />
        <Stat
          label={t('scheduling.payments.totalDeductible', 'Tax deductible (paid)')}
          values={nonZero('total_tax_deductible_paid')}
          currencyKey="total_tax_deductible_paid"
          locale={i18n.language}
        />
      </SimpleGrid>
    </Card>
  );
};

PaymentSummaryCard.propTypes = {
  patientId: PropTypes.number,
  refreshKey: PropTypes.any,
};

export default PaymentSummaryCard;
