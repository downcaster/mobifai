import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface ArrowButtonsProps {
  onArrowPress: (direction: 'up' | 'down' | 'left' | 'right') => void;
  disabled?: boolean;
}

export function ArrowButtons({ onArrowPress, disabled = false }: ArrowButtonsProps): React.ReactElement {
  return (
    <View style={styles.container}>
      {/* Top row - Up arrow centered */}
      <View style={styles.topRow}>
        <TouchableOpacity
          style={[styles.button, disabled && styles.buttonDisabled]}
          onPress={() => onArrowPress('up')}
          disabled={disabled}
        >
          <Text style={styles.buttonText}>↑</Text>
        </TouchableOpacity>
      </View>
      
      {/* Bottom row - Left, Down, Right */}
      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={[styles.button, disabled && styles.buttonDisabled]}
          onPress={() => onArrowPress('left')}
          disabled={disabled}
        >
          <Text style={styles.buttonText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, disabled && styles.buttonDisabled]}
          onPress={() => onArrowPress('down')}
          disabled={disabled}
        >
          <Text style={styles.buttonText}>↓</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, disabled && styles.buttonDisabled]}
          onPress={() => onArrowPress('right')}
          disabled={disabled}
        >
          <Text style={styles.buttonText}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 4,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(42, 42, 58, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(42, 42, 58, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  buttonText: {
    color: '#8888aa',
    fontSize: 16,
    fontWeight: '700',
  },
});

