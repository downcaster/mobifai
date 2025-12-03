# Memory Leak Prevention - Quick Reference

## What Was Fixed

The Mac client was experiencing segmentation faults after hours of activity due to memory leaks. We've implemented comprehensive fixes:

## Key Improvements

### 1. **Automatic Memory Cleanup**
- Runs every 5 minutes
- Cleans up inactive process buffers
- Forces garbage collection when needed

### 2. **Health Monitoring**
- Logs system status every 10 minutes
- Shows memory usage, process count, buffer sizes
- Warns when memory exceeds 512MB

### 3. **AI Conversation Limits**
- Max 20 messages in conversation history
- Automatic cleanup after AI sessions
- Prevents unbounded memory growth

### 4. **Event Listener Cleanup**
- Properly removes WebRTC handlers on disconnect
- Cleans up socket listeners
- Prevents memory leaks in native modules

## Running with Improvements

The build scripts now automatically enable garbage collection:

```bash
npm run dev    # Development with GC enabled
npm start      # Production with GC enabled
```

## What You'll See

### Every 10 minutes (Health Check):
```
💓 Health Check
   Memory: 234MB / 512MB
   Processes: 3
   Buffer Size: 45KB
   WebRTC: Connected
```

### Every 5 minutes (Memory Cleanup):
```
🧹 Memory check: 234MB / 512MB
   Cleared buffers for 2 inactive process(es)
```

### If Memory Gets High (>512MB):
```
⚠️  High memory usage detected: 567MB
   Running garbage collection...
```

## Expected Behavior

- **Memory Usage**: Should stabilize around 200-400MB
- **Long-Running Stability**: Can now run for days without issues
- **No Performance Impact**: Cleanup runs in background
- **Automatic Recovery**: GC kicks in when memory gets high

## Monitoring Tips

1. Watch the health check output periodically
2. If memory consistently exceeds 512MB, there may be an issue
3. The client will automatically try to recover with GC
4. Old inactive terminal buffers are automatically cleaned

## For More Details

See `/SEGFAULT_FIX.md` in the project root for:
- Complete technical analysis
- All code changes
- Testing recommendations
- Troubleshooting guide

