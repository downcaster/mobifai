import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Keyboard,
} from 'react-native';
import {
  KEY_DEFINITIONS,
  KeyDefinition,
  searchKeys,
  combineKeys,
  formatKeysLabel,
} from '../config/keyCombinations';

export interface TerminalAction {
  type: 'text' | 'command';
  value: string; // For text, the actual text. For command, the escape sequence
  label?: string; // For command display (e.g., "CTRL+C")
}

interface KeyCombinationModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (actions: TerminalAction[]) => void;
}

type Item = 
  | { type: 'text'; value: string }
  | { type: 'command'; keys: KeyDefinition[]; label: string; value: string };

export function KeyCombinationModal({
  visible,
  onClose,
  onSend,
}: KeyCombinationModalProps): React.ReactElement {
  const [items, setItems] = useState<Item[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [suggestions, setSuggestions] = useState<KeyDefinition[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<TextInput>(null);
  
  // Building mode state
  const [buildingMode, setBuildingMode] = useState(false);
  const [buildingKeys, setBuildingKeys] = useState<KeyDefinition[]>([]);
  const [textBeforeBuilding, setTextBeforeBuilding] = useState('');

  // Update suggestions based on the last word when current text changes
  useEffect(() => {
    if (currentText.trim()) {
      // Get the last word for command search
      const words = currentText.split(' ');
      const lastWord = words[words.length - 1];
      
      if (lastWord) {
        const results = searchKeys(lastWord);
        setSuggestions(results.slice(0, 20)); // Limit to 20 suggestions
        setShowSuggestions(results.length > 0);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [currentText]);

  // Focus input when modal opens
  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      // Reset state when modal closes
      setItems([]);
      setCurrentText('');
      setSuggestions([]);
      setShowSuggestions(false);
      setBuildingMode(false);
      setBuildingKeys([]);
      setTextBeforeBuilding('');
    }
  }, [visible]);

  const addKeyToBuilding = (key: KeyDefinition): void => {
    if (!buildingMode) {
      // Enter building mode
      const words = currentText.split(' ');
      const textBefore = words.length > 1 ? words.slice(0, -1).join(' ') : '';
      
      setTextBeforeBuilding(textBefore);
      setBuildingMode(true);
      setBuildingKeys([key]);
      setCurrentText('');
      setShowSuggestions(false);
    } else {
      // Add to existing building
      setBuildingKeys([...buildingKeys, key]);
      setCurrentText('');
      setShowSuggestions(false);
    }
    inputRef.current?.focus();
  };

  const confirmBuilding = (): void => {
    if (buildingKeys.length > 0) {
      const newItems = [...items];
      
      // Add any text before building started
      if (textBeforeBuilding.trim()) {
        newItems.push({ type: 'text', value: textBeforeBuilding });
      }
      
      // Add the combined command
      const combinedEscape = combineKeys(buildingKeys);
      const label = formatKeysLabel(buildingKeys);
      
      newItems.push({ 
        type: 'command', 
        keys: buildingKeys,
        label,
        value: combinedEscape
      });
      
      setItems(newItems);
      setBuildingMode(false);
      setBuildingKeys([]);
      setTextBeforeBuilding('');
      setCurrentText('');
    }
    inputRef.current?.focus();
  };

  const cancelBuilding = (): void => {
    // Restore the text before building started
    if (textBeforeBuilding.trim()) {
      setCurrentText(textBeforeBuilding + ' ');
    }
    setBuildingMode(false);
    setBuildingKeys([]);
    setTextBeforeBuilding('');
    inputRef.current?.focus();
  };

  const removeItem = (index: number): void => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSend = (): void => {
    // If in building mode, confirm the building first
    if (buildingMode && buildingKeys.length > 0) {
      confirmBuilding();
      return; // Don't send yet, let user review
    }

    // Build final items array including any remaining text
    const finalItems = [...items];
    if (currentText.trim()) {
      finalItems.push({ type: 'text', value: currentText });
    }

    if (finalItems.length === 0) return;

    // Convert to action array
    const actions: TerminalAction[] = finalItems.map(item => {
      if (item.type === 'text') {
        return {
          type: 'text',
          value: item.value,
        };
      } else {
        return {
          type: 'command',
          value: item.value,
          label: item.label,
        };
      }
    });

    onSend(actions);
    onClose();
  };

  const handleTextChange = (text: string): void => {
    // Just update the current text - space no longer auto-selects
    setCurrentText(text);
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }): void => {
    const key = e.nativeEvent.key;
    
    // Escape key cancels building mode
    if (key === 'Escape' && buildingMode) {
      cancelBuilding();
      return;
    }
    
    // Enter key behavior
    if (key === 'Enter') {
      if (buildingMode && buildingKeys.length > 0) {
        // Confirm the building
        confirmBuilding();
      } else if (suggestions.length > 0 && currentText.trim()) {
        // Start building with first suggestion
        addKeyToBuilding(suggestions[0]);
      }
    }
  };

  const renderItem = (item: Item, index: number): React.ReactElement => {
    if (item.type === 'text') {
      return (
        <View key={`text-${index}`} style={styles.textTile}>
          <Text style={styles.textTileText} numberOfLines={1}>
            "{item.value}"
          </Text>
          <TouchableOpacity
            onPress={() => removeItem(index)}
            style={styles.tileRemove}
          >
            <Text style={styles.tileRemoveText}>×</Text>
          </TouchableOpacity>
        </View>
      );
    } else {
      return (
        <View key={`cmd-${index}`} style={styles.commandTile}>
          <Text style={styles.commandTileText}>{item.label}</Text>
          <TouchableOpacity
            onPress={() => removeItem(index)}
            style={styles.tileRemove}
          >
            <Text style={styles.tileRemoveText}>×</Text>
          </TouchableOpacity>
        </View>
      );
    }
  };

  const renderSuggestionItem = ({ item, index }: { item: KeyDefinition; index: number }): React.ReactElement => (
    <TouchableOpacity
      style={[
        styles.suggestionItem,
        index === 0 && styles.suggestionItemSelected,
      ]}
      onPress={() => addKeyToBuilding(item)}
    >
      <Text style={styles.suggestionSymbol}>{item.symbol}</Text>
      {item.name && <Text style={styles.suggestionName}>{item.name}</Text>}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.modalContainer}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
            {/* Building Mode Preview */}
            {buildingMode && (
              <View style={styles.buildingPreview}>
                <View style={styles.buildingKeys}>
                  {buildingKeys.map((key, index) => (
                    <React.Fragment key={index}>
                      <View style={styles.buildingKeyBadge}>
                        <Text style={styles.buildingKeyText}>{key.symbol}</Text>
                      </View>
                      {index < buildingKeys.length - 1 && (
                        <Text style={styles.buildingPlus}>+</Text>
                      )}
                    </React.Fragment>
                  ))}
                </View>
                <View style={styles.buildingActions}>
                  <TouchableOpacity
                    style={styles.buildingConfirm}
                    onPress={confirmBuilding}
                  >
                    <Text style={styles.buildingConfirmText}>✓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.buildingCancel}
                    onPress={cancelBuilding}
                  >
                    <Text style={styles.buildingCancelText}>×</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Input Container with Items */}
            <View style={styles.inputContainer}>
            <View style={styles.itemsRow}>
              {items.map((item, index) => renderItem(item, index))}
              <TextInput
                ref={inputRef}
                style={styles.textInput}
                value={currentText}
                onChangeText={handleTextChange}
                onKeyPress={handleKeyPress}
                placeholder={items.length === 0 && !currentText ? "Type text or search commands..." : ""}
                placeholderTextColor="#555566"
                autoCapitalize="none"
                autoCorrect={false}
                multiline={false}
                blurOnSubmit={false}
                onSubmitEditing={(e) => {
                  // Prevent default behavior
                  e.preventDefault();
                  if (buildingMode && buildingKeys.length > 0) {
                    confirmBuilding();
                  } else if (suggestions.length > 0 && currentText.trim()) {
                    addKeyToBuilding(suggestions[0]);
                  }
                }}
              />
            </View>
          </View>

          {/* Suggestions Dropdown */}
          {showSuggestions && (
            <View style={styles.suggestionsContainer}>
              <FlatList
                data={suggestions}
                renderItem={renderSuggestionItem}
                keyExtractor={(item, index) => `${item.symbol}-${index}`}
                style={styles.suggestionsList}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}
              />
            </View>
          )}

          {/* Send Button */}
          <TouchableOpacity
            style={[
              styles.sendButton,
              (items.length === 0 && !currentText.trim()) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={items.length === 0 && !currentText.trim()}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 15, 0.6)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 80,
  },
  modalContainer: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: 'rgba(26, 26, 37, 0.85)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(98, 0, 238, 0.3)',
  },
  buildingPreview: {
    backgroundColor: 'rgba(98, 0, 238, 0.15)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(98, 0, 238, 0.3)',
  },
  buildingKeys: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'wrap',
    gap: 6,
  },
  buildingKeyBadge: {
    backgroundColor: 'rgba(42, 42, 58, 0.8)',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(98, 0, 238, 0.4)',
  },
  buildingKeyText: {
    color: '#BB86FC',
    fontSize: 12,
    fontWeight: '600',
  },
  buildingPlus: {
    color: '#8888aa',
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 2,
  },
  buildingActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 12,
  },
  buildingConfirm: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 200, 100, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 100, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buildingConfirmText: {
    color: '#00ff88',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buildingCancel: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 50, 50, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 50, 50, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buildingCancelText: {
    color: '#ff6666',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: -2,
  },
  inputContainer: {
    backgroundColor: '#12121a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    padding: 8,
    minHeight: 48,
  },
  itemsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  textTile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a25',
    borderRadius: 6,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 6,
    maxWidth: 200,
  },
  textTileText: {
    color: '#BB86FC',
    fontSize: 14,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  commandTile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6200EE',
    borderRadius: 6,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 6,
  },
  commandTileText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  tileRemove: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileRemoveText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: -2,
  },
  textInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    minWidth: 100,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  suggestionsContainer: {
    backgroundColor: '#12121a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginTop: 8,
    maxHeight: 200,
    overflow: 'hidden',
  },
  suggestionsList: {
    flexGrow: 0,
  },
  suggestionItem: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a25',
    flexDirection: 'column',
    alignItems: 'center',
  },
  suggestionItemSelected: {
    backgroundColor: 'rgba(98, 0, 238, 0.2)',
    borderLeftWidth: 3,
    borderLeftColor: '#6200EE',
  },
  suggestionSymbol: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 1,
  },
  suggestionName: {
    color: '#8888aa',
    fontSize: 9,
    fontWeight: '400',
  },
  sendButton: {
    backgroundColor: '#6200EE',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
