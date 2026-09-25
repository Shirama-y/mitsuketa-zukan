import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';

const isNative = Capacitor.isNativePlatform();

async function configureKeyboard() {
  if (!isNative || Capacitor.getPlatform() !== 'ios') return;

  try {
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
  } catch {
    // Keep the default WebView behavior if keyboard configuration is unavailable.
  }

  try {
    await Keyboard.setScroll({ isDisabled: false });
  } catch {
    // Scrolling remains enabled by default.
  }
}

async function setChromeTheme(theme = 'dark') {
  if (!isNative) return;

  const platform = Capacitor.getPlatform();

  try {
    // Android keeps a navy native status-bar background, so use light icons.
    // On iOS the status bar follows the current app screen: dark icons on
    // ivory screens, light icons on the navy library/cover screens.
    const style =
      platform === 'ios' && theme === 'light'
        ? Style.Dark
        : Style.Light;

    await StatusBar.setStyle({ style });

    if (platform === 'android') {
      await StatusBar.setBackgroundColor({ color: '#0F172A' });
    }

    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    // Status bar differences between iOS/Android are non-fatal.
  }
}

async function configureChrome() {
  if (!isNative) return;

  await setChromeTheme('dark');

  try {
    await SplashScreen.hide({ fadeOutDuration: 160 });
  } catch {
    // Native splash may already be hidden.
  }
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function pickPhoto() {
  if (!isNative) return null;

  const photo = await Camera.getPhoto({
    quality: 88,
    allowEditing: false,
    correctOrientation: true,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Prompt,
    width: 1800,
    height: 1800,
    saveToGallery: false,
  });

  if (!photo.dataUrl) {
    throw new Error('写真を取得できませんでした');
  }

  return dataUrlToBlob(photo.dataUrl);
}

async function haptic(kind = 'light') {
  if (!isNative) return;

  try {
    if (kind === 'success') {
      await Haptics.notification({ type: NotificationType.Success });
      return;
    }
    if (kind === 'warning') {
      await Haptics.notification({ type: NotificationType.Warning });
      return;
    }
    await Haptics.impact({
      style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light,
    });
  } catch {
    // Haptics are an enhancement. Never block the main workflow.
  }
}

async function shareBackup(fileName, jsonText) {
  if (!isNative) return false;

  const safeName = fileName || 'zukan-backup.json';

  await Filesystem.writeFile({
    path: safeName,
    data: jsonText,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  const uri = await Filesystem.getUri({
    path: safeName,
    directory: Directory.Cache,
  });

  await Share.share({
    title: 'わたしの図鑑 バックアップ',
    text: '図鑑のバックアップファイルです。',
    url: uri.uri,
    dialogTitle: 'バックアップを共有',
  });

  return true;
}

async function shareText(title, text) {
  if (!isNative) return false;

  await Share.share({
    title: title || 'わたしの図鑑',
    text: text || '',
    dialogTitle: '共有',
  });

  return true;
}

configureKeyboard();
configureChrome();

window.NativeZukan = {
  isNative,
  platform: Capacitor.getPlatform(),
  pickPhoto,
  haptic,
  shareBackup,
  shareText,
  setChromeTheme,
};

document.documentElement.classList.toggle('native-app', isNative);
window.dispatchEvent(new CustomEvent('nativezukanready'));
