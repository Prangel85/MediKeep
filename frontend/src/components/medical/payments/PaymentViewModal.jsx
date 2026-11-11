import PropTypes from 'prop-types';
import { Modal, Stack, Group, Badge, SimpleGrid, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import ViewModalFooter from '../../shared/ViewModalFooter';
import NotesView from '../../shared/NotesView';
import DocumentManagerWithProgress from '../../shared/DocumentManagerWithProgress';
import DetailItem from '../scheduling/DetailItem';
import { useDateFormat } from '../../../hooks/useDateFormat';
import logger from '../../../services/logger';
import { formatDaysBefore, formatMoney } from '../../../utils/schedulingUtils';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  getOptionColor,
  getOptionLabel,
} from '../../../constants/schedulingConstants';
import { getDueBadge } from './PaymentCard';

const PaymentViewModal = ({
  isOpen,
  onClose,
  payment,
  practiceName,
  onEdit,
  disableEdit = false,
  disableEditTooltip,
}) => {
  const { t, i18n } = useTranslation(['medical', 'shared']);
  const { formatDate } = useDateFormat();

  if (!isOpen || !payment) return null;

  const notSpecified = t('shared:labels.notSpecified', 'Not specified');
  const due = getDueBadge(payment, t);
  const reminders =
    payment.reminder_enabled && payment.due_reminder_days?.length
      ? payment.due_reminder_days.map(d => formatDaysBefore(d, t)).join(', ')
      : t('scheduling.reminders.none', 'No reminders');

  const handleDocumentError = error =>
    logger.error('payment_receipts_error', {
      message: 'Receipt manager error',
      paymentId: payment.id,
      error: error?.message,
      component: 'PaymentViewModal',
    });

  return (
    <Modal opened={isOpen} onClose={onClose} title={payment.description} size="lg" centered zIndex={2000}>
      <Stack gap="lg">
        <Group gap="xs">
          <Badge variant="light" color={getOptionColor(PAYMENT_STATUSES, payment.status)}>
            {getOptionLabel(PAYMENT_STATUSES, payment.status, t)}
          </Badge>
          <Badge variant="light" color={getOptionColor(PAYMENT_TYPES, payment.payment_type)}>
            {getOptionLabel(PAYMENT_TYPES, payment.payment_type, t)}
          </Badge>
          {due && (
            <Badge variant="filled" color={due.color}>
              {due.label}
            </Badge>
          )}
          {payment.tax_deductible && (
            <Badge variant="light" color="teal">
              {t('scheduling.fields.taxDeductible', 'Tax deductible')}
            </Badge>
          )}
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <DetailItem
            label={t('scheduling.fields.amount', 'Amount')}
            value={formatMoney(payment.amount, payment.currency, i18n.language)}
          />
          <DetailItem
            label={t('scheduling.fields.payee', 'Paid to')}
            value={practiceName || payment.payee || notSpecified}
          />
          <DetailItem
            label={t('scheduling.fields.dueDate', 'Due date')}
            value={payment.due_date ? formatDate(payment.due_date) : notSpecified}
          />
          <DetailItem
            label={t('scheduling.fields.paidDate', 'Paid on')}
            value={payment.paid_date ? formatDate(payment.paid_date) : notSpecified}
          />
          <DetailItem
            label={t('scheduling.fields.paymentMethod', 'Method')}
            value={
              payment.payment_method
                ? getOptionLabel(PAYMENT_METHODS, payment.payment_method, t)
                : notSpecified
            }
          />
          <DetailItem
            label={t('scheduling.fields.referenceNumber', 'Receipt / invoice number')}
            value={payment.reference_number || notSpecified}
          />
          <DetailItem label={t('scheduling.tabs.reminders', 'Reminders')} value={reminders} />
        </SimpleGrid>

        {payment.notes && (
          <div>
            <Title order={4} mb="sm">
              {t('shared:tabs.notes', 'Notes')}
            </Title>
            <NotesView value={payment.notes} />
          </div>
        )}

        <div>
          <Title order={4} mb="sm">
            {t('scheduling.payments.receipts', 'Receipts')}
          </Title>
          <DocumentManagerWithProgress
            entityType="payment"
            entityId={payment.id}
            mode="view"
            onError={handleDocumentError}
            showProgressModal
          />
        </div>

        <ViewModalFooter
          onClose={onClose}
          onEdit={() => {
            onEdit(payment);
            onClose();
          }}
          disableEdit={disableEdit}
          disableEditTooltip={disableEditTooltip}
        />
      </Stack>
    </Modal>
  );
};

PaymentViewModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  payment: PropTypes.object,
  practiceName: PropTypes.string,
  onEdit: PropTypes.func.isRequired,
  disableEdit: PropTypes.bool,
  disableEditTooltip: PropTypes.string,
};

export default PaymentViewModal;
