/**
 * Key Combinations Configuration
 * 
 * Defines all possible keys that can be sent to the terminal,
 * including their symbols, names, search terms, and escape sequences.
 */

export type KeyType = 'letter' | 'modifier' | 'special' | 'function' | 'navigation' | 'control';

export interface KeyDefinition {
  symbol: string;
  name: string;
  searchTerms: string[];
  type: KeyType;
  escapeSequence?: string;
}

export const KEY_DEFINITIONS: KeyDefinition[] = [
  // Lowercase Letters (a-z)
  { symbol: 'a', name: '', searchTerms: ['a'], type: 'letter' },
  { symbol: 'b', name: '', searchTerms: ['b'], type: 'letter' },
  { symbol: 'c', name: '', searchTerms: ['c'], type: 'letter' },
  { symbol: 'd', name: '', searchTerms: ['d'], type: 'letter' },
  { symbol: 'e', name: '', searchTerms: ['e'], type: 'letter' },
  { symbol: 'f', name: '', searchTerms: ['f'], type: 'letter' },
  { symbol: 'g', name: '', searchTerms: ['g'], type: 'letter' },
  { symbol: 'h', name: '', searchTerms: ['h'], type: 'letter' },
  { symbol: 'i', name: '', searchTerms: ['i'], type: 'letter' },
  { symbol: 'j', name: '', searchTerms: ['j'], type: 'letter' },
  { symbol: 'k', name: '', searchTerms: ['k'], type: 'letter' },
  { symbol: 'l', name: '', searchTerms: ['l'], type: 'letter' },
  { symbol: 'm', name: '', searchTerms: ['m'], type: 'letter' },
  { symbol: 'n', name: '', searchTerms: ['n'], type: 'letter' },
  { symbol: 'o', name: '', searchTerms: ['o'], type: 'letter' },
  { symbol: 'p', name: '', searchTerms: ['p'], type: 'letter' },
  { symbol: 'q', name: '', searchTerms: ['q'], type: 'letter' },
  { symbol: 'r', name: '', searchTerms: ['r'], type: 'letter' },
  { symbol: 's', name: '', searchTerms: ['s'], type: 'letter' },
  { symbol: 't', name: '', searchTerms: ['t'], type: 'letter' },
  { symbol: 'u', name: '', searchTerms: ['u'], type: 'letter' },
  { symbol: 'v', name: '', searchTerms: ['v'], type: 'letter' },
  { symbol: 'w', name: '', searchTerms: ['w'], type: 'letter' },
  { symbol: 'x', name: '', searchTerms: ['x'], type: 'letter' },
  { symbol: 'y', name: '', searchTerms: ['y'], type: 'letter' },
  { symbol: 'z', name: '', searchTerms: ['z'], type: 'letter' },

  // Uppercase Letters (A-Z)
  { symbol: 'A', name: '', searchTerms: ['A'], type: 'letter' },
  { symbol: 'B', name: '', searchTerms: ['B'], type: 'letter' },
  { symbol: 'C', name: '', searchTerms: ['C'], type: 'letter' },
  { symbol: 'D', name: '', searchTerms: ['D'], type: 'letter' },
  { symbol: 'E', name: '', searchTerms: ['E'], type: 'letter' },
  { symbol: 'F', name: '', searchTerms: ['F'], type: 'letter' },
  { symbol: 'G', name: '', searchTerms: ['G'], type: 'letter' },
  { symbol: 'H', name: '', searchTerms: ['H'], type: 'letter' },
  { symbol: 'I', name: '', searchTerms: ['I'], type: 'letter' },
  { symbol: 'J', name: '', searchTerms: ['J'], type: 'letter' },
  { symbol: 'K', name: '', searchTerms: ['K'], type: 'letter' },
  { symbol: 'L', name: '', searchTerms: ['L'], type: 'letter' },
  { symbol: 'M', name: '', searchTerms: ['M'], type: 'letter' },
  { symbol: 'N', name: '', searchTerms: ['N'], type: 'letter' },
  { symbol: 'O', name: '', searchTerms: ['O'], type: 'letter' },
  { symbol: 'P', name: '', searchTerms: ['P'], type: 'letter' },
  { symbol: 'Q', name: '', searchTerms: ['Q'], type: 'letter' },
  { symbol: 'R', name: '', searchTerms: ['R'], type: 'letter' },
  { symbol: 'S', name: '', searchTerms: ['S'], type: 'letter' },
  { symbol: 'T', name: '', searchTerms: ['T'], type: 'letter' },
  { symbol: 'U', name: '', searchTerms: ['U'], type: 'letter' },
  { symbol: 'V', name: '', searchTerms: ['V'], type: 'letter' },
  { symbol: 'W', name: '', searchTerms: ['W'], type: 'letter' },
  { symbol: 'X', name: '', searchTerms: ['X'], type: 'letter' },
  { symbol: 'Y', name: '', searchTerms: ['Y'], type: 'letter' },
  { symbol: 'Z', name: '', searchTerms: ['Z'], type: 'letter' },

  // Numbers (0-9)
  { symbol: '0', name: 'zero', searchTerms: ['0', 'zero'], type: 'special' },
  { symbol: '1', name: 'one', searchTerms: ['1', 'one'], type: 'special' },
  { symbol: '2', name: 'two', searchTerms: ['2', 'two'], type: 'special' },
  { symbol: '3', name: 'three', searchTerms: ['3', 'three'], type: 'special' },
  { symbol: '4', name: 'four', searchTerms: ['4', 'four'], type: 'special' },
  { symbol: '5', name: 'five', searchTerms: ['5', 'five'], type: 'special' },
  { symbol: '6', name: 'six', searchTerms: ['6', 'six'], type: 'special' },
  { symbol: '7', name: 'seven', searchTerms: ['7', 'seven'], type: 'special' },
  { symbol: '8', name: 'eight', searchTerms: ['8', 'eight'], type: 'special' },
  { symbol: '9', name: 'nine', searchTerms: ['9', 'nine'], type: 'special' },

  // Modifiers
  { symbol: 'CTRL', name: 'Control', searchTerms: ['ctrl', 'control', 'CTRL', 'CONTROL'], type: 'modifier' },
  { symbol: 'ALT', name: 'Alt/Option', searchTerms: ['alt', 'option', 'opt', 'ALT', 'OPTION', 'OPT'], type: 'modifier' },
  { symbol: 'CMD', name: 'Command', searchTerms: ['cmd', 'command', 'CMD', 'COMMAND'], type: 'modifier' },
  { symbol: 'SHIFT', name: 'Shift', searchTerms: ['shift', 'SHIFT'], type: 'modifier' },
  { symbol: 'META', name: 'Meta', searchTerms: ['meta', 'META'], type: 'modifier' },

  // Navigation Keys
  { symbol: '↵', name: 'Enter', searchTerms: ['enter', 'return', 'ENTER', 'RETURN'], type: 'navigation', escapeSequence: '\r' },
  { symbol: '⇥', name: 'Tab', searchTerms: ['tab', 'TAB'], type: 'navigation', escapeSequence: '\t' },
  { symbol: 'SHIFT+TAB', name: 'Backtab', searchTerms: ['shift+tab', 'shift tab', 'backtab', 'SHIFT+TAB', 'SHIFT TAB', 'BACKTAB'], type: 'navigation', escapeSequence: '\x1b[Z' },
  { symbol: '⎋', name: 'Escape', searchTerms: ['escape', 'esc', 'ESCAPE', 'ESC'], type: 'navigation', escapeSequence: '\x1b' },
  { symbol: '␣', name: 'Space', searchTerms: ['space', 'SPACE'], type: 'navigation', escapeSequence: ' ' },
  { symbol: '⌫', name: 'Backspace', searchTerms: ['backspace', 'BACKSPACE'], type: 'navigation', escapeSequence: '\x7f' },
  { symbol: '⌦', name: 'Delete', searchTerms: ['delete', 'del', 'DELETE', 'DEL'], type: 'navigation', escapeSequence: '\x1b[3~' },
  { symbol: '↑', name: 'Up', searchTerms: ['up', 'arrow up', 'UP'], type: 'navigation', escapeSequence: '\x1b[A' },
  { symbol: '↓', name: 'Down', searchTerms: ['down', 'arrow down', 'DOWN'], type: 'navigation', escapeSequence: '\x1b[B' },
  { symbol: '→', name: 'Right', searchTerms: ['right', 'arrow right', 'RIGHT'], type: 'navigation', escapeSequence: '\x1b[C' },
  { symbol: '←', name: 'Left', searchTerms: ['left', 'arrow left', 'LEFT'], type: 'navigation', escapeSequence: '\x1b[D' },
  { symbol: '↖', name: 'Home', searchTerms: ['home', 'HOME'], type: 'navigation', escapeSequence: '\x1b[H' },
  { symbol: '↘', name: 'End', searchTerms: ['end', 'END'], type: 'navigation', escapeSequence: '\x1b[F' },
  { symbol: '⇞', name: 'Page Up', searchTerms: ['pageup', 'page up', 'pgup', 'PAGEUP'], type: 'navigation', escapeSequence: '\x1b[5~' },
  { symbol: '⇟', name: 'Page Down', searchTerms: ['pagedown', 'page down', 'pgdn', 'PAGEDOWN'], type: 'navigation', escapeSequence: '\x1b[6~' },

  // Function Keys
  { symbol: 'F1', name: 'Function 1', searchTerms: ['f1', 'F1'], type: 'function', escapeSequence: '\x1bOP' },
  { symbol: 'F2', name: 'Function 2', searchTerms: ['f2', 'F2'], type: 'function', escapeSequence: '\x1bOQ' },
  { symbol: 'F3', name: 'Function 3', searchTerms: ['f3', 'F3'], type: 'function', escapeSequence: '\x1bOR' },
  { symbol: 'F4', name: 'Function 4', searchTerms: ['f4', 'F4'], type: 'function', escapeSequence: '\x1bOS' },
  { symbol: 'F5', name: 'Function 5', searchTerms: ['f5', 'F5'], type: 'function', escapeSequence: '\x1b[15~' },
  { symbol: 'F6', name: 'Function 6', searchTerms: ['f6', 'F6'], type: 'function', escapeSequence: '\x1b[17~' },
  { symbol: 'F7', name: 'Function 7', searchTerms: ['f7', 'F7'], type: 'function', escapeSequence: '\x1b[18~' },
  { symbol: 'F8', name: 'Function 8', searchTerms: ['f8', 'F8'], type: 'function', escapeSequence: '\x1b[19~' },
  { symbol: 'F9', name: 'Function 9', searchTerms: ['f9', 'F9'], type: 'function', escapeSequence: '\x1b[20~' },
  { symbol: 'F10', name: 'Function 10', searchTerms: ['f10', 'F10'], type: 'function', escapeSequence: '\x1b[21~' },
  { symbol: 'F11', name: 'Function 11', searchTerms: ['f11', 'F11'], type: 'function', escapeSequence: '\x1b[23~' },
  { symbol: 'F12', name: 'Function 12', searchTerms: ['f12', 'F12'], type: 'function', escapeSequence: '\x1b[24~' },

  // Control Sequences (Ctrl+Key combinations)
  { symbol: 'CTRL+A', name: 'Move to beginning', searchTerms: ['ctrl+a', 'control+a', 'CTRL+A'], type: 'control', escapeSequence: '\x01' },
  { symbol: 'CTRL+C', name: 'Interrupt', searchTerms: ['ctrl+c', 'control+c', 'CTRL+C'], type: 'control', escapeSequence: '\x03' },
  { symbol: 'CTRL+D', name: 'End of input', searchTerms: ['ctrl+d', 'control+d', 'CTRL+D'], type: 'control', escapeSequence: '\x04' },
  { symbol: 'CTRL+E', name: 'Move to end', searchTerms: ['ctrl+e', 'control+e', 'CTRL+E'], type: 'control', escapeSequence: '\x05' },
  { symbol: 'CTRL+K', name: 'Kill line after', searchTerms: ['ctrl+k', 'control+k', 'CTRL+K'], type: 'control', escapeSequence: '\x0b' },
  { symbol: 'CTRL+L', name: 'Clear screen', searchTerms: ['ctrl+l', 'control+l', 'CTRL+L'], type: 'control', escapeSequence: '\x0c' },
  { symbol: 'CTRL+R', name: 'Search history', searchTerms: ['ctrl+r', 'control+r', 'CTRL+R'], type: 'control', escapeSequence: '\x12' },
  { symbol: 'CTRL+U', name: 'Kill line before', searchTerms: ['ctrl+u', 'control+u', 'CTRL+U'], type: 'control', escapeSequence: '\x15' },
  { symbol: 'CTRL+W', name: 'Delete word', searchTerms: ['ctrl+w', 'control+w', 'CTRL+W'], type: 'control', escapeSequence: '\x17' },
  { symbol: 'CTRL+Z', name: 'Suspend process', searchTerms: ['ctrl+z', 'control+z', 'CTRL+Z'], type: 'control', escapeSequence: '\x1a' },
  { symbol: 'CTRL+[', name: 'Escape', searchTerms: ['ctrl+[', 'control+[', 'CTRL+['], type: 'control', escapeSequence: '\x1b' },

  // Special Characters
  { symbol: '~', name: 'Tilde', searchTerms: ['~', 'tilde', 'TILDE'], type: 'special' },
  { symbol: '`', name: 'Backtick', searchTerms: ['`', 'backtick', 'grave', 'BACKTICK'], type: 'special' },
  { symbol: '!', name: 'Exclamation', searchTerms: ['!', 'exclamation', 'bang', 'EXCLAMATION'], type: 'special' },
  { symbol: '@', name: 'At', searchTerms: ['@', 'at', 'AT'], type: 'special' },
  { symbol: '#', name: 'Hash', searchTerms: ['#', 'hash', 'pound', 'HASH'], type: 'special' },
  { symbol: '$', name: 'Dollar', searchTerms: ['$', 'dollar', 'DOLLAR'], type: 'special' },
  { symbol: '%', name: 'Percent', searchTerms: ['%', 'percent', 'PERCENT'], type: 'special' },
  { symbol: '^', name: 'Caret', searchTerms: ['^', 'caret', 'CARET'], type: 'special' },
  { symbol: '&', name: 'Ampersand', searchTerms: ['&', 'ampersand', 'and', 'AMPERSAND'], type: 'special' },
  { symbol: '*', name: 'Asterisk', searchTerms: ['*', 'asterisk', 'star', 'ASTERISK'], type: 'special' },
  { symbol: '(', name: 'Left Parenthesis', searchTerms: ['(', 'lparen', 'left paren', 'LPAREN'], type: 'special' },
  { symbol: ')', name: 'Right Parenthesis', searchTerms: [')', 'rparen', 'right paren', 'RPAREN'], type: 'special' },
  { symbol: '-', name: 'Minus', searchTerms: ['-', 'minus', 'dash', 'hyphen', 'MINUS'], type: 'special' },
  { symbol: '_', name: 'Underscore', searchTerms: ['_', 'underscore', 'UNDERSCORE'], type: 'special' },
  { symbol: '=', name: 'Equal', searchTerms: ['=', 'equal', 'equals', 'EQUAL'], type: 'special' },
  { symbol: '+', name: 'Plus', searchTerms: ['+', 'plus', 'PLUS'], type: 'special' },
  { symbol: '[', name: 'Left Bracket', searchTerms: ['[', 'lbracket', 'left bracket', 'LBRACKET'], type: 'special' },
  { symbol: ']', name: 'Right Bracket', searchTerms: [']', 'rbracket', 'right bracket', 'RBRACKET'], type: 'special' },
  { symbol: '{', name: 'Left Brace', searchTerms: ['{', 'lbrace', 'left brace', 'LBRACE'], type: 'special' },
  { symbol: '}', name: 'Right Brace', searchTerms: ['}', 'rbrace', 'right brace', 'RBRACE'], type: 'special' },
  { symbol: '\\', name: 'Backslash', searchTerms: ['\\', 'backslash', 'BACKSLASH'], type: 'special' },
  { symbol: '|', name: 'Pipe', searchTerms: ['|', 'pipe', 'bar', 'PIPE'], type: 'special' },
  { symbol: ';', name: 'Semicolon', searchTerms: [';', 'semicolon', 'SEMICOLON'], type: 'special' },
  { symbol: ':', name: 'Colon', searchTerms: [':', 'colon', 'COLON'], type: 'special' },
  { symbol: "'", name: 'Single Quote', searchTerms: ["'", 'quote', 'single quote', 'apostrophe', 'QUOTE'], type: 'special' },
  { symbol: '"', name: 'Double Quote', searchTerms: ['"', 'double quote', 'quotes', 'DOUBLEQUOTE'], type: 'special' },
  { symbol: ',', name: 'Comma', searchTerms: [',', 'comma', 'COMMA'], type: 'special' },
  { symbol: '.', name: 'Period', searchTerms: ['.', 'period', 'dot', 'PERIOD'], type: 'special' },
  { symbol: '<', name: 'Less Than', searchTerms: ['<', 'less', 'lt', 'LESS'], type: 'special' },
  { symbol: '>', name: 'Greater Than', searchTerms: ['>', 'greater', 'gt', 'GREATER'], type: 'special' },
  { symbol: '/', name: 'Slash', searchTerms: ['/', 'slash', 'forward slash', 'SLASH'], type: 'special' },
  { symbol: '?', name: 'Question', searchTerms: ['?', 'question', 'QUESTION'], type: 'special' },
];

