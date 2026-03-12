import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, Colors, Spacing, Typography } from '../constants/theme';
import { useLocalization } from '../contexts/LocalizationContext';
import { useColorScheme } from '../hooks/use-color-scheme';
import { SyncState } from '../types/note';

interface SyncBadgeProps {
  syncState: SyncState;
}

export default function SyncBadge({ syncState }: SyncBadgeProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t } = useLocalization();

  if (syncState.status === 'idle') return null;

  const config = {
    syncing: {
      icon: 'sync-outline' as const,
      text: t('sync.badge.syncing'),
      bgColor: colors.primaryLight,
      textColor: colors.primary,
    },
    success: {
      icon: 'checkmark-circle-outline' as const,
      text: t('sync.badge.success'),
      bgColor: colors.successLight,
      textColor: colors.success,
    },
    error: {
      icon: 'alert-circle-outline' as const,
      text: syncState.error || t('sync.badge.failed'),
      bgColor: colors.dangerLight,
      textColor: colors.danger,
    },
  }[syncState.status];

  return (
    <View style={[styles.badge, { backgroundColor: config.bgColor }]}>
      <Ionicons name={config.icon} size={14} color={config.textColor} />
      <Text
        style={[Typography.caption, { color: config.textColor, marginLeft: Spacing.xs }]}
        numberOfLines={1}
      >
        {config.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
});

