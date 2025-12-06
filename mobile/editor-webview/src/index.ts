import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment, StateField, StateEffect } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { keymap, Decoration, DecorationSet, WidgetType, gutter, GutterMarker } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';

// Declare window interface for React Native WebView
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}

// Types for diff data
interface DeletedLinesInfo {
  afterLine: number;
  content: string[];
}

interface DiffData {
  addedLines: number[];
  deletedLines: DeletedLinesInfo[];
  modifiedLines: number[];
  mode: 'off' | 'gutter' | 'inline';
}

// Language compartment for dynamic language switching
const languageConf = new Compartment();
const readOnlyConf = new Compartment();
const diffGutterConf = new Compartment();

let editorView: EditorView | null = null;
let currentLanguage = 'javascript';
let currentDiffData: DiffData | null = null;

// --- Diff Gutter Markers ---

class AddedMarker extends GutterMarker {
  toDOM() {
    const marker = document.createElement('div');
    marker.className = 'diff-gutter-added';
    return marker;
  }
}

class DeletedMarker extends GutterMarker {
  toDOM() {
    const marker = document.createElement('div');
    marker.className = 'diff-gutter-deleted';
    return marker;
  }
}

class ModifiedMarker extends GutterMarker {
  toDOM() {
    const marker = document.createElement('div');
    marker.className = 'diff-gutter-modified';
    return marker;
  }
}

const addedMarker = new AddedMarker();
const deletedMarker = new DeletedMarker();
const modifiedMarker = new ModifiedMarker();

// --- Diff Gutter Extension ---

function createDiffGutter(diffData: DiffData | null) {
  if (!diffData || diffData.mode === 'off') {
    return [];
  }

  return gutter({
    class: 'cm-diff-gutter',
    lineMarker: (view, line) => {
      const lineNumber = view.state.doc.lineAt(line.from).number;
      
      if (diffData.modifiedLines.includes(lineNumber)) {
        return modifiedMarker;
      }
      if (diffData.addedLines.includes(lineNumber)) {
        return addedMarker;
      }
      // Check if there are deleted lines after the previous line
      const hasDeletedBefore = diffData.deletedLines.some(
        d => d.afterLine === lineNumber - 1
      );
      if (hasDeletedBefore) {
        return deletedMarker;
      }
      return null;
    },
    initialSpacer: () => addedMarker,
  });
}

// --- Inline Diff Decorations ---

// Widget to show deleted lines inline
class DeletedLinesWidget extends WidgetType {
  constructor(readonly lines: string[]) {
    super();
  }

  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = 'diff-deleted-lines';
    
    for (const line of this.lines) {
      const lineEl = document.createElement('div');
      lineEl.className = 'diff-deleted-line';
      lineEl.textContent = line || ' '; // Show space for empty lines
      wrapper.appendChild(lineEl);
    }
    
    return wrapper;
  }

  eq(other: DeletedLinesWidget) {
    return this.lines.join('\n') === other.lines.join('\n');
  }
}

// Effect to set diff decorations
const setDiffDecorations = StateEffect.define<DecorationSet>();

// State field for diff decorations
const diffDecorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const e of tr.effects) {
      if (e.is(setDiffDecorations)) {
        return e.value;
      }
    }
    return decorations.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f),
});

// Line decoration for added lines (inline mode)
const addedLineDecoration = Decoration.line({ class: 'diff-line-added' });
const modifiedLineDecoration = Decoration.line({ class: 'diff-line-modified' });

// Function to create diff decorations
function createDiffDecorations(state: EditorState, diffData: DiffData | null): DecorationSet {
  if (!diffData || diffData.mode !== 'inline') {
    return Decoration.none;
  }

  const decorations: any[] = [];

  // Add line decorations for added lines
  for (const lineNum of diffData.addedLines) {
    if (lineNum <= state.doc.lines) {
      const line = state.doc.line(lineNum);
      decorations.push(addedLineDecoration.range(line.from));
    }
  }

  // Add line decorations for modified lines
  for (const lineNum of diffData.modifiedLines) {
    if (lineNum <= state.doc.lines) {
      const line = state.doc.line(lineNum);
      decorations.push(modifiedLineDecoration.range(line.from));
    }
  }

  // Add widgets for deleted lines
  for (const deleted of diffData.deletedLines) {
    const afterLine = deleted.afterLine;
    let pos: number;
    
    if (afterLine === 0) {
      // Deleted at the very beginning
      pos = 0;
    } else if (afterLine <= state.doc.lines) {
      // Show after the specified line
      const line = state.doc.line(afterLine);
      pos = line.to;
    } else {
      // After the last line
      pos = state.doc.length;
    }

    const widget = Decoration.widget({
      widget: new DeletedLinesWidget(deleted.content),
      block: true,
      side: 1, // After the line
    });
    decorations.push(widget.range(pos));
  }

  // Sort decorations by position
  decorations.sort((a, b) => a.from - b.from);

  return Decoration.set(decorations);
}