/**
 * Search for keys matching the query
 * @param query - Search query string
 * @returns Filtered array of matching key definitions
 */
export function searchKeys(query: string): KeyDefinition[] {
  if (!query.trim()) {
    return KEY_DEFINITIONS;
  }

  const trimmedQuery = query.trim();

  return KEY_DEFINITIONS.filter(key => {
    // For letters, use case-sensitive search
    if (key.type === 'letter') {
      return key.searchTerms.some(term => term === trimmedQuery);
    }
    
    // For all other types, use case-insensitive search
    const lowerQuery = trimmedQuery.toLowerCase();
    return key.searchTerms.some(term => 
      term.toLowerCase().includes(lowerQuery)
    );
  });
}

/**
 * Convert selected keys to their escape sequences
 * @param keys - Array of selected key definitions
 * @returns Combined string to send to terminal
 */
export function keysToEscapeSequence(keys: KeyDefinition[]): string {
  return keys.map(key => {
    if (key.escapeSequence) {
      return key.escapeSequence;
    }
    // For keys without escape sequences (like letters and special chars), just return the symbol
    return key.symbol;
  }).join('');
}

/**
 * Combine multiple keys into a single escape sequence for multi-key commands
 * @param keys - Array of key definitions to combine
 * @returns Combined escape sequence
 */
