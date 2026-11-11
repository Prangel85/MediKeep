import PropTypes from 'prop-types';
import { ActionIcon, Button, Grid, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

export const MAX_ITEMS = 50;

/** Editable list of prescribed items: description, optional code and quantity. */
const PrescriptionItemsEditor = ({ items, onChange }) => {
  const { t } = useTranslation(['medical', 'shared']);
  const list = items || [];

  const update = (index, field, value) =>
    onChange(list.map((item, i) => (i === index ? { ...item, [field]: value } : item)));

  return (
    <Stack gap="xs">
      {list.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('scheduling.items.empty', 'No items yet. Add the medications, exams or visits prescribed.')}
        </Text>
      )}
      {list.map((item, index) => (
        // Items have no id; the index is stable while editing this list.
        // eslint-disable-next-line react/no-array-index-key
        <Grid key={index} align="flex-end">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label={index === 0 ? t('scheduling.items.description', 'Description') : undefined}
              aria-label={t('scheduling.items.description', 'Description')}
              value={item.description || ''}
              onChange={e => update(index, 'description', e.currentTarget.value)}
              maxLength={300}
              required
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput
              label={index === 0 ? t('scheduling.items.code', 'Code') : undefined}
              aria-label={t('scheduling.items.code', 'Code')}
              value={item.code || ''}
              onChange={e => update(index, 'code', e.currentTarget.value)}
              maxLength={50}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 4, sm: 2 }}>
            <NumberInput
              label={index === 0 ? t('scheduling.items.quantity', 'Qty') : undefined}
              aria-label={t('scheduling.items.quantity', 'Qty')}
              value={item.quantity ?? ''}
              onChange={value => update(index, 'quantity', value)}
              min={1}
              max={999}
              allowDecimal={false}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 2, sm: 1 }}>
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => onChange(list.filter((_, i) => i !== index))}
              aria-label={t('scheduling.items.remove', 'Remove item')}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Grid.Col>
        </Grid>
      ))}
      <Button
        variant="light"
        size="xs"
        leftSection={<IconPlus size={14} />}
        onClick={() => onChange([...list, { description: '', code: '', quantity: '' }])}
        disabled={list.length >= MAX_ITEMS}
        style={{ alignSelf: 'flex-start' }}
      >
        {t('scheduling.items.add', 'Add item')}
      </Button>
    </Stack>
  );
};

PrescriptionItemsEditor.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      description: PropTypes.string,
      code: PropTypes.string,
      quantity: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    })
  ),
  onChange: PropTypes.func.isRequired,
};

export default PrescriptionItemsEditor;
