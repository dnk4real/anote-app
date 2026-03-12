import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '../constants/theme';
import { useLocalization } from '../contexts/LocalizationContext';
import { useColorScheme } from '../hooks/use-color-scheme';

export type AppDialogAction = {
  label: string;
  variant?: 'primary' | 'danger' | 'ghost';
  onPress?: () => void | Promise<void>;
};

type AppDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  actions: AppDialogAction[];
  onClose: () => void;
};

export default function AppDialog({ visible, title, message, actions, onClose }: AppDialogProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t } = useLocalization();

  const safeActions = useMemo(
    () => (actions.length > 0 ? actions : [{ label: t('common.ok'), variant: 'primary' as const }]),
    [actions, t]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.mask, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderLight,
              ...Shadows.cardHover,
              shadowColor: colors.shadowColorStrong,
            },
          ]}
          onPress={() => undefined}
        >
          <Text style={[Typography.heading, styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[Typography.bodySmall, styles.message, { color: colors.textSecondary }]}>{message}</Text>

          <View style={styles.actionsRow}>
            {safeActions.map((action, index) => {
              const variant = action.variant ?? 'ghost';
              const isGhost = variant === 'ghost';
              const isDanger = variant === 'danger';
              return (
                <Pressable
                  key={`${action.label}-${index}`}
                  style={[
                    styles.actionBtn,
                    {
                      borderColor: isGhost ? colors.border : isDanger ? colors.danger : colors.primary,
                      backgroundColor: isGhost ? 'transparent' : isDanger ? colors.dangerLight : colors.primaryLight,
                    },
                  ]}
                  onPress={() => {
                    onClose();
                    void action.onPress?.();
                  }}
                >
                  <Text
                    style={[
                      Typography.button,
                      {
                        color: isGhost ? colors.textSecondary : isDanger ? colors.danger : colors.primary,
                      },
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  panel: {
    width: '100%',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  message: {
    marginBottom: Spacing.lg,
    lineHeight: 21,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  actionBtn: {
    minWidth: 88,
    minHeight: 38,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
});
