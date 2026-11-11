import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import BaseMedicalCard from '../base/BaseMedicalCard';
import { useDateFormat } from '../../../hooks/useDateFormat';
import logger from '../../../services/logger';
import { daysUntil, formatMoney } from '../../../utils/schedulingUtils';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  getOptionColor,
  getOptionLabel,
} from '../../../constants/schedulingConstants';

/** Badge for an unpaid payment's due date: null when not relevant. */
export const getDueBadge = (payment, t, today = null) => {
  if (payment.status !== 'due' || !payment.due_date) return null;
  const days = daysUntil(payment.due_date, today);
  if (days < 0) return { label: t('scheduling.due.overdue', 'Overdue'), color: 'red' };
  if (days === 0) return { label: t('scheduling.due.today', 'Due today'), color: 'red' };
  if (days <= 7) {
    return {
      label: t('scheduling.due.inDays', { count: days, defaultValue: 'Due in {{count}} days' }),
      color: 'orange',
    };
  }
  return null;
};

const PaymentCard = ({
  payment,
  practiceName,
  onEdit,
  onDelete,
  onView,
  disableActions = false,
  disableActionsTooltip,
  onError,
}) => {
  const { t, i18n } = useTranslation(['medical', 'shared']);
  const { formatDate } = useDateFormat();

  const handleError = error => {
    logger.error('payment_card_error', {
      message: 'Error in PaymentCard',
      paymentId: payment?.id,
      error: error.message,
      component: 'PaymentCard',
    });
    if (onError) onError(error);
  };

  try {
    const badges = [
      {
        label: getOptionLabel(PAYMENT_STATUSES, payment.status, t),
        color: getOptionColor(PAYMENT_STATUSES, payment.status),
      },
      {
        label: getOptionLabel(PAYMENT_TYPES, payment.payment_type, t),
        color: getOptionColor(PAYMENT_TYPES, payment.payment_type),
      },
    ];
    const due = getDueBadge(payment, t);
    if (due) badges.push(due);
    if (payment.tax_deductible) {
      badges.push({ label: t('scheduling.fields.taxDeductible', 'Tax deductible'), color: 'teal' });
    }

    const fields = [
      {
        label: t('scheduling.fields.amount', 'Amount'),
        value: formatMoney(payment.amount, payment.currency, i18n.language),
      },
      {
        label: t('scheduling.fields.dueDate', 'Due date'),
        value: payment.due_date ? formatDate(payment.due_date) : null,
      },
      {
        label: t('scheduling.fields.paidDate', 'Paid on'),
        value: payment.paid_date ? formatDate(payment.paid_date) : null,
      },
      {
        label: t('scheduling.fields.payee', 'Paid to'),
        value: practiceName || payment.payee,
      },
      {
        label: t('scheduling.fields.paymentMethod', 'Method'),
        value: payment.payment_method
          ? getOptionLabel(PAYMENT_METHODS, payment.payment_method, t)
          : null,
      },
    ].filter(field => field.value);

    return (
      <BaseMedicalCard
        title={payment.description}
        subtitle={formatMoney(payment.amount, payment.currency, i18n.language)}
        badges={badges}
        fields={fields}
        notes={payment.notes}
        tags={payment.tags}
        onView={() => onView(payment)}
        onEdit={() => onEdit(payment)}
        onDelete={() => onDelete(payment.id)}
        disableActions={disableActions}
        disableActionsTooltip={disableActionsTooltip}
        onError={handleError}
      />
    );
  } catch (error) {
    handleError(error);
    return null;
  }
};

PaymentCard.propTypes = {
  payment: PropTypes.shape({
    id: PropTypes.number,
    description: PropTypes.string,
    amount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    currency: PropTypes.string,
    payment_type: PropTypes.string,
    status: PropTypes.string,
    due_date: PropTypes.string,
    paid_date: PropTypes.string,
    payment_method: PropTypes.string,
    payee: PropTypes.string,
    tax_deductible: PropTypes.bool,
    notes: PropTypes.string,
    tags: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  practiceName: PropTypes.string,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onView: PropTypes.func.isRequired,
  disableActions: PropTypes.bool,
  disableActionsTooltip: PropTypes.string,
  onError: PropTypes.func,
};

export default PaymentCard;
