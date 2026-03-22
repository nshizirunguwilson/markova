import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

// Configure how notifications are displayed when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    registerForPushNotifications().then((token) => {
      if (token) {
        setExpoPushToken(token);
        sendTokenToBackend(token);
      }
    });

    // Listen for incoming notifications while app is open
    notificationListener.current = Notifications.addNotificationReceivedListener((n) => {
      setNotification(n);
    });

    // Listen for user tapping on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data) handleNotificationTap(data);
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [isAuthenticated]);

  return { expoPushToken, notification };
}

async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? undefined;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined as any,
    );

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1B4F72',
        sound: 'default',
      });
    }

    return tokenData.data;
  } catch (error) {
    console.error('Failed to register for push notifications:', error);
    return null;
  }
}

async function sendTokenToBackend(token: string) {
  try {
    await api.post('/notifications/push-token', {
      token,
      platform: Platform.OS,
    });
  } catch (error) {
    console.log('Failed to register push token with backend:', error);
  }
}

function handleNotificationTap(data: Record<string, unknown>) {
  console.log('Notification tapped:', data);
}
