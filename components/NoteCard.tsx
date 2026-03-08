import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '../constants/theme';
import { useFontSettings } from '../contexts/FontContext';
import { useColorScheme } from '../hooks/use-color-scheme';
import { Note } from '../types/note';

interface NoteCardProps {
  note: Note;
  onPress: () => void;
  onTogglePin: () => void;
  onToggleStar: () => void;
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncatePreview(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const hardCut = text.slice(0, maxChars);
  const lastSpace = hardCut.lastIndexOf(' ');

  // Prefer whole words for space-separated languages; fallback to hard cut.
  const safeCut = lastSpace > 0 ? hardCut.slice(0, lastSpace) : hardCut;
  return `${safeCut.trimEnd()}...`;
}

export default function NoteCard({ note, onPress, onTogglePin, onToggleStar }: NoteCardProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { appFontStyle } = useFontSettings();

  const preview = stripHtml(note.content);
  const compactPreview = truncatePreview(preview, 36);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderLight,
          ...Shadows.card,
          shadowColor: colors.shadowColor,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={styles.metaRow}>
        <Text style={[Typography.caption, { color: colors.textTertiary }]}> 
          {format(new Date(note.updatedAt), 'yyyy/MM/dd HH:mm')}
        </Text>

        <View style={styles.actions}>
          <Pressable onPress={onTogglePin} hitSlop={8}>
            <MaterialIcons
              name="push-pin"
              size={14}
              color={note.isPinned ? colors.star : colors.textTertiary}
            />
          </Pressable>
          <Pressable onPress={onToggleStar} hitSlop={8}>
            <MaterialIcons
              name="star"
              size={15}
              color={note.isStarred ? colors.star : colors.textTertiary}
            />
          </Pressable>
        </View>
      </View>

      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[
          Typography.body,
          appFontStyle,
          compactPreview
            ? { color: colors.textPrimary }
            : { color: colors.textSecondary, fontStyle: 'italic' },
        ]}
      >
        {compactPreview || "It's empty now, maybe write something?"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
