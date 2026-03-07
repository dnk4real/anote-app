import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TextInput, View } from 'react-native';
import { BorderRadius, Colors, Spacing, Typography } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';

interface SearchBarProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
}

export default function SearchBar({ value, onChangeText, placeholder = '搜索笔记...' }: SearchBarProps) {
    const colorScheme = useColorScheme() ?? 'light';
    const colors = Colors[colorScheme];

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: colorScheme === 'dark' ? colors.surface : colors.primaryLight,
                    borderColor: colors.borderLight,
                },
            ]}
        >
            <Ionicons
                name="search"
                size={18}
                color={colors.textTertiary}
                style={styles.icon}
            />
            <TextInput
                style={[
                    Typography.body,
                    styles.input,
                    { color: colors.textPrimary },
                ]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
            />
            {value.length > 0 && (
                <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.textTertiary}
                    onPress={() => onChangeText('')}
                    style={styles.clearIcon}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        marginHorizontal: Spacing.lg,
        marginBottom: Spacing.lg,
        paddingHorizontal: Spacing.md,
        height: 44,
    },
    icon: {
        marginRight: Spacing.sm,
    },
    input: {
        flex: 1,
        paddingVertical: 0,
    },
    clearIcon: {
        marginLeft: Spacing.sm,
    },
});
