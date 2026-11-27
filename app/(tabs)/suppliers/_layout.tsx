import { Stack } from 'expo-router';
import { colors } from '../../../src/ui';

export default function SuppliersStack() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'slide_from_right' }} />;
}
