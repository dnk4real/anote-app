import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';

interface EmptyStateProps {
    searching?: boolean;
}

export default function EmptyState({ searching }: EmptyStateProps) {
    const colorScheme = useColorScheme() ?? 'light';
    const colors = Colors[colorScheme];

    return (
        <View style={styles.container}>
            <Ionicons
                name={searching ? 'search-outline' : 'document-text-outline'}
                size={64}
                color={colors.borderLight}
            />
            <Text style={[Typography.heading, { color: colors.textTertiary, marginTop: Spacing.lg }]}>
                {searching ? '没有找到匹配的笔记' : '还没有笔记'}
            </Text>
            <Text style={[Typography.bodySmall, { color: colors.textTertiary, marginTop: Spacing.sm, textAlign: 'center' }]}>
                {searching ? '试试其他关键词' : '点击右下角的 + 按钮\n创建你的第一条笔记'}
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
