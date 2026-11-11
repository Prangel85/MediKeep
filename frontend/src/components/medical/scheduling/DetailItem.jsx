import PropTypes from 'prop-types';
import { Stack, Text } from '@mantine/core';

/** Label/value pair used in the scheduling view modals. */
const DetailItem = ({ label, value }) => (
  <Stack gap={2}>
    <Text fw={500} size="sm" c="dimmed">
      {label}
    </Text>
    <Text size="sm">{value}</Text>
  </Stack>
);

DetailItem.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
};

export default DetailItem;
