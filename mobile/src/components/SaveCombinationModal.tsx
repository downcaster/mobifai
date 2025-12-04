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
} from '../config/keyCombinations';
import { TerminalAction } from './KeyCombinationModal';

interface SaveCombinationModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (title: string, actions: TerminalAction[]) => void;
  initialTitle?: string;
  initialActions?: TerminalAction[];
}

type Item = 
  | { type: 'text'; value: string }
  | { type: 'command'; key: KeyDefinition };

export function SaveCombinationModal({
  visible,
  onClose,
  onSave,
  initialTitle = '',
  initialActions = [],
}: SaveCombinationModalProps): React.ReactElement {
  const [title, setTitle] = useState(initialTitle);
  const [items, setItems] = useState<Item[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [suggestions, setSuggestions] = useState<KeyDefinition[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Update suggestions based on the last word when current text changes
  useEffect(() => {
    if (currentText.trim()) {
      const words = currentText.split(' ');
      const lastWord = words[words.length - 1];
      
      console.log('SaveCombinationModal - searching for:', lastWord);
      
      if (lastWord) {
        const results = searchKeys(lastWord);
        console.log('SaveCombinationModal - results:', results.length);
        setSuggestions(results.slice(0, 20));
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

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setTitle(initialTitle || '');
      
      // Convert initialActions to items if editing
      if (initialActions && initialActions.length > 0) {
        const convertedItems: Item[] = initialActions.map(action => {
          if (action.type === 'text') {
            return { type: 'text', value: action.value };
          } else {
            // Find the key definition from the label
            const keyDef = KEY_DEFINITIONS.find(k => k.symbol === action.label);
            if (keyDef) {
              return { type: 'command', key: keyDef };
            }
            // Fallback if not found
            return { type: 'text', value: action.label || action.value };
          }
        });
        setItems(convertedItems);
      } else {
        setItems([]);
      }
      
      setCurrentText('');
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [visible]);

  const addCommand = (key: KeyDefinition): void => {
    const newItems = [...items];
    
    const words = currentText.split(' ');
    if (words.length > 1) {
      const textBeforeSearch = words.slice(0, -1).join(' ');
      if (textBeforeSearch.trim()) {
        newItems.push({ type: 'text', value: textBeforeSearch });
      }
    }
    
    newItems.push({ type: 'command', key });
    
    setItems(newItems);
    setCurrentText('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeItem = (index: number): void => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = (): void => {
    if (!title.trim()) {
      return;
    }

    const finalItems = [...items];
    if (currentText.trim()) {
      finalItems.push({ type: 'text', value: currentText });
    }

    if (finalItems.length === 0) return;

    const actions: TerminalAction[] = finalItems.map(item => {
      if (item.type === 'text') {
        return {
          type: 'text',
          value: item.value,
        };
      } else {
        return {
          type: 'command',
          value: item.key.escapeSequence || item.key.symbol,
          label: item.key.symbol,
        };
      }
    });

    onSave(title, actions);
    onClose();
  };

  const handleTextChange = (text: string): void => {
    setCurrentText(text);
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }): void => {
    if (e.nativeEvent.key === 'Enter' && suggestions.length > 0 && currentText.trim()) {
      addCommand(suggestions[0]);
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
          <Text style={styles.commandTileText}>{item.key.symbol}</Text>
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
      onPress={() => addCommand(item)}
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
          {/* Title Input */}
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Combination title"
            placeholderTextColor="#555566"
            autoCapitalize="words"
            autoCorrect={false}
          />

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
                  e.preventDefault();
                  if (suggestions.length > 0 && currentText.trim()) {
                    addCommand(suggestions[0]);
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

          {/* Save Button */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              (!title.trim() || (items.length === 0 && !currentText.trim())) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!title.trim() || (items.length === 0 && !currentText.trim())}
          >
            <Text style={styles.saveButtonText}>Save</Text>
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
  titleInput: {
    backgroundColor: '#12121a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    padding: 12,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
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
  saveButton: {
    backgroundColor: '#6200EE',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

