import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, Text } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { FileDiff } from '../../services/CodeService';
import { TerminalTheme } from '../../theme/terminalThemes';

// Dark theme colors (matching terminal)
const darkTheme = {
  background: '#0a0a0f',
  surface: '#12121a',
  surfaceElevated: '#1a1a25',
  border: '#2a2a3a',
  primary: '#6200EE',
  primaryLight: '#BB86FC',
  secondary: '#03DAC6',
  text: {
    primary: '#ffffff',
    secondary: '#8888aa',
    disabled: '#555566',
  },
  error: '#CF6679',
};

export type DiffMode = 'off' | 'gutter' | 'inline';

interface CodeEditorProps {
  content: string;
  language?: string;
  readOnly?: boolean;
  onContentChange?: (content: string) => void;
  onSave?: () => void;
  loading?: boolean;
  diffMode?: DiffMode;
  diffData?: FileDiff | null;
  fontSize?: number;
  theme?: TerminalTheme | null;
}

interface EditorMessage {
  type: string;
  data?: {
    content?: string;
  };
}

export function CodeEditor({
  content,
  language = 'javascript',
  readOnly = false,
  onContentChange,
  onSave,
  loading = false,
  diffMode = 'off',
  diffData = null,
  fontSize = 14,
  theme = null,
}: CodeEditorProps): React.ReactElement {
  const webviewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track content from editor to avoid feedback loop
  const lastEditorContentRef = useRef<string | null>(null);
  const hasInitializedRef = useRef(false);

  const getLanguage = (lang: string): string => {
    const langMap: Record<string, string> = {
      'javascript': 'js',
      'typescript': 'ts',
      'python': 'py',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'markdown': 'md',
    };
    return langMap[lang.toLowerCase()] || lang;
  };

  const sendMessage = useCallback((type: string, data?: Record<string, unknown>) => {
    if (webviewRef.current && isReady) {
      const message = JSON.stringify({ type, data });
      webviewRef.current.postMessage(message);
    }
  }, [isReady]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message: EditorMessage = JSON.parse(event.nativeEvent.data);

      switch (message.type) {
        case 'ready':
          console.log('📝 Editor ready');
          setIsReady(true);
          setError(null);
          break;

        case 'contentChanged':
          if (onContentChange && message.data?.content !== undefined) {
            // Track content from editor to avoid sending it back
            lastEditorContentRef.current = message.data.content;
            onContentChange(message.data.content);
          }
          break;

        case 'save':
          console.log('💾 Save requested from editor');
          if (onSave) {
            onSave();
          }
          break;

        default:
          console.log('Unknown editor message:', message.type);
      }
    } catch (err) {
      console.error('Error parsing editor message:', err);
    }
  }, [onContentChange, onSave]);

  // Set content only when it's from an external source (file switch, initial load)
  // NOT when it's the same content we just received from the editor
  useEffect(() => {
    if (isReady) {
      // Only send setContent if:
      // 1. We haven't initialized yet (first load)
      // 2. Content differs from what the editor last sent us (external change like file switch)
      const isExternalChange = content !== lastEditorContentRef.current;
      const isFirstLoad = !hasInitializedRef.current;
      
      if (isFirstLoad || isExternalChange) {
        sendMessage('setContent', { content });
        lastEditorContentRef.current = content;
        hasInitializedRef.current = true;
      }
    }
  }, [content, isReady, sendMessage]);

  useEffect(() => {
    if (isReady) {
      sendMessage('setLanguage', { language: getLanguage(language) });
    }
  }, [language, isReady, sendMessage]);

  useEffect(() => {
    if (isReady) {
      sendMessage('setReadOnly', { readOnly });
    }
  }, [readOnly, isReady, sendMessage]);

  // Send diff data to the editor when it changes
  useEffect(() => {
    if (isReady) {
      if (diffMode === 'off' || !diffData) {
        console.log('📊 Clearing diff in editor');
        sendMessage('clearDiff');
      } else {
        console.log('📊 Sending diff data to editor:', {
          addedLines: diffData.addedLines?.length || 0,
          deletedLines: diffData.deletedLines?.length || 0,
          modifiedLines: diffData.modifiedLines?.length || 0,
          mode: diffMode,
        });
        sendMessage('setDiffData', {
          addedLines: diffData.addedLines,
          deletedLines: diffData.deletedLines,
          modifiedLines: diffData.modifiedLines,
          mode: diffMode,
        });
      }
    }
  }, [isReady, diffMode, diffData, sendMessage]);

  // Send font size to the editor when it changes
  useEffect(() => {
    if (isReady) {
      sendMessage('setFontSize', { fontSize });
    }
  }, [fontSize, isReady, sendMessage]);

  // Send theme to the editor when it changes
  useEffect(() => {
    if (isReady && theme) {
      sendMessage('setTheme', {
        background: theme.background,
        foreground: theme.foreground,
        cursor: theme.cursor,
      });
    }
  }, [theme, isReady, sendMessage]);

  const handleError = useCallback(() => {
    setError('Failed to load editor');
    console.error('WebView error');
  }, []);

  const editorHTML = Platform.select({
    ios: require('../../assets/editor.html'),
    android: { uri: 'file:///android_asset/editor.html' },
  });

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={editorHTML}
        onMessage={handleMessage}
        onError={handleError}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        mixedContentMode="always"
        startInLoadingState={false}
        bounces={false}
        scrollEnabled={true}
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={false}
        keyboardDisplayRequiresUserAction={false}
      />
      {/* Show loading overlay when fetching file */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={darkTheme.primaryLight} />
          <Text style={styles.loadingText}>Loading file...</Text>
        </View>
      )}
      {/* Show initializing overlay when WebView is starting up */}
      {!isReady && !loading && (
        <View style={styles.initializingOverlay}>
          <ActivityIndicator size="large" color={darkTheme.primaryLight} />
          <Text style={styles.initializingText}>Initializing editor...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  webview: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: darkTheme.background,
  },
  loadingText: {
    marginTop: 12,
    color: darkTheme.text.secondary,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: darkTheme.background,
    padding: 20,
  },
  errorText: {
    color: darkTheme.error,
    textAlign: 'center',
    fontSize: 14,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: darkTheme.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  initializingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: darkTheme.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initializingText: {
    marginTop: 12,
    color: darkTheme.text.secondary,
    fontSize: 14,
  },
});
