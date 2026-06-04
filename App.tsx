import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/context/AppContext';
import { LanguageProvider } from './src/context/LanguageContext';
import AppNavigator from './src/navigation/AppNavigator';
import Toast from 'react-native-toast-message';
import AuthBootstrap from './src/navigation/AuthBootstrap';
import CropBootstrap from './src/navigation/CropBootstrap';
import NotificationBootstrap from './src/navigation/NotificationBootstrap';
import MessageBootstrap from './src/navigation/MessageBootstrap';
import ComplaintBootstrap from './src/navigation/ComplaintBootstrap';
import FundingBootstrap from './src/navigation/FundingBootstrap';
import AuctionBootstrap from './src/navigation/AuctionBootstrap';
import OrdersBootstrap from './src/navigation/OrdersBootstrap';
import OneSignalBootstrap from './src/navigation/OneSignalBootstrap';

// NOTE: initOneSignalSDK() is now called INSIDE OneSignalBootstrap (useEffect)
// NOT here at module load time — calling it here caused silent failures because
// the React Native native bridge was not ready yet when this module executed.

const App = () => {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <LanguageProvider>
          <AppProvider>
            <AppNavigator />
            <AuthBootstrap />
            <OneSignalBootstrap />
            <CropBootstrap />
            <NotificationBootstrap />
            <MessageBootstrap />
            <ComplaintBootstrap />
            <FundingBootstrap />
            <AuctionBootstrap />
            <OrdersBootstrap />
            <Toast />
          </AppProvider>
        </LanguageProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

export default App;
