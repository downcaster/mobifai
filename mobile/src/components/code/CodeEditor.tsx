import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { AppText } from '../ui';
import { colors } from '../../theme/colors';

interface CodeEditorProps {
  content: string;
  language?: string;
  readOnly?: boolean;
  onContentChange?: (content: string) => void;
  onSave?: () => void;
  loading?: boolean;
}

interface EditorMessage {
  type: string;
  data?: any;
}

export function CodeEditor({
  content,
  language = 'javascript',
  readOnly = false,
  onContentChange,
  onSave,
  loading = false,
}: CodeEditorProps): React.ReactElement {
  const webviewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get file extension from language or derive it
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

  // Send message to WebView
  const sendMessage = useCallback((type: string, data?: any) => {
    if (webviewRef.current && isReady) {
      const message = JSON.stringify({ type, data });
      webviewRef.current.postMessage(message);
    }
  }, [isReady]);

  // Handle messages from WebView
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
    } catch (error) {
      console.error('Error parsing editor message:', error);
    }
  }, [onContentChange, onSave]);

  // Update content when it changes
  useEffect(() => {
    if (isReady) {
      sendMessage('setContent', { content });
    }
  }, [content, isReady, sendMessage]);

  // Update language when it changes
  useEffect(() => {
    if (isReady) {
      sendMessage('setLanguage', { language: getLanguage(language) });
    }
  }, [language, isReady, sendMessage]);

  // Update read-only state
  useEffect(() => {
    if (isReady) {
      sendMessage('setReadOnly', { readOnly });
    }
  }, [readOnly, isReady, sendMessage]);

  // Handle WebView errors
  const handleError = useCallback(() => {
    setError('Failed to load editor');
    console.error('WebView error');
  }, []);

  // HTML source - load from assets
  const editorHTML = Platform.select({
    ios: require('../../assets/editor.html'),
    android: { uri: 'file:///android_asset/editor.html' },
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <AppText style={styles.loadingText}>Loading file...</AppText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <AppText style={styles.errorText}>{error}</AppText>
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
      {!isReady && (
        <View style={styles.initializingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText style={styles.initializingText}>Initializing editor...</AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#282c34',
  },
  webview: {
    flex: 1,
    backgroundColor: '#282c34',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    color: colors.text.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 20,
  },
  errorText: {
    color: colors.error,
    textAlign: 'center',
  },
  initializingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#282c34',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initializingText: {
    marginTop: 12,
    color: '#ffffff',
  },
});

