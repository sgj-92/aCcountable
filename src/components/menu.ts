import { ActionSheetIOS, Alert, Platform } from 'react-native';

export interface MenuOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

/** A native action sheet on iOS; a plain dialog elsewhere. */
export function showMenu(options: MenuOption[], title?: string) {
  if (Platform.OS === 'ios') {
    const labels = [...options.map((o) => o.label), 'Cancel'];
    const destructive = options.map((o, i) => (o.destructive ? i : -1)).filter((i) => i >= 0);
    ActionSheetIOS.showActionSheetWithOptions(
      { options: labels, cancelButtonIndex: labels.length - 1, destructiveButtonIndex: destructive, title },
      (i) => {
        if (i < options.length) options[i].onPress();
      },
    );
    return;
  }
  Alert.alert(title ?? '', undefined, [
    ...options.map((o) => ({ text: o.label, onPress: o.onPress, style: o.destructive ? ('destructive' as const) : undefined })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}
