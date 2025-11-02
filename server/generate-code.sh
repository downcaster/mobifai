#!/bin/bash

# Simple script to generate a pairing code
# Usage: ./generate-code.sh [device-name]

DEVICE_NAME=${1:-"Mobile Device"}
SERVER_URL=${2:-"http://localhost:3000"}

echo "📱 Generating pairing code for: $DEVICE_NAME"
echo ""

RESPONSE=$(curl -s -X POST "$SERVER_URL/api/auth/pair" \
  -H "Content-Type: application/json" \
  -d "{\"deviceName\": \"$DEVICE_NAME\"}")

CODE=$(echo $RESPONSE | grep -o '"pairingCode":"[0-9]*"' | grep -o '[0-9]*')

if [ -z "$CODE" ]; then
  echo "❌ Failed to generate code"
  echo "Response: $RESPONSE"
  exit 1
fi

echo "✅ Pairing Code: $CODE"
echo ""
echo "This code will expire in 5 minutes"
echo ""
echo "To connect from mobile:"
echo "1. Open the MobiFai app"
echo "2. Enter server URL: $SERVER_URL"
echo "3. Enter pairing code: $CODE"
