import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BorderRadius, Colors, Spacing, Typography } from '../constants/theme';
import { useLocalization } from '../contexts/LocalizationContext';
import { useColorScheme } from '../hooks/use-color-scheme';

interface DeleteConfirmProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirm({
  visible,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}: DeleteConfirmProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t } = useLocalization();
  const resolvedConfirmText = confirmText ?? t('common.delete');
  const resolvedCancelText = cancelText ?? t('common.cancel');

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={[styles.mask, { backgroundColor: colors.overlay }]} onPress={onCancel} />

      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <Text style={[Typography.heading, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>{message}</Text>

        <View style={styles.actions}>
          <Pressable style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={onCancel}>
            <Text style={[Typography.button, { color: colors.textSecondary }]}>{resolvedCancelText}</Text>
          </Pressable>
          <Pressable style={[styles.dangerBtn, { backgroundColor: colors.danger }]} onPress={onConfirm}>
            <Text style={[Typography.button, { color: colors.textInverse }]}>{resolvedConfirmText}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    zIndex: 20,
  },
  mask: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    width: '92%',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  secondaryBtn: {
    minHeight: 38,
    minWidth: 84,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  dangerBtn: {
    minHeight: 38,
    minWidth: 84,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
});
