import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { BorderRadius, Colors, Spacing, Typography } from '../constants/theme';
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

const SYSTEM_FOLDERS = [
  { id: 'all', label: 'All Notes', icon: 'document-text-outline' as const },
  { id: 'starred', label: 'Starred', icon: 'star-outline' as const },
  { id: 'trash', label: 'Recycle Bin', icon: 'trash-outline' as const },
];

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
  const [folderName, setFolderName] = useState('');
  const [activeSwipeFolderId, setActiveSwipeFolderId] = useState<string | null>(null);

  function submitFolder() {
    const name = folderName.trim();
    if (!name) return;
    onCreateFolder(name);
    setFolderName('');
  }

  function confirmDeleteFolder(folder: Folder) {
    Alert.alert(
      'Delete Folder',
      `Delete "${folder.name}"? Notes inside will be kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDeleteFolder(folder.id);
          },
        },
      ]
    );
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
              {SYSTEM_FOLDERS.map((folder) => (
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
                    <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>{folder.label}</Text>
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
                      <Text style={[Typography.bodySmall, { color: colors.textPrimary }]} numberOfLines={1}>
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
                placeholder="New folder"
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