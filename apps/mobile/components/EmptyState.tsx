import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '../constants/theme';
import { useLocalization } from '../contexts/LocalizationContext';
import { useColorScheme } from '../hooks/use-color-scheme';

interface EmptyStateProps {
  searching?: boolean;
}

export default function EmptyState({ searching }: EmptyStateProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t } = useLocalization();

  return (
    <View style={styles.container}>
      <Ionicons
        name={searching ? 'search-outline' : 'document-text-outline'}
        size={64}
        color={colors.borderLight}
      />
      <Text style={[Typography.heading, { color: colors.textTertiary, marginTop: Spacing.lg }]}>
        {searching ? t('empty.searchTitle') : t('empty.noNotesTitle')}
      </Text>
      <Text
        style={[
          Typography.bodySmall,
          { color: colors.textTertiary, marginTop: Spacing.sm, textAlign: 'center' },
        ]}
      >
        {searching ? t('empty.searchSubtitle') : t('empty.noNotesSubtitle')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
    paddingBottom: 80,
  },
});

