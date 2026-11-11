import PropTypes from 'prop-types';
import { Modal, Stack, Group, Badge, SimpleGrid, Title, Table } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import ViewModalFooter from '../../shared/ViewModalFooter';
import NotesView from '../../shared/NotesView';
import DetailItem from '../scheduling/DetailItem';
import { useDateFormat } from '../../../hooks/useDateFormat';
import { formatDaysBefore } from '../../../utils/schedulingUtils';
import {
  PRESCRIPTION_STATUSES,
  PRESCRIPTION_TYPES,
  getOptionColor,
  getOptionLabel,
} from '../../../constants/schedulingConstants';
import { getExpiryBadge } from './PrescriptionCard';

const PrescriptionViewModal = ({
  isOpen,
  onClose,
  prescription,
  practitionerName,
  onEdit,
  disableEdit = false,
  disableEditTooltip,
}) => {
  const { t } = useTranslation(['medical', 'shared']);
  const { formatDate } = useDateFormat();

  if (!isOpen || !prescription) return null;

  const notSpecified = t('shared:labels.notSpecified', 'Not specified');
  const expiry = getExpiryBadge(prescription, t);
  const reminders =
    prescription.reminder_enabled && prescription.expiry_reminder_days?.length
      ? prescription.expiry_reminder_days.map(d => formatDaysBefore(d, t)).join(', ')
      : t('scheduling.reminders.none', 'No reminders');

  return (
    <Modal opened={isOpen} onClose={onClose} title={prescription.title} size="lg" centered zIndex={2000}>
      <Stack gap="lg">
        <Group gap="xs">
          <Badge
            variant="light"
            color={getOptionColor(PRESCRIPTION_TYPES, prescription.prescription_type)}
          >
            {getOptionLabel(PRESCRIPTION_TYPES, prescription.prescription_type, t)}
          </Badge>
          <Badge variant="light" color={getOptionColor(PRESCRIPTION_STATUSES, prescription.status)}>
            {getOptionLabel(PRESCRIPTION_STATUSES, prescription.status, t)}
          </Badge>
          {expiry && (
            <Badge variant="filled" color={expiry.color}>
              {expiry.label}
            </Badge>
          )}
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <DetailItem
            label={t('scheduling.fields.prescriptionNumber', 'Number')}
            value={prescription.prescription_number || notSpecified}
          />
          <DetailItem
            label={t('scheduling.fields.prescriber', 'Prescribed by')}
            value={practitionerName || notSpecified}
          />
          <DetailItem
            label={t('scheduling.fields.issuedDate', 'Issued')}
            value={formatDate(prescription.issued_date)}
          />
          <DetailItem
            label={t('scheduling.fields.expiryDate', 'Expires')}
            value={prescription.expiry_date ? formatDate(prescription.expiry_date) : notSpecified}
          />
          <DetailItem
            label={t('scheduling.fields.priority', 'Priority')}
            value={prescription.priority || notSpecified}
          />
          <DetailItem
            label={t('scheduling.fields.exemptionCode', 'Exemption')}
            value={prescription.exemption_code || notSpecified}
          />
          {prescription.used_date && (
            <DetailItem
              label={t('scheduling.fields.usedDate', 'Used on')}
              value={formatDate(prescription.used_date)}
            />
          )}
          <DetailItem label={t('scheduling.tabs.reminders', 'Reminders')} value={reminders} />
        </SimpleGrid>

        {prescription.items?.length > 0 && (
          <div>
            <Title order={4} mb="sm">
              {t('scheduling.fields.items', 'Items')}
            </Title>
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('scheduling.items.description', 'Description')}</Table.Th>
                  <Table.Th>{t('scheduling.items.code', 'Code')}</Table.Th>
                  <Table.Th>{t('scheduling.items.quantity', 'Qty')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {prescription.items.map((item, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <Table.Tr key={index}>
                    <Table.Td>{item.description}</Table.Td>
                    <Table.Td>{item.code || ''}</Table.Td>
                    <Table.Td>{item.quantity ?? ''}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        )}

        {prescription.notes && (
          <div>
            <Title order={4} mb="sm">
              {t('shared:tabs.notes', 'Notes')}
            </Title>
            <NotesView value={prescription.notes} />
          </div>
        )}

        <ViewModalFooter
          onClose={onClose}
          onEdit={() => {
            onEdit(prescription);
            onClose();
          }}
          disableEdit={disableEdit}
          disableEditTooltip={disableEditTooltip}
        />
      </Stack>
    </Modal>
  );
};

PrescriptionViewModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  prescription: PropTypes.object,
  practitionerName: PropTypes.string,
  onEdit: PropTypes.func.isRequired,
  disableEdit: PropTypes.bool,
  disableEditTooltip: PropTypes.string,
};

export default PrescriptionViewModal;
