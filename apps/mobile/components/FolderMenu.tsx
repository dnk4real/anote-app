import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import DeleteConfirm from './DeleteConfirm';
import { BorderRadius, Colors, Spacing, Typography } from '../constants/theme';
import { useFontSettings } from '../contexts/FontContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useColorScheme } from '../hooks/use-color-scheme';
import { Folder } from '../types/note';

interface FolderMenuProps {
  visible: boolean;
  currentFolder: string;
  folders: Folder[];
  counts: Record<string, number>;
  onClose: () => void;
  onSelectFolder: (folderId: string) => void;
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (folderId: string) => Promise<void>;
}

export default function FolderMenu({
  visible,
  currentFolder,
  folders,
  counts,
  onClose,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
}: FolderMenuProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { appFontStyle } = useFontSettings();
  const { t } = useLocalization();
  const [folderName, setFolderName] = useState('');
  const [activeSwipeFolderId, setActiveSwipeFolderId] = useState<string | null>(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<Folder | null>(null);
  const systemFolders = [
    { id: 'all', label: t('folder.system.all'), icon: 'document-text-outline' as const },
    { id: 'starred', label: t('folder.system.starred'), icon: 'star-outline' as const },
    { id: 'trash', label: t('folder.system.trash'), icon: 'trash-outline' as const },
  ];

  function submitFolder() {
    const name = folderName.trim();
    if (!name) return;
    onCreateFolder(name);
    setFolderName('');
  }

  function confirmDeleteFolder(folder: Folder) {
    setPendingDeleteFolder(folder);
  }

  function renderDeleteAction(folder: Folder, progress: Animated.AnimatedInterpolation<number>) {
    const opacity = progress.interpolate({
      inputRange: [0, 0.35, 1],
      outputRange: [0, 0.55, 1],
      extrapolate: 'clamp',
    });
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [18, 0],
      extrapolate: 'clamp',
    });
    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.96, 1],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.deleteActionWrap, { opacity, transform: [{ translateX }] }]}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Pressable
            onPress={() => confirmDeleteFolder(folder)}
            style={[styles.deleteAction, styles.deleteActionRight, { backgroundColor: '#E35050' }]}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
          </Pressable>
        </Animated.View>
      </Animated.View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
          <Pressable style={[styles.panel, { backgroundColor: colors.surface }]} onPress={() => undefined}>
            <ScrollView style={{ maxHeight: 320 }}>
              {systemFolders.map((folder) => (
                <Pressable
                  key={folder.id}
                  onPress={() => {
                    onSelectFolder(folder.id);
                    onClose();
                  }}
                  style={[styles.item, currentFolder === folder.id && { backgroundColor: colors.primaryLight }]}
                >
                  <View style={styles.itemLeft}>
                    <Ionicons name={folder.icon} size={18} color={colors.textSecondary} />
                    <Text style={[Typography.bodySmall, appFontStyle, { color: colors.textPrimary }]}>{folder.label}</Text>
                  </View>
                  <Text style={[Typography.caption, { color: colors.textTertiary }]}>{counts[folder.id] ?? 0}</Text>
                </Pressable>
              ))}

              {folders.map((folder) => (
                <Swipeable
                  key={folder.id}
                  friction={2}
                  rightThreshold={40}
                  dragOffsetFromRightEdge={22}
                  overshootRight={false}
                  overshootLeft={false}
                  onSwipeableWillOpen={() => setActiveSwipeFolderId(folder.id)}
                  onSwipeableClose={() =>
                    setActiveSwipeFolderId((current) => (current === folder.id ? null : current))
                  }
                  renderRightActions={(progress) => renderDeleteAction(folder, progress)}
                >
                  <Pressable
                    onPress={() => {
                      onSelectFolder(folder.id);
                      onClose();
                    }}
                    style={[styles.item, currentFolder === folder.id && { backgroundColor: colors.primaryLight }]}
                  >
                    <View style={styles.itemLeft}>
                      <Ionicons name="folder-outline" size={18} color={colors.textSecondary} />
                      <Text style={[Typography.bodySmall, appFontStyle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {folder.name}
                      </Text>
                    </View>
                    {activeSwipeFolderId !== folder.id && (
                      <Text style={[Typography.caption, { color: colors.textTertiary }]}>
                        {counts[folder.id] ?? 0}
                      </Text>
                    )}
                  </Pressable>
                </Swipeable>
              ))}
            </ScrollView>

            <View style={[styles.addRow, { borderTopColor: colors.borderLight }]}>
              <TextInput
                placeholder={t('folder.newPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={folderName}
                onChangeText={setFolderName}
                style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                onSubmitEditing={submitFolder}
              />
              <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={submitFolder}>
                <Ionicons name="checkmark" size={16} color={colors.textInverse} />
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </GestureHandlerRootView>

      <DeleteConfirm
        visible={!!pendingDeleteFolder}
        title={t('folder.deleteTitle')}
        message={pendingDeleteFolder ? t('folder.deleteMessage', { name: pendingDeleteFolder.name }) : ''}
        onCancel={() => setPendingDeleteFolder(null)}
        onConfirm={async () => {
          if (!pendingDeleteFolder) return;
          const folderId = pendingDeleteFolder.id;
          setPendingDeleteFolder(null);
          await onDeleteFolder(folderId);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 94,
  },
  panel: {
    width: '90%',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  addRow: {
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAction: {
    width: 58,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionWrap: {
    justifyContent: 'center',
    paddingVertical: 4,
  },
  deleteActionRight: {
    marginLeft: 4,
    marginRight: Spacing.xs,
  },
});
