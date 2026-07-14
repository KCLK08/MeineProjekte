import { Image, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

const logoSource = require('../../assets/images/bautagebuch-logo.png');

interface AppLogoProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

export function AppLogo({ size = 48, style, containerStyle }: AppLogoProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      <Image source={logoSource} style={[{ width: size, height: size }, style]} resizeMode="contain" accessibilityLabel="Bautagebuch Logo" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
