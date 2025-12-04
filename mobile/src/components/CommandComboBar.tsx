import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import { SavedCombination } from '../types/savedCombinations';

interface CommandComboBarProps {
  combinations: SavedCombination[];
  expanded: boolean;
  onToggleExpand: () => void;
  onExecute: (combination: SavedCombination) => void;
}

export function CommandComboBar({
  combinations,
  expanded,
  onToggleExpand,
  onExecute,
}: CommandComboBarProps): React.ReactElement {
  const expandAnimation = React.useRef(new Animated.Value(expanded ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.timing(expandAnimation, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [expanded, expandAnimation]);

  const barHeight = expandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 48],
  });

  const barOpacity = expandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.barContainer, { height: barHeight, opacity: barOpacity }]}>
        {expanded && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            style={styles.scrollView}
          >
            {combinations.map((combo) => (
              <TouchableOpacity
                key={combo.id}
                style={styles.comboTile}
                onPress={() => onExecute(combo)}
              >
                <Text style={styles.comboText} numberOfLines={1}>
                  {combo.title}
                </Text>
              </TouchableOpacity>
            ))}
            {combinations.length === 0 && (
              <Text style={styles.emptyText}>No saved combinations</Text>
            )}
          </ScrollView>
        )}
      </Animated.View>

      <TouchableOpacity
        style={styles.toggleButton}
        onPress={onToggleExpand}
      >
        <Text style={styles.toggleButtonText}>{expanded ? '×' : '+'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  barContainer: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    gap: 8,
    paddingRight: 60, // Space for toggle button
  },
  comboTile: {
    backgroundColor: 'rgba(42, 42, 58, 0.6)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(42, 42, 58, 0.8)',
    minWidth: 60,
  },
  comboText: {
    color: '#8888aa',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: 13,
  },
  emptyText: {
    color: '#555566',
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  toggleButton: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -15,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(42, 42, 58, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(42, 42, 58, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleButtonText: {
    color: '#8888aa',
    fontSize: 18,
    fontWeight: '600',
    marginTop: -2,
  },
});