// Function to update diff decorations
function updateDiffDecorations(view: EditorView, diffData: DiffData | null) {
  const decorations = createDiffDecorations(view.state, diffData);
  view.dispatch({
    effects: setDiffDecorations.of(decorations),
  });
}

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
 * Add diff styles to the document
 */
function addDiffStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Diff gutter styles */
    .cm-diff-gutter {
      width: 4px !important;
      min-width: 4px !important;
      background: transparent;
    }
    
    .diff-gutter-added {
      width: 4px;
      height: 100%;
      background-color: #4CAF50;
    }
    
    .diff-gutter-deleted {
      width: 4px;
      height: 100%;
      background-color: #F44336;
    }
    
    .diff-gutter-modified {
      width: 4px;
      height: 100%;
      background-color: #2196F3;
    }
    
    /* Inline diff styles */
    .diff-line-added {
      background-color: rgba(76, 175, 80, 0.15) !important;
    }
    
    .diff-line-modified {
      background-color: rgba(33, 150, 243, 0.15) !important;
    }
    
    .diff-deleted-lines {
      background-color: rgba(244, 67, 54, 0.15);
      border-left: 4px solid #F44336;
      margin-left: 0;
      padding-left: 4px;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    
    .diff-deleted-line {
      color: #F44336;
      opacity: 0.8;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: break-word;
      padding: 0 4px;
    }
  `;
  document.head.appendChild(style);
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

  // Add diff styles
  addDiffStyles();

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
      diffGutterConf.of([]),
      diffDecorationsField,
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
          
          // Re-apply diff decorations after content change
          if (currentDiffData && currentDiffData.mode === 'inline') {
            setTimeout(() => {
              if (editorView) {
                updateDiffDecorations(editorView, currentDiffData);
              }
            }, 0);
          }
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
        
      case 'setDiffData':
        if (editorView && message.data) {
          currentDiffData = message.data as DiffData;
          
          // Update gutter
          editorView.dispatch({
            effects: diffGutterConf.reconfigure(createDiffGutter(currentDiffData)),
          });
          
          // Update inline decorations
          updateDiffDecorations(editorView, currentDiffData);
        }
        break;
        
      case 'clearDiff':
        if (editorView) {
          currentDiffData = null;
          
          // Clear gutter
          editorView.dispatch({
            effects: diffGutterConf.reconfigure([]),
          });
          
          // Clear inline decorations
          updateDiffDecorations(editorView, null);
        }
        break;
        
      case 'setFontSize':
        if (message.data?.fontSize) {
          const fontSize = message.data.fontSize as number;
          document.documentElement.style.setProperty('--editor-font-size', `${fontSize}px`);
          // Update the editor container font size
          const editorEl = document.getElementById('editor');
          if (editorEl) {
            editorEl.style.fontSize = `${fontSize}px`;
          }
          // Update CodeMirror's base font size
          const cmEditor = document.querySelector('.cm-editor') as HTMLElement;
          if (cmEditor) {
            cmEditor.style.fontSize = `${fontSize}px`;
          }
        }
        break;
        
      case 'setTheme':
        if (message.data) {
          const { background, foreground, cursor } = message.data as { background: string; foreground: string; cursor: string };
          // Apply theme colors to the editor
          document.documentElement.style.setProperty('--editor-bg', background);
          document.documentElement.style.setProperty('--editor-fg', foreground);
          document.documentElement.style.setProperty('--editor-cursor', cursor);
          
          // Update body background
          document.body.style.backgroundColor = background;
          
          // Update CodeMirror theme dynamically via CSS custom properties
          const style = document.createElement('style');
          style.id = 'dynamic-theme';
          // Remove old dynamic theme if exists
          const oldStyle = document.getElementById('dynamic-theme');
          if (oldStyle) {
            oldStyle.remove();
          }
          style.textContent = `
            .cm-editor {
              background-color: ${background} !important;
            }
            .cm-scroller {
              background-color: ${background} !important;
            }
            .cm-gutters {
              background-color: ${background} !important;
              border-right-color: ${foreground}20 !important;
            }
            .cm-activeLineGutter {
              background-color: ${foreground}10 !important;
            }
            .cm-cursor {
              border-left-color: ${cursor} !important;
            }
            .cm-content {
              caret-color: ${cursor} !important;
            }
            .cm-line {
              color: ${foreground} !important;
            }
            .cm-activeLine {
              background-color: ${foreground}08 !important;
            }
            .cm-selectionBackground {
              background-color: ${cursor}30 !important;
            }
            .cm-editor .cm-selectionMatch {
              background-color: ${cursor}20 !important;
            }
            .cm-lineNumbers .cm-gutterElement {
              color: ${foreground}60 !important;
            }
          `;
          document.head.appendChild(style);
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