export function combineKeys(keys: KeyDefinition[]): string {
  if (keys.length === 0) return '';
  if (keys.length === 1) return keys[0].escapeSequence || keys[0].symbol;
  
  // Check if this is a known combination in KEY_DEFINITIONS
  const label = formatKeysLabel(keys);
  const predefined = KEY_DEFINITIONS.find(k => k.symbol === label);
  if (predefined?.escapeSequence) {
    return predefined.escapeSequence;
  }
  
  // Handle modifier + key combinations
  const modifiers = keys.filter(k => k.type === 'modifier');
  const nonModifiers = keys.filter(k => k.type !== 'modifier');
  
  // If we have exactly one non-modifier key and at least one modifier
  if (nonModifiers.length === 1 && modifiers.length > 0) {
    const targetKey = nonModifiers[0];
    const hasShift = modifiers.some(m => m.symbol === 'SHIFT');
    const hasCtrl = modifiers.some(m => m.symbol === 'CTRL');
    const hasAlt = modifiers.some(m => m.symbol === 'ALT');
    const hasMeta = modifiers.some(m => m.symbol === 'META' || m.symbol === 'CMD');
    
    // SHIFT + TAB = Backtab
    if (hasShift && targetKey.symbol === '⇥') {
      return '\x1b[Z';
    }
    
    // SHIFT + letter = uppercase letter
    if (hasShift && targetKey.type === 'letter' && !hasCtrl && !hasAlt) {
      return targetKey.symbol.toUpperCase();
    }
    
    // CTRL + letter (a-z) = Control character
    if (hasCtrl && targetKey.type === 'letter') {
      const letter = targetKey.symbol.toLowerCase();
      const code = letter.charCodeAt(0) - 96; // a=1, b=2, etc.
      if (code >= 1 && code <= 26) {
        return String.fromCharCode(code);
      }
    }
    
    // ALT/META + key = ESC + key
    if ((hasAlt || hasMeta) && targetKey.escapeSequence) {
      return '\x1b' + targetKey.escapeSequence;
    }
  }
  
  // Fallback: concatenate escape sequences
  return keys.map(k => k.escapeSequence || k.symbol).join('');
}

/**
 * Format multiple keys into a display label
 * @param keys - Array of key definitions
 * @returns Formatted label like "CTRL+P" or "SHIFT+TAB"
 */
export function formatKeysLabel(keys: KeyDefinition[]): string {
  return keys.map(k => k.symbol).join('+');
}

