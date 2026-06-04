import React, { useEffect, useRef } from 'react';
import { BackHandler, ToastAndroid, Platform } from 'react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Auth screens
import RegistrationScreen from '../screens/auth/RegistrationScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import AccountPendingScreen from '../screens/auth/AccountPendingScreen';
import SuspendedScreen from '../screens/auth/SuspendedScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import EmailVerificationScreen from '../screens/auth/EmailVerificationScreen';

// Role dashboards
import FarmerNavigator from '../screens/farmer/FarmerNavigator';
import BuyerNavigator from '../screens/buyer/BuyerNavigator';
import InvestorNavigator from '../screens/investor/InvestorNavigator';
import MainAdminNavigator from '../screens/admin/MainAdminNavigator';
import SimpleAdminNavigator from '../screens/admin/SimpleAdminNavigator';

const Stack = createNativeStackNavigator();
export const navigationRef = createNavigationContainerRef<any>();

// Screens where back button should be fully blocked
const BLOCKED_SCREENS = ['AccountPending', 'Suspended'];

const AppNavigator = () => {
  const backPressedOnce = useRef(false);

  useEffect(() => {
    const onBackPress = () => {
      if (!navigationRef.isReady()) return false;

      const currentRoute = navigationRef.getCurrentRoute();
      const routeName = currentRoute?.name ?? '';

      // 1. Fully blocked screens (Pending / Suspended)
      if (BLOCKED_SCREENS.includes(routeName)) {
        return true;
      }

      // 2. Login screen — double-press to exit
      if (routeName === 'Login') {
        if (backPressedOnce.current) {
          BackHandler.exitApp();
          return true;
        }
        backPressedOnce.current = true;
        if (Platform.OS === 'android') {
          ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
        }
        setTimeout(() => { backPressedOnce.current = false; }, 2000);
        return true;
      }

      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {/* Auth */}
        <Stack.Screen name="Registration" component={RegistrationScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="AccountPending" component={AccountPendingScreen} />
        <Stack.Screen name="Suspended" component={SuspendedScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="EmailVerification" component={EmailVerificationScreen} />

        {/* Farmer */}
        <Stack.Screen name="FarmerDashboard" component={FarmerNavigator} />

        {/* Buyer */}
        <Stack.Screen name="BuyerDashboard" component={BuyerNavigator} />

        {/* Investor */}
        <Stack.Screen name="InvestorDashboard" component={InvestorNavigator} />

        {/* Main Admin */}
        <Stack.Screen name="MainAdminDashboard" component={MainAdminNavigator} />

        {/* Simple Admin */}
        <Stack.Screen name="SimpleAdminDashboard" component={SimpleAdminNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
