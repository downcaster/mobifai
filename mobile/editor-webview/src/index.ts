import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';

// Declare window interface for React Native WebView
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}

// Language compartment for dynamic language switching
const languageConf = new Compartment();
const readOnlyConf = new Compartment();

let editorView: EditorView | null = null;
let currentLanguage = 'javascript';

/**
 * Get language extension based on file extension or language name
 */
function getLanguageExtension(language: string) {
  const lang = language.toLowerCase();
  
  // Map file extensions to languages
  const extensionMap: Record<string, any> = {
    'js': javascript({ jsx: false, typescript: false }),
    'jsx': javascript({ jsx: true, typescript: false }),
    'ts': javascript({ jsx: false, typescript: true }),
    'tsx': javascript({ jsx: true, typescript: true }),
    'javascript': javascript({ jsx: false, typescript: false }),
    'typescript': javascript({ jsx: false, typescript: true }),
    'py': python(),
    'python': python(),
    'json': json(),
    'html': html(),
    'htm': html(),
    'css': css(),
    'md': markdown(),
    'markdown': markdown(),
  };
  
  return extensionMap[lang] || javascript({ jsx: false, typescript: false });
}

/**
 * Post message to React Native
 */
function postMessage(type: string, data?: any) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type, data }));
  } else {
    console.log('[Editor]', type, data);
  }
}

/**
 * Initialize CodeMirror editor
 */
function initEditor() {
  const container = document.getElementById('editor');
  if (!container) {
    console.error('Editor container not found');
    return;
  }

  // Save command keymap
  const saveKeymap = keymap.of([
    {
      key: 'Mod-s',
      run: () => {
        postMessage('save', { content: editorView?.state.doc.toString() });
        return true;
      },
    },
  ]);

  const startState = EditorState.create({
    doc: '// Loading...',
    extensions: [
      basicSetup,
      oneDark,
      languageConf.of(getLanguageExtension('javascript')),
      readOnlyConf.of(EditorState.readOnly.of(false)),
      keymap.of([...defaultKeymap, indentWithTab]),
      saveKeymap,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          postMessage('contentChanged', {
            content: update.state.doc.toString(),
          });
        }
      }),
      // Mobile-friendly settings
      EditorView.lineWrapping,
      EditorState.tabSize.of(2),
    ],
  });

  editorView = new EditorView({
    state: startState,
    parent: container,
  });

  // Notify React Native that editor is ready
  postMessage('ready');
}

/**
 * Handle messages from React Native
 */
function handleMessage(event: MessageEvent) {
  try {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
      case 'setContent':
        if (editorView && message.data?.content !== undefined) {
          const transaction = editorView.state.update({
            changes: {
              from: 0,
              to: editorView.state.doc.length,
              insert: message.data.content,
            },
          });
          editorView.dispatch(transaction);
        }
        break;
        
      case 'getContent':
        if (editorView) {
          postMessage('content', { content: editorView.state.doc.toString() });
        }
        break;
        
      case 'setLanguage':
        if (editorView && message.data?.language) {
          currentLanguage = message.data.language;
          editorView.dispatch({
            effects: languageConf.reconfigure(getLanguageExtension(currentLanguage)),
          });
        }
        break;
        
      case 'setReadOnly':
        if (editorView && message.data?.readOnly !== undefined) {
          editorView.dispatch({
            effects: readOnlyConf.reconfigure(
              EditorState.readOnly.of(message.data.readOnly)
            ),
          });
        }
        break;
        
      case 'focus':
        if (editorView) {
          editorView.focus();
        }
        break;
        
      default:
        console.warn('Unknown message type:', message.type);
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
}

// Listen for messages from React Native
window.addEventListener('message', handleMessage);
document.addEventListener('message', handleMessage as any); // For Android

// Initialize editor when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEditor);
} else {
  initEditor();
}

