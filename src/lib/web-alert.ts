/**
 * React Native Web's Alert.alert does nothing, so confirmations ("Delete entry?")
 * and error messages would silently vanish in the browser. On web, route them to
 * the browser's own dialogs: one button → alert, two → confirm, more → our menu.
 */
import { Alert, Platform, type AlertButton } from 'react-native';

import { showMenu } from '@/components/menu';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = buttons ?? [];
    const cancel = list.find((b) => b.style === 'cancel');
    const actions = list.filter((b) => b !== cancel);
    if (actions.length <= 1) {
      if (cancel && actions.length === 1) {
        if (window.confirm(text)) actions[0].onPress?.();
        else cancel.onPress?.();
        return;
      }
      window.alert(text);
      actions[0]?.onPress?.();
      return;
    }
    showMenu(
      actions.map((b) => ({ label: b.text ?? 'OK', onPress: () => b.onPress?.(), destructive: b.style === 'destructive' })),
      text,
    );
  };
}
