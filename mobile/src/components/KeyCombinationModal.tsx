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
  keysToEscapeSequence,
} from '../config/keyCombinations';

interface KeyCombinationModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (escapeSequence: string) => void;
}

export function KeyCombinationModal({
  visible,
  onClose,
  onSend,
}: KeyCombinationModalProps): React.ReactElement {
  const [selectedKeys, setSelectedKeys] = useState<KeyDefinition[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<KeyDefinition[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Update suggestions when search query changes
  useEffect(() => {
    if (searchQuery.trim()) {
      const results = searchKeys(searchQuery);
      setSuggestions(results.slice(0, 20)); // Limit to 20 suggestions
      setShowSuggestions(results.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [searchQuery]);

  // Focus input when modal opens
  useEffect(() => {
    if (visible) {
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      // Reset state when modal closes
      setSelectedKeys([]);
      setSearchQuery('');
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [visible]);

  const handleAddKey = (key: KeyDefinition): void => {
    // Avoid duplicates
    if (!selectedKeys.some(k => k.symbol === key.symbol)) {
      setSelectedKeys([...selectedKeys, key]);
    }
    setSearchQuery('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleRemoveKey = (index: number): void => {
    setSelectedKeys(selectedKeys.filter((_, i) => i !== index));
  };

  const handleSend = (): void => {
    if (selectedKeys.length === 0) return;
    
    const escapeSequence = keysToEscapeSequence(selectedKeys);
    onSend(escapeSequence);
    onClose();
  };

  const handleTextChange = (text: string): void => {
    // Check if the last character is a space
    if (text.endsWith(' ') && suggestions.length > 0 && text.trim() !== '') {
      // Select the first suggestion
      handleAddKey(suggestions[0]);
    } else {
      setSearchQuery(text);
    }
  };

  const renderKeyTile = (key: KeyDefinition, index: number): React.ReactElement => (
    <View key={`${key.symbol}-${index}`} style={styles.keyTile}>
      <Text style={styles.keyTileText}>{key.symbol}</Text>
      <TouchableOpacity
        onPress={() => handleRemoveKey(index)}
        style={styles.keyTileRemove}
      >
        <Text style={styles.keyTileRemoveText}>×</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSuggestionItem = ({ item, index }: { item: KeyDefinition; index: number }): React.ReactElement => (
    <TouchableOpacity
      style={[
        styles.suggestionItem,
        index === 0 && styles.suggestionItemSelected,
      ]}
      onPress={() => handleAddKey(item)}
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
          {/* Input Container with Selected Keys */}
          <View style={styles.inputContainer}>
            <View style={styles.selectedKeysRow}>
              {selectedKeys.map((key, index) => renderKeyTile(key, index))}
              <TextInput
                ref={inputRef}
                style={styles.textInput}
                value={searchQuery}
                onChangeText={handleTextChange}
                placeholder={selectedKeys.length === 0 ? "Type to search keys..." : ""}
                placeholderTextColor="#555566"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (suggestions.length > 0 && searchQuery.trim()) {
                    handleAddKey(suggestions[0]);
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
              selectedKeys.length === 0 && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={selectedKeys.length === 0}
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
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 80,
  },
  modalContainer: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: 'rgba(26, 26, 37, 0.95)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(98, 0, 238, 0.3)',
  },
  inputContainer: {
    backgroundColor: '#12121a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    padding: 8,
    minHeight: 48,
  },
  selectedKeysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  keyTile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6200EE',
    borderRadius: 6,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 6,
  },
  keyTileText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  keyTileRemove: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyTileRemoveText: {
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

