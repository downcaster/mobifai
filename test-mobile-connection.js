// Test script to simulate mobile device connection
import { io } from 'socket.io-client';

const RELAY_SERVER = 'http://localhost:3000';
const PAIRING_CODE = '863021'; // Code from Mac client

console.log('📱 Simulating Mobile Device Connection\n');
console.log('Connecting to relay server:', RELAY_SERVER);

const socket = io(RELAY_SERVER);

socket.on('connect', () => {
  console.log('✅ Connected to relay server');
  console.log('📝 Registering as mobile device...');

  socket.emit('register', { type: 'mobile' });
});

socket.on('registered', ({ message }) => {
  console.log('✅', message);
  console.log('🔗 Sending pairing code:', PAIRING_CODE);

  socket.emit('pair', { pairingCode: PAIRING_CODE });
});

socket.on('paired', ({ message }) => {
  console.log('✅', message);
  console.log('\n========================================');
  console.log('Terminal ready. Sending test commands!');
  console.log('========================================\n');

  // Send test command
  setTimeout(() => {
    console.log('📤 Sending command: ls -la');
    socket.emit('terminal:input', 'ls -la\n');
  }, 1000);

  setTimeout(() => {
    console.log('📤 Sending command: pwd');
    socket.emit('terminal:input', 'pwd\n');
  }, 2000);

  setTimeout(() => {
    console.log('📤 Sending command: echo "Hello from mobile!"');
    socket.emit('terminal:input', 'echo "Hello from mobile!"\n');
  }, 3000);
});

socket.on('terminal:output', (data) => {
  console.log('📥 Terminal output:', data.trim());
});

socket.on('error', ({ message }) => {
  console.error('❌ Error:', message);
  process.exit(1);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  process.exit(1);
});

// Exit after 10 seconds
setTimeout(() => {
  console.log('\n✅ Test complete! Disconnecting...');
  socket.disconnect();
  process.exit(0);
}, 10000);
