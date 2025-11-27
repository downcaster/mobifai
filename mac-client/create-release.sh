#!/bin/bash

# Build the project
npm run build

# Create release directory
rm -rf release
mkdir -p release

# Copy built files
cp -r dist release/
cp package.json release/

# Install ONLY production dependencies (to save space)
# Note: We actually copy node_modules to avoid re-installing native deps which might need build tools
# But strictly we should npm install --production in the release folder.
# Since native modules are already built in node_modules, copying is safer for "current machine" distribution.
echo "Copying dependencies (this may take a moment)..."
cp -r node_modules release/

# Create the executable launcher
LAUNCHER="release/mobifai-mac"
echo '#!/bin/bash' > "$LAUNCHER"
echo 'DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"' >> "$LAUNCHER"
echo 'export NODE_ENV=production' >> "$LAUNCHER"
echo 'export APP_ENV=production' >> "$LAUNCHER"
echo 'node "$DIR/dist/index.js"' >> "$LAUNCHER"

chmod +x "$LAUNCHER"

echo "✅ Release created at: release/mobifai-mac"
echo "You can move the 'release' folder anywhere and run './mobifai-mac'"

