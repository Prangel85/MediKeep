import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import BaseMedicalCard from '../base/BaseMedicalCard';
import { useDateFormat } from '../../../hooks/useDateFormat';
import logger from '../../../services/logger';
import { daysUntil } from '../../../utils/schedulingUtils';
import {
  PRESCRIPTION_STATUSES,
  PRESCRIPTION_TYPES,
  getOptionColor,
  getOptionLabel,
} from '../../../constants/schedulingConstants';

/**
 * Badge for an unused prescription's expiry: null when not relevant.
 * Exported for the dashboard widget and tests.
 */
export const getExpiryBadge = (prescription, t, today = null) => {
  if (prescription.status !== 'active' || !prescription.expiry_date) return null;
  const days = daysUntil(prescription.expiry_date, today);
  if (days < 0) {
    return { label: t('scheduling.expiry.expired', 'Expired'), color: 'red' };
  }
  if (days === 0) {
    return { label: t('scheduling.expiry.today', 'Expires today'), color: 'red' };
  }
  if (days <= 7) {
    return {
      label: t('scheduling.expiry.inDays', {
        count: days,
        defaultValue: 'Expires in {{count}} days',
      }),
      color: 'orange',
    };
  }
  return null;
};

const PrescriptionCard = ({
  prescription,
  practitionerName,
  onEdit,
  onDelete,
  onView,
  disableActions = false,
  disableActionsTooltip,
  onError,
}) => {
  const { t } = useTranslation(['medical', 'shared']);
  const { formatDate } = useDateFormat();

  const handleError = error => {
    logger.error('prescription_card_error', {
      message: 'Error in PrescriptionCard',
      prescriptionId: prescription?.id,
      error: error.message,
      component: 'PrescriptionCard',
    });
    if (onError) onError(error);
  };

  try {
    const badges = [
      {
        label: getOptionLabel(PRESCRIPTION_TYPES, prescription.prescription_type, t),
        color: getOptionColor(PRESCRIPTION_TYPES, prescription.prescription_type),
      },
      {
        label: getOptionLabel(PRESCRIPTION_STATUSES, prescription.status, t),
        color: getOptionColor(PRESCRIPTION_STATUSES, prescription.status),
      },
    ];
    const expiry = getExpiryBadge(prescription, t);
    if (expiry) badges.push(expiry);

    const fields = [
      {
        label: t('scheduling.fields.prescriptionNumber', 'Number'),
        value: prescription.prescription_number,
      },
      {
        label: t('scheduling.fields.prescriber', 'Prescribed by'),
        value: practitionerName,
      },
      {
        label: t('scheduling.fields.expiryDate', 'Expires'),
        value: prescription.expiry_date ? formatDate(prescription.expiry_date) : null,
      },
      { label: t('scheduling.fields.priority', 'Priority'), value: prescription.priority },
      {
        label: t('scheduling.fields.exemptionCode', 'Exemption'),
        value: prescription.exemption_code,
      },
      {
        label: t('scheduling.fields.items', 'Items'),
        value: prescription.items?.length
          ? prescription.items.map(item => item.description).join(', ')
          : null,
      },
    ].filter(field => field.value);

    return (
      <BaseMedicalCard
        title={prescription.title}
        subtitle={`${t('scheduling.fields.issuedDate', 'Issued')}: ${formatDate(prescription.issued_date)}`}
        badges={badges}
        fields={fields}
        notes={prescription.notes}
        tags={prescription.tags}
        onView={() => onView(prescription)}
        onEdit={() => onEdit(prescription)}
        onDelete={() => onDelete(prescription.id)}
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

PrescriptionCard.propTypes = {
  prescription: PropTypes.shape({
    id: PropTypes.number,
    title: PropTypes.string,
    prescription_type: PropTypes.string,
    prescription_number: PropTypes.string,
    issued_date: PropTypes.string,
    expiry_date: PropTypes.string,
    status: PropTypes.string,
    priority: PropTypes.string,
    exemption_code: PropTypes.string,
    items: PropTypes.arrayOf(PropTypes.shape({ description: PropTypes.string })),
    notes: PropTypes.string,
    tags: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  practitionerName: PropTypes.string,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onView: PropTypes.func.isRequired,
  disableActions: PropTypes.bool,
  disableActionsTooltip: PropTypes.string,
  onError: PropTypes.func,
};

export default PrescriptionCard;
