/**
 * @format
 */

import 'react-native-gesture-handler'; // ← MUST be first import
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';
import { backgroundMessageHandler } from './src/services/fcmService';

// ── Register the FCM background handler BEFORE the React component tree mounts.
// This is required by @react-native-firebase/messaging — calling it inside a
// component or useEffect is too late for background/quit-state messages.
messaging().setBackgroundMessageHandler(backgroundMessageHandler);

AppRegistry.registerComponent(appName, () => App);
