import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import FolderMenu from '../../components/FolderMenu';
import NoteCard from '../../components/NoteCard';
import { BorderRadius, Colors, Spacing, Typography } from '../../constants/theme';
import { useNotes } from '../../contexts/NotesContext';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { Note } from '../../types/note';

type SortMode = 'alphabetical' | 'modified' | 'created';

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();

  const {
    notes,
    folders,
    loading,
    searchQuery,
    setSearchQuery,
    createNote,
    createFolder,
    deleteFolder,
    syncWithGitHub,
    removeNote,
    permanentlyDeleteNote,
    toggleNotePin,
    toggleNoteStar,
  } = useNotes();

  const [currentFolder, setCurrentFolder] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('modified');
  const [folderMenuVisible, setFolderMenuVisible] = useState(false);
  const [isPullSyncing, setIsPullSyncing] = useState(false);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: notes.filter((note) => !note.isDeleted).length,
      starred: notes.filter((note) => !note.isDeleted && note.isStarred).length,
      trash: notes.filter((note) => note.isDeleted).length,
    };

    for (const folder of folders) {
      counts[folder.id] = notes.filter(
        (note) => !note.isDeleted && note.folderIds.includes(folder.id)
      ).length;
    }

    return counts;
  }, [folders, notes]);

  const filteredNotes = useMemo(() => {
    let next: Note[] = [...notes];

    if (currentFolder === 'trash') {
      next = next.filter((note) => note.isDeleted);
    } else if (currentFolder === 'starred') {
      next = next.filter((note) => !note.isDeleted && note.isStarred);
    } else if (currentFolder === 'all') {
      next = next.filter((note) => !note.isDeleted);
    } else {
      next = next.filter(
        (note) => !note.isDeleted && note.folderIds.includes(currentFolder)
      );
    }

    if (searchQuery.trim()) {
      const keyword = searchQuery.toLowerCase();
      next = next.filter((note) =>
        note.content.toLowerCase().includes(keyword)
      );
    }

    next.sort((a, b) => {
      if (currentFolder !== 'trash') {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      }

      if (sortMode === 'alphabetical') {
        return a.content.localeCompare(b.content);
      }

      if (sortMode === 'created') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return next;
  }, [currentFolder, notes, searchQuery, sortMode]);

  async function handleCreate() {
    const targetFolder =
      currentFolder !== 'all' && currentFolder !== 'starred' && currentFolder !== 'trash'
        ? currentFolder
        : undefined;

    const note = await createNote('', targetFolder);
    router.push({ pathname: '/editor', params: { id: note.id } });
  }

  function getFolderLabel() {
    if (currentFolder === 'all') return 'All Notes';
    if (currentFolder === 'starred') return 'Starred';
    if (currentFolder === 'trash') return 'Recycle Bin';
    return folders.find((folder) => folder.id === currentFolder)?.name || 'All Notes';
  }

  function toggleSort() {
    setSortMode((prev) => {
      if (prev === 'modified') return 'created';
      if (prev === 'created') return 'alphabetical';
      return 'modified';
    });
  }

  function sortIcon() {
    if (sortMode === 'alphabetical') return 'text-outline';
    if (sortMode === 'created') return 'calendar-outline';
    return 'time-outline';
  }

  async function handleDeleteFolder(folderId: string) {
    await deleteFolder(folderId);
    if (currentFolder === folderId) {
      setCurrentFolder('all');
    }
  }

  async function handlePullToSync() {
    if (isPullSyncing) return;

    setIsPullSyncing(true);
    const result = await syncWithGitHub();
    setIsPullSyncing(false);

    if (result.ok) {
      Alert.alert('Sync successful', 'GitHub sync completed.');
      return;
    }

    Alert.alert('Sync failed', result.error || 'Please check your GitHub settings.');
  }

  async function handleDeleteNote(noteId: string) {
    if (currentFolder === 'trash') {
      await permanentlyDeleteNote(noteId);
      return;
    }
    await removeNote(noteId);
  }

  function confirmDeleteNote(note: Note) {
    const inTrash = currentFolder === 'trash';
    Alert.alert(
      inTrash ? 'Delete Note Permanently' : 'Move Note to Recycle Bin',
      inTrash
        ? 'This note will be removed permanently.'
        : 'This note will be moved to Recycle Bin.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: inTrash ? 'Delete' : 'Move',
          style: 'destructive',
          onPress: () => {
            handleDeleteNote(note.id);
          },
        },
      ]
    );
  }

  function renderNoteDeleteAction(
    note: Note,
    progress: Animated.AnimatedInterpolation<number>
  ) {
    const opacity = progress.interpolate({
      inputRange: [0, 0.35, 1],
      outputRange: [0, 0.55, 1],
      extrapolate: 'clamp',
    });
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [22, 0],
      extrapolate: 'clamp',
    });
    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.92, 1],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.noteDeleteWrap, { opacity, transform: [{ translateX }] }]}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Pressable
            onPress={() => confirmDeleteNote(note)}
            style={[styles.noteDeleteAction, { backgroundColor: '#E35050' }]}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
          </Pressable>
        </Animated.View>
      </Animated.View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.push('/(tabs)/settings')}>
          <Feather name="settings" size={22} color={colors.textSecondary} />
        </Pressable>

        <Pressable style={styles.titleBtn} onPress={() => setFolderMenuVisible(true)}>
          <Text style={[Typography.heading, { color: colors.textPrimary }]} numberOfLines={1}>
            {getFolderLabel()}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
        </Pressable>

        <Pressable onPress={handleCreate}>
          <Feather name="edit-3" size={22} color={currentFolder === 'trash' ? colors.textTertiary : colors.textSecondary} />
        </Pressable>
      </View>

      <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}> 
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search"
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
        <Pressable onPress={toggleSort}>
          <Ionicons name={sortIcon()} size={17} color={colors.textSecondary} />
        </Pressable>
      </View>

      <FlatList
        data={filteredNotes}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isPullSyncing}
            onRefresh={handlePullToSync}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.noteRow}>
            <Swipeable
              key={item.id}
              friction={2}
              rightThreshold={44}
              dragOffsetFromRightEdge={20}
              overshootRight={false}
              overshootLeft={false}
              renderRightActions={(progress) => renderNoteDeleteAction(item, progress)}
            >
              <NoteCard
                note={item}
                onPress={() => router.push({ pathname: '/editor', params: { id: item.id } })}
                onTogglePin={() => toggleNotePin(item.id)}
                onToggleStar={() => toggleNoteStar(item.id)}
              />
            </Swipeable>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No notes yet.</Text>
        }
        showsVerticalScrollIndicator={false}
      />

      <FolderMenu
        visible={folderMenuVisible}
        currentFolder={currentFolder}
        folders={folders}
        counts={folderCounts}
        onClose={() => setFolderMenuVisible(false)}
        onSelectFolder={setCurrentFolder}
        onCreateFolder={createFolder}
        onDeleteFolder={handleDeleteFolder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Spacing.xxxxl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  titleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    maxWidth: '68%',
  },
  searchRow: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  divider: {
    width: 1,
    height: 16,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 80,
  },
  noteRow: {
    marginBottom: Spacing.md,
  },
  noteDeleteWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteDeleteAction: {
    width: 68,
    height: 42,
    marginLeft: 8,
    marginRight: Spacing.xl,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});