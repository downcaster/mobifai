import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  ScrollView,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { io, Socket } from 'socket.io-client';

type TerminalScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Terminal'>;
  route: RouteProp<RootStackParamList, 'Terminal'>;
};

export default function TerminalScreen({ navigation, route }: TerminalScreenProps) {
  const { relayServerUrl, pairingCode } = route.params;
  const [output, setOutput] = useState('');
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [paired, setPaired] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    connectToRelay();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const connectToRelay = () => {
    setOutput((prev) => prev + '📡 Connecting to relay server...\n');

    const socket = io(relayServerUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setOutput((prev) => prev + '✅ Connected to relay server\n');

      // Register as mobile device
      socket.emit('register', { type: 'mobile' });
    });

    socket.on('registered', ({ message }) => {
      setOutput((prev) => prev + `✅ ${message}\n`);
      setOutput((prev) => prev + `🔗 Pairing with code: ${pairingCode}...\n`);

      // Send pairing code
      socket.emit('pair', { pairingCode });
    });

    socket.on('paired', ({ message }) => {
      setPaired(true);
      setOutput((prev) => prev + `✅ ${message}\n\n`);
      setOutput((prev) => prev + '='.repeat(40) + '\n');
      setOutput((prev) => prev + 'Terminal ready. Start typing commands!\n');
      setOutput((prev) => prev + '='.repeat(40) + '\n\n');
    });

    socket.on('terminal:output', (data: string) => {
      setOutput((prev) => prev + data);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    socket.on('paired_device_disconnected', ({ message }) => {
      setPaired(false);
      setOutput((prev) => prev + `\n❌ ${message}\n`);
      Alert.alert('Disconnected', message, [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      setPaired(false);
      setOutput((prev) => prev + `\n❌ Disconnected: ${reason}\n`);
    });

    socket.on('connect_error', (error) => {
      setOutput((prev) => prev + `❌ Connection error: ${error.message}\n`);
    });

    socket.on('error', ({ message }) => {
      setOutput((prev) => prev + `❌ Error: ${message}\n`);
      Alert.alert('Error', message);
    });
  };

  const sendCommand = () => {
    if (socketRef.current && input.trim() && paired) {
      socketRef.current.emit('terminal:input', input + '\n');
      setInput('');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <View style={styles.statusBar}>
        <View style={[styles.indicator, connected && styles.indicatorConnected]} />
        <Text style={styles.statusText}>
          {paired ? 'Paired & Connected' : connected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.outputContainer}
        contentContainerStyle={styles.outputContent}
      >
        <Text style={styles.output}>{output || 'Connecting...'}</Text>
      </ScrollView>

      <View style={styles.inputContainer}>
        <Text style={styles.prompt}>$</Text>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendCommand}
          placeholder="Enter command..."
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="send"
          editable={paired}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#0f0',
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f00',
    marginRight: 8,
  },
  indicatorConnected: {
    backgroundColor: '#0f0',
  },
  statusText: {
    color: '#0f0',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  outputContainer: {
    flex: 1,
  },
  outputContent: {
    padding: 10,
  },
  output: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#0f0',
    fontSize: 14,
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#0f0',
    padding: 10,
  },
  prompt: {
    color: '#0f0',
    fontSize: 16,
    fontFamily: 'monospace',
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: '#0f0',
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    padding: 0,
  },
});
