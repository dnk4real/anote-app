import { Tabs } from 'expo-router';
import { useLocalization } from '../../contexts/LocalizationContext';

export default function TabLayout() {
  const { t } = useLocalization();

  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          display: 'none',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.notes'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
          title: t('tabs.settings'),
        }}
      />
    </Tabs>
  );
}
