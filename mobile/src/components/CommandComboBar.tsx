import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SavedCombination } from "../types/savedCombinations";

interface CommandComboBarProps {
  combinations: SavedCombination[];
  onExecute: (combination: SavedCombination) => void;
}

export function CommandComboBar({
  combinations,
  onExecute,
}: CommandComboBarProps): React.ReactElement {
  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
    gap: 8,
  },
  comboTile: {
    backgroundColor: "rgba(42, 42, 58, 0.6)",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(42, 42, 58, 0.8)",
    minWidth: 60,
  },
  comboText: {
    color: "#8888aa",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    includeFontPadding: false,
    lineHeight: 13,
  },
  emptyText: {
    color: "#555566",
    fontSize: 12,
    fontStyle: "italic",
    paddingVertical: 4,
  },
});
