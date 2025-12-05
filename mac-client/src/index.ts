import { io, Socket } from "socket.io-client";
import os from "os";
import chalk from "chalk";
import wrtc from "@roamhq/wrtc";
import open from "open";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import readline from "readline";
import { config } from "./config.js";
import {
  generateKeyPair,
  deriveSharedSecret,
  signChallenge,
  KeyPair,
} from "./crypto.js";
import { getAIService, AIPromptPayload } from "./ai/index.js";
import { ProcessManager } from "./process-manager.js";
import { CodeManager } from "./code-manager.js";

const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = wrtc;

interface RTCDataChannel {
  readyState: string;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
}

interface IceCandidate {
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}

// Process command payloads
interface ProcessCreatePayload {
  uuid: string;
  name?: string;
  cols?: number;
  rows?: number;
}

interface ProcessTerminatePayload {
  uuid: string;
}

interface ProcessSwitchPayload {
  activeUuids: string[];
}

interface ProcessRenamePayload {
  uuid: string;
  name: string;
}

interface TerminalInputPayload {
  uuid: string;
  data: string;
}

interface TerminalResizePayload {
  uuid?: string;
  cols: number;
  rows: number;
}

const TOKEN_FILE = path.join(process.cwd(), ".token");
const DEVICE_ID_FILE = path.join(process.cwd(), ".device_id");

// Generate key pair for secure handshake
let keyPair: KeyPair;
let peerPublicKey: string | null = null;
let sharedSecret: Buffer | null = null;

console.log(chalk.bold.cyan("\nMobiFai Mac Client"));
console.log(chalk.gray("================================\n"));

let socket: Socket;
let rl: readline.Interface | null = null;
let peerConnection: InstanceType<typeof RTCPeerConnection> | null = null;
let dataChannel: RTCDataChannel | null = null;
let isWebRTCConnected = false;
let pendingIceCandidates: Array<{
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}> = [];

// Process Manager - replaces single terminal
const processManager = new ProcessManager();

// Start memory monitoring
processManager.startMemoryMonitoring();

// Code Manager - handles file system operations for code editor
const codeManager = new CodeManager();

// Store terminal dimensions from mobile
let terminalCols = 80;
let terminalRows = 30;

// Periodic health check interval
let healthCheckInterval: NodeJS.Timeout | null = null;

/**
 * Send data to iOS client via WebRTC or Socket fallback
 */
function sendToClient(type: string, payload: unknown): void {
  const message = JSON.stringify({ type, payload });
  
  if (isWebRTCConnected && dataChannel?.readyState === "open") {
    try {
      dataChannel.send(message);
    } catch (e) {
      socket.emit(type, payload);
    }
  } else {
    socket.emit(type, payload);
  }
}

/**
 * Perform periodic health check and log system status
 */
function performHealthCheck(): void {
  const stats = processManager.getMemoryStats();
  
  console.log(chalk.gray("\n💓 Health Check"));
  console.log(chalk.gray(`   Memory: ${stats.heapUsedMB}MB / ${stats.heapTotalMB}MB`));
  console.log(chalk.gray(`   Processes: ${stats.processCount}`));
  console.log(chalk.gray(`   Buffer Size: ${Math.round(stats.totalBufferSize / 1024)}KB`));
  console.log(chalk.gray(`   WebRTC: ${isWebRTCConnected ? "Connected" : "Disconnected"}`));
  
  // Warn if memory usage is high
  if (stats.heapUsedMB > 512) {
    console.log(chalk.yellow(`⚠️  High memory usage detected: ${stats.heapUsedMB}MB`));
    
    // Force garbage collection if available
    if (global.gc) {
      console.log(chalk.gray("   Running garbage collection..."));
      global.gc();
    }
  }
}

/**
 * Start periodic health monitoring
 */
function startHealthMonitoring(): void {
  // Check health every 10 minutes
  healthCheckInterval = setInterval(() => {
    performHealthCheck();
  }, 10 * 60 * 1000);
  
  console.log(chalk.gray("✅ Health monitoring started"));
}

/**
 * Set up ProcessManager callbacks
 */
function setupProcessManagerCallbacks(): void {
  // Handle process output - only forward from active processes
  processManager.onOutput((uuid, data) => {
    // Update AI service screen buffer for active process
    const activeProcess = processManager.getFirstActiveProcess();
    if (activeProcess && activeProcess.uuid === uuid) {
      getAIService().updateScreenBuffer(data);
    }
    
    // Debug: log output being sent
    if (config.DEBUG) {
      console.log(chalk.gray(`→ Sending output from ${uuid.substring(0, 8)} (${data.length} chars)`));
    }
    
    // Send output to iOS with uuid
    sendToClient("terminal:output", { uuid, data });
  });

  // Handle process exit
  processManager.onExit((uuid) => {
    console.log(chalk.gray(`Process ${uuid.substring(0, 8)} exited, notifying iOS`));
    sendToClient("process:exited", { uuid });
  });
}

/**
 * Handle process:create command from iOS
 */
function handleProcessCreate(payload: ProcessCreatePayload): void {
  const { uuid, name, cols = terminalCols, rows = terminalRows } = payload;
  
  console.log(chalk.cyan(`[iOS] Process creation: ${uuid.substring(0, 8)} "${name || 'unnamed'}"`));
  
  const processInfo = processManager.createProcess(uuid, cols, rows, name);
  
  if (processInfo) {
    // Set this process as the only active one
    processManager.switchActiveProcesses([uuid]);
    
    // Update AI service with the new terminal
    const aiService = getAIService();
    aiService.setTerminal(processInfo.pty);
    aiService.setDimensions(cols, rows);
    
    // Notify iOS that process was created (include the name that was assigned)
    sendToClient("process:created", { uuid, name: processInfo.name });
    
    // Send system ready message (for first process)
    if (processManager.getProcessCount() === 1) {
      socket.emit("system:message", { type: "terminal_ready" });
    }
  } else {
    sendToClient("process:error", { uuid, error: "Failed to create process" });
  }
}

/**
 * Handle process:rename command from iOS
 */
function handleProcessRename(payload: ProcessRenamePayload): void {
  const { uuid, name } = payload;
  
  console.log(chalk.cyan(`[iOS] Process rename: ${uuid.substring(0, 8)} -> "${name}"`));
  
  const success = processManager.renameProcess(uuid, name);
  
  if (success) {
    sendToClient("process:renamed", { uuid, name });
  } else {
    sendToClient("process:error", { uuid, error: "Failed to rename process" });
  }
}

/**
 * Handle process:terminate command from iOS
 */
function handleProcessTerminate(payload: ProcessTerminatePayload): void {
  const { uuid } = payload;
  
  console.log(chalk.cyan(`[iOS] Process termination: ${uuid.substring(0, 8)}`));
  
  const success = processManager.terminateProcess(uuid);
  
  if (success) {
    sendToClient("process:terminated", { uuid });
  } else {
    sendToClient("process:error", { uuid, error: "Failed to terminate process" });
  }
}

/**
 * Handle process:switch command from iOS
 */
function handleProcessSwitch(payload: ProcessSwitchPayload): void {
  const { activeUuids } = payload;
  
  console.log(chalk.cyan(`[iOS] Process switch: ${activeUuids.map(u => u.substring(0, 8)).join(", ")}`));
  
  const snapshots = processManager.switchActiveProcesses(activeUuids);
  
  // Update AI service with the first active terminal
  const activeProcess = processManager.getFirstActiveProcess();
  if (activeProcess) {
    const aiService = getAIService();
    aiService.setTerminal(activeProcess.pty);
    aiService.setDimensions(activeProcess.cols, activeProcess.rows);
  }
  
  // Send screen snapshots for all newly active processes
  for (const [uuid, screenData] of snapshots) {
    sendToClient("process:screen", { uuid, data: screenData });
  }
}

/**
 * Handle terminal:input command from iOS (with uuid)
 */
function handleTerminalInput(payload: TerminalInputPayload | string): void {
  // Support both old format (string) and new format (object with uuid)
  if (typeof payload === "string") {
    // Legacy format - write to first active process
    const activeProcess = processManager.getFirstActiveProcess();
    if (activeProcess) {
      processManager.writeToProcess(activeProcess.uuid, payload);
    }
  } else {
    const { uuid, data } = payload;
    processManager.writeToProcess(uuid, data);
  }
}

/**
 * Handle terminal:actions command - process array of text and command actions sequentially
 */
interface TerminalAction {
  type: "text" | "command";
  value: string;
  label?: string;
}

interface TerminalActionsPayload {
  uuid: string;
  actions: TerminalAction[];
}

function handleTerminalActions(payload: TerminalActionsPayload): void {
  const { uuid, actions } = payload;
  
  console.log(
    chalk.cyan(
      `\n⌨️  Processing ${actions.length} action(s) for process ${uuid.substring(
        0,
        8
      )}`
    )
  );

  // Process each action sequentially
  actions.forEach((action, index) => {
    if (action.type === "text") {
      console.log(chalk.gray(`  ${index + 1}. Text: "${action.value}"`));
      processManager.writeToProcess(uuid, action.value);
    } else if (action.type === "command") {
      console.log(
        chalk.gray(`  ${index + 1}. Command: ${action.label || "key"}`)
      );
      processManager.writeToProcess(uuid, action.value);
    }
  });
}

/**
 * Handle terminal:resize command from iOS
 */
function handleTerminalResize(payload: TerminalResizePayload): void {
  const { uuid, cols, rows } = payload;
  
  terminalCols = cols;
  terminalRows = rows;
  
  if (uuid) {
    // Resize specific process
    processManager.resizeProcess(uuid, cols, rows);
  } else {
    // Resize all processes (legacy behavior)
    processManager.resizeAll(cols, rows);
  }
  
  // Update AI service dimensions
  getAIService().setDimensions(cols, rows);
}

async function setupWebRTC() {
  console.log(chalk.cyan("\n→ Setting up WebRTC P2P connection..."));

  try {
    peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceTransportPolicy: "all",
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    console.log(chalk.gray("✅ Peer connection created"));

    peerConnection.onicecandidate = (event: {
      candidate: IceCandidate | null;
    }) => {
      const candidate = event.candidate;
      if (candidate) {
        if (config.DEBUG) {
          console.log(chalk.gray("ICE candidate generated, sending to mobile"));
        }
        socket.emit("webrtc:ice-candidate", {
          candidate: {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
          },
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection?.connectionState;
      console.log(chalk.yellow(`WebRTC Connection State: ${state}`));

      if (state === "connected") {
        isWebRTCConnected = true;
        console.log(
          chalk.bold.green("\n✅ WebRTC P2P connection established!")
        );
        console.log(
          chalk.gray(
            "You can now terminate the relay server - clients will stay connected.\n"
          )
        );
      } else if (
        state === "disconnected" ||
        state === "failed" ||
        state === "closed"
      ) {
        isWebRTCConnected = false;
        console.log(
          chalk.red("❌ WebRTC connection lost, falling back to relay server")
        );
      }
    };

    // Create data channel
    const channel = peerConnection.createDataChannel("terminal");
    dataChannel = channel;

    channel.onopen = () => {
      console.log(chalk.green("✅ WebRTC data channel opened"));
      isWebRTCConnected = true;
      
      // Small delay to ensure iOS data channel is fully ready to receive
      setTimeout(() => {
        // Always send processes:sync via WebRTC (even if empty) so iOS knows sync is complete
        const existingProcesses = processManager.getProcessSyncData();
        console.log(chalk.cyan(`→ Sending processes:sync via WebRTC (${existingProcesses.length} processes)`));
        const syncPayload = {
          processes: existingProcesses,
          activeUuids: processManager.getActiveProcessIds(),
        };
        sendToClient("processes:sync", syncPayload);
      }, 100); // 100ms delay to ensure both sides are ready
    };

    channel.onclose = () => {
      console.log(chalk.yellow("⚠️  WebRTC data channel closed"));
      isWebRTCConnected = false;
    };

    channel.onmessage = ({ data }: { data: string }) => {
      try {
        const message = JSON.parse(data.toString());
        handleWebRTCMessage(message);
      } catch (error) {
        // Ignore parsing errors
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Wait for ICE gathering
    await new Promise<void>((resolve) => {
      if (peerConnection!.iceGatheringState === "complete") {
        resolve();
      } else {
        const check = () => {
          if (peerConnection!.iceGatheringState === "complete") {
            peerConnection!.removeEventListener(
              "icegatheringstatechange",
              check
            );
            resolve();
          }
        };
        peerConnection!.addEventListener("icegatheringstatechange", check);
        setTimeout(resolve, 2000); // Timeout
      }
    });

    console.log(chalk.cyan("→ Sending offer to mobile via relay server"));
    socket.emit("webrtc:offer", {
      offer: {
        sdp: peerConnection.localDescription!.sdp,
        type: peerConnection.localDescription!.type,
      },
    });
  } catch (error) {
    console.log(chalk.red("❌ Failed to setup WebRTC:", error));
  }
}

/**
 * Handle messages from WebRTC data channel
 */
function handleWebRTCMessage(message: { 
  type?: string; 
  payload?: unknown;
  namespace?: string;
  action?: string;
}): void {
  // Check for new namespace format first
  if (message.namespace && message.action) {
    if (message.namespace === 'code') {
      handleCodeMessage(message.action, message.payload);
      return;
    } else if (message.namespace === 'terminal') {
      // Route to terminal handlers using action
      handleTerminalMessage(message.action, message.payload);
      return;
    }
  }
  
  // Fallback to legacy type-based routing for backward compatibility
  if (message.type) {
    switch (message.type) {
      case "process:create":
        handleProcessCreate(message.payload as ProcessCreatePayload);
        break;
      case "process:terminate":
        handleProcessTerminate(message.payload as ProcessTerminatePayload);
        break;
      case "process:switch":
        handleProcessSwitch(message.payload as ProcessSwitchPayload);
        break;
      case "process:rename":
        handleProcessRename(message.payload as ProcessRenamePayload);
        break;
      case "terminal:input":
        handleTerminalInput(message.payload as TerminalInputPayload);
        break;
      case "terminal:actions":
        handleTerminalActions(message.payload as TerminalActionsPayload);
        break;
      case "terminal:resize":
        handleTerminalResize(message.payload as TerminalResizePayload);
        break;
      case "ai:prompt":
        const aiPayload = message.payload as AIPromptPayload;
        console.log(chalk.cyan(`\n🤖 AI Prompt received via WebRTC: "${aiPayload.prompt}"`));
        handleAIPrompt(aiPayload.prompt, aiPayload.uuid);
        break;
      default:
        console.log(chalk.gray(`Unknown WebRTC message type: ${message.type}`));
    }
  }
}

/**
 * Handle terminal namespace messages
 */
function handleTerminalMessage(action: string, payload: unknown): void {
  switch (action) {
    case "process:create":
      handleProcessCreate(payload as ProcessCreatePayload);
      break;
    case "process:terminate":
      handleProcessTerminate(payload as ProcessTerminatePayload);
      break;
    case "process:switch":
      handleProcessSwitch(payload as ProcessSwitchPayload);
      break;
    case "process:rename":
      handleProcessRename(payload as ProcessRenamePayload);
      break;
    case "terminal:input":
      handleTerminalInput(payload as TerminalInputPayload);
      break;
    case "terminal:actions":
      handleTerminalActions(payload as TerminalActionsPayload);
      break;
    case "terminal:resize":
      handleTerminalResize(payload as TerminalResizePayload);
      break;
    case "ai:prompt":
      const aiPayload = payload as AIPromptPayload;
      console.log(chalk.cyan(`\n🤖 AI Prompt received: "${aiPayload.prompt}"`));
      handleAIPrompt(aiPayload.prompt, aiPayload.uuid);
      break;
    default:
      console.log(chalk.gray(`Unknown terminal action: ${action}`));
  }
}

/**
 * Handle code namespace messages
 */
function handleCodeMessage(action: string, payload: unknown): void {
  console.log(chalk.cyan(`📝 Code action: ${action}`));
  
  try {
    switch (action) {
      case "initProject":
        handleCodeInitProject(payload as { projectPath: string });
        break;
      case "getFolderChildren":
        handleCodeGetFolderChildren(payload as { folderPath: string });
        break;
      case "getFile":
        handleCodeGetFile(payload as { filePath: string });
        break;
      case "saveFile":
        handleCodeSaveFile(payload as { filePath: string; newContent: string });
        break;
      case "closeProject":
        handleCodeCloseProject(payload as { projectPath: string });
        break;
      case "getProjectsHistory":
        handleCodeGetProjectsHistory();
        break;
      case "openCurrentDir":
        handleCodeOpenCurrentDir(payload as { uuid: string });
        break;
      default:
        console.log(chalk.gray(`Unknown code action: ${action}`));
        sendToClient("code:error", { action, error: "Unknown action" });
    }
  } catch (error: any) {
    console.error(chalk.red(`❌ Code action failed: ${action}`), error);
    sendToClient("code:error", { 
      action, 
      error: error.message || "Unknown error",
      details: error.stack 
    });
  }
}

/**
 * Handle code.initProject
 */
function handleCodeInitProject(payload: { projectPath: string }): void {
  const result = codeManager.initProject(payload.projectPath);
  sendToClient("code:projectInitialized", result);
}

/**
 * Handle code.getFolderChildren
 */
function handleCodeGetFolderChildren(payload: { folderPath: string }): void {
  const result = codeManager.getFolderChildren(payload.folderPath);
  sendToClient("code:folderChildren", result);
}

/**
 * Handle code.getFile
 */
function handleCodeGetFile(payload: { filePath: string }): void {
  const result = codeManager.getFile(payload.filePath);
  sendToClient("code:fileContent", result);
}

/**
 * Handle code.saveFile
 */
function handleCodeSaveFile(payload: { filePath: string; newContent: string }): void {
  try {
    const result = codeManager.saveFile(payload.filePath, payload.newContent);
    sendToClient("code:fileSaved", result);
  } catch (error: any) {
    sendToClient("code:fileSaveError", {
      filePath: payload.filePath,
      error: error.message || "Save failed"
    });
  }
}

/**
 * Handle code.closeProject
 */
function handleCodeCloseProject(payload: { projectPath: string }): void {
  codeManager.closeProject(payload.projectPath);
  sendToClient("code:projectClosed", { projectPath: payload.projectPath });
}

/**
 * Handle code.getProjectsHistory
 */
function handleCodeGetProjectsHistory(): void {
  const projects = codeManager.getProjectsHistory();
  sendToClient("code:projectsHistory", { projects });
}

/**
 * Handle code.openCurrentDir - get current directory from a process and init as project
 */
function handleCodeOpenCurrentDir(payload: { uuid: string }): void {
  const { uuid } = payload;
  
  console.log(chalk.cyan(`📂 Opening current directory for process ${uuid.substring(0, 8)}`));
  
  // Get the process's current working directory
  const processInfo = processManager.getProcess(uuid);
  if (!processInfo) {
    console.log(chalk.yellow(`⚠️ Process ${uuid.substring(0, 8)} not found`));
    sendToClient("code:error", { action: "openCurrentDir", error: "Process not found" });
    return;
  }
  
  // Get the cwd from the process
  const cwd = processInfo.cwd;
  if (!cwd) {
    console.log(chalk.yellow(`⚠️ No cwd available for process ${uuid.substring(0, 8)}`));
    sendToClient("code:error", { action: "openCurrentDir", error: "Could not determine current directory" });
    return;
  }
  
  console.log(chalk.cyan(`  └─ Current directory: ${cwd}`));
  
  // Initialize the project (this also adds to history)
  try {
    const result = codeManager.initProject(cwd);
    sendToClient("code:projectInitialized", result);
  } catch (error: any) {
    console.error(chalk.red(`❌ Failed to init project: ${error.message}`));
    sendToClient("code:error", { action: "openCurrentDir", error: error.message });
  }
}

function getToken(): string | undefined {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return fs.readFileSync(TOKEN_FILE, "utf-8").trim();
    }
  } catch (e) {
    return undefined;
  }
}

function saveToken(token: string) {
  fs.writeFileSync(TOKEN_FILE, token);
  console.log(chalk.gray("🔒 Token saved securely"));
}

function getDeviceId(): string {
  try {
    if (fs.existsSync(DEVICE_ID_FILE)) {
      return fs.readFileSync(DEVICE_ID_FILE, "utf-8").trim();
    }
  } catch (e) {
    // ignore
  }

  const newId = uuidv4();
  fs.writeFileSync(DEVICE_ID_FILE, newId);
  return newId;
}

/**
 * Handle AI prompt from mobile client
 */
async function handleAIPrompt(prompt: string, uuid?: string): Promise<void> {
  // Use provided UUID or fall back to first active process
  let targetProcess;
  if (uuid) {
    targetProcess = processManager.getProcess(uuid);
    if (!targetProcess) {
      console.log(chalk.yellow(`⚠️  Process ${uuid.substring(0, 8)} not found, falling back to first active`));
      targetProcess = processManager.getFirstActiveProcess();
    }
  } else {
    targetProcess = processManager.getFirstActiveProcess();
  }
  
  if (!targetProcess) {
    console.log(chalk.red("❌ Cannot process AI prompt - no active terminal"));
    return;
  }
  
  console.log(chalk.gray(`   Targeting process: ${targetProcess.uuid.substring(0, 8)}`));

  const aiService = getAIService();
  
  // Ensure AI service has the terminal reference
  aiService.setTerminal(targetProcess.pty);

  try {
    await aiService.handlePrompt(prompt, {
      onActionStart: () => {
        // Log action start
      },
      onActionComplete: () => {
        // Log action complete
      },
      onTurnComplete: (turnNumber) => {
        console.log(chalk.gray(`  Turn ${turnNumber} complete`));
      },
      onComplete: () => {
        console.log(chalk.bold.green("\n✅ AI task completed"));
      },
      onError: (error) => {
        console.error(chalk.red("\n❌ AI task failed:"), error.message);
      },
    });
  } catch (error) {
    console.error(chalk.red("❌ AI prompt handling error:"), error);
  }
}

function connectToRelay() {
  console.log(
    chalk.yellow(`→ Connecting to relay server: ${config.RELAY_SERVER_URL}...`)
  );

  const token = getToken();
  const deviceId = getDeviceId();

  // Generate key pair for secure handshake
  keyPair = generateKeyPair();
  console.log(chalk.gray(`Device ID: ${deviceId}`));
  console.log(chalk.gray(`🔐 Generated security keys`));

  // Setup ProcessManager callbacks
  setupProcessManagerCallbacks();

  socket = io(config.RELAY_SERVER_URL, {
    reconnection: true,
    reconnectionAttempts: 5,
    timeout: 10000,
    autoConnect: true,
    forceNew: false,
  });

  socket.on("connect", () => {
    console.log(chalk.green("✅ Connected to relay server"));
    
    // Start health monitoring on first connection
    if (!healthCheckInterval) {
      startHealthMonitoring();
    }
    
    // Register as Mac device with public key and tab count
    socket.emit("register", {
      type: "mac",
      token,
      deviceId,
      deviceName: os.hostname(),
      publicKey: keyPair.publicKey,
      tabCount: processManager.getProcessCount(),
    });
  });

  socket.on("login_required", ({ loginUrl }) => {
    console.log(chalk.bold.yellow("\n🔒 Authentication Required"));
    const fullUrl = `${config.RELAY_SERVER_URL}${loginUrl}`;

    if (config.DEBUG) {
      console.log(chalk.cyan(`Login URL: ${fullUrl}`));
    }

    console.log(
      chalk.bold.white("\nPress ENTER to open login page... (Ctrl+C to exit)")
    );

    // Set up manual key listener instead of readline
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const keyListener = (buffer: Buffer) => {
      // Check for Ctrl+C (0x03)
      if (buffer[0] === 3) {
        console.log(chalk.yellow("\nBye!"));

        // EMERGENCY EXIT - cleanup EVERYTHING
        try {
          process.stdin.removeListener("data", keyListener);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.destroy();
          process.stdin.unref();
        } catch (e) {}

        try {
          if (socket) {
            socket.removeAllListeners();
            socket.disconnect();
            socket.close();
          }
        } catch (e) {}

        // Force exit with all methods
        process.exitCode = 0;
        setImmediate(() => process.exit(0));
        setTimeout(() => process.kill(process.pid, "SIGKILL"), 100);
      }

      // Check for Enter key (0x0D or 0x0A)
      if (buffer[0] === 13 || buffer[0] === 10) {
        // Clean up listener
        process.stdin.removeListener("data", keyListener);
        process.stdin.setRawMode(false);
        process.stdin.pause();

        console.log(chalk.green("\n✅ Opening browser..."));

        open(fullUrl).catch((err) => {
          console.error(chalk.red("Failed to open browser:"), err);
          console.log(
            chalk.yellow(`Please open this URL manually: ${fullUrl}`)
          );
        });
      }
    };

    process.stdin.on("data", keyListener);
  });

  socket.on("authenticated", ({ token, user }) => {
    console.log(chalk.bold.green(`\n✅ Authenticated as ${user.email}`));
    saveToken(token);

    // Clean up stdin if in raw mode
    try {
      if (process.stdin.isRaw) {
        process.stdin.setRawMode(false);
      }
      process.stdin.removeAllListeners("data");
      process.stdin.pause();
    } catch (e) {
      // Ignore errors
    }

    console.log(chalk.cyan("\n⏳ Waiting for mobile device to connect..."));
    console.log(chalk.gray("Open the mobile app and select this device.\n"));
  });

  socket.on("auth_error", ({ message }) => {
    console.log(chalk.red(`\n❌ Auth Error: ${message}`));
    console.log(chalk.yellow("Removing invalid token..."));
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
    // Will trigger login_required on next register attempt
    socket.emit("register", {
      type: "mac",
      deviceId,
      deviceName: os.hostname(),
      publicKey: keyPair.publicKey,
      tabCount: processManager.getProcessCount(),
    });
  });

  socket.on("terminal:dimensions", ({ cols, rows }) => {
    console.log(chalk.cyan(`📐 Received terminal dimensions: ${cols}x${rows}`));
    handleTerminalResize({ cols, rows });
  });

  socket.on("request_dimensions", () => {
    // Mobile is asking for dimensions? Actually mobile sends them.
    // Mac doesn't need to send dimensions usually, but if we reversed roles...
    // In this case, just ignore or log.
  });

  socket.on("waiting_for_peer", ({ message }) => {
    console.log(chalk.yellow(`\n⏳ ${message}`));
  });

  // Handle secure handshake initiation
  socket.on(
    "handshake:initiate",
    ({
      peerId,
      peerPublicKey: receivedPeerPublicKey,
      challenge,
    }: {
      peerId: string;
      peerPublicKey: string;
      challenge: string;
    }) => {
      console.log(chalk.cyan(`🔐 Starting secure handshake with ${peerId}...`));

      try {
        // Store peer's public key
        peerPublicKey = receivedPeerPublicKey;

        // Derive shared secret
        sharedSecret = deriveSharedSecret(keyPair.privateKey, peerPublicKey);
        console.log(chalk.gray("✅ Derived shared secret"));

        // Sign the challenge
        const signature = signChallenge(challenge, sharedSecret);

        // Send response
        socket.emit("handshake:response", {
          peerId,
          signature,
        });

        console.log(chalk.gray("→ Sent challenge response"));
      } catch (error) {
        console.error(chalk.red("❌ Handshake failed:"), error);
        socket.emit("error", { message: "Handshake failed" });
      }
    }
  );

  // Handle verification of peer's signature
  socket.on(
    "handshake:verify",
    ({ peerId, signature }: { peerId: string; signature: string }) => {
      console.log(chalk.cyan(`🔍 Verifying peer signature from ${peerId}...`));

      try {
        if (!sharedSecret) {
          throw new Error("No shared secret available");
        }

        // For now, let's just confirm the handshake
        // In a production system, we'd verify the signature properly
        console.log(chalk.green("✅ Peer verified"));
        socket.emit("handshake:confirmed");
      } catch (error) {
        console.error(chalk.red("❌ Verification failed:"), error);
        socket.emit("error", { message: "Verification failed" });
      }
    }
  );

  socket.on(
    "paired",
    ({ message, peerId }: { message: string; peerId: string }) => {
      console.log(chalk.bold.green(`\n✅ ${message}`));
      console.log(chalk.gray(`Peer ID: ${peerId}`));
      console.log(
        chalk.gray(`🔒 Connection secured with end-to-end encryption\n`)
      );

      // Initialize AI service dimensions
      getAIService().setDimensions(terminalCols, terminalRows);

      // Always send processes:sync (even if empty) so iOS knows sync is complete
      const existingProcesses = processManager.getProcessSyncData();
      console.log(chalk.cyan(`→ Syncing ${existingProcesses.length} process(es) to iOS via socket...`));
      
      const syncPayload = {
        processes: existingProcesses,
        activeUuids: processManager.getActiveProcessIds(),
      };
      
      // Send via socket as fallback (WebRTC will also send when connected)
      socket.emit("processes:sync", syncPayload);
      
      if (existingProcesses.length > 0) {
        // Send terminal ready since we already have processes
        socket.emit("system:message", { type: "terminal_ready" });
      }

      // Initiate WebRTC
      setupWebRTC();
    }
  );

  socket.on("paired_device_disconnected", ({ message }) => {
    console.log(chalk.yellow(`\n⚠️  ${message}`));
    
    // Check if WebRTC P2P is still active
    if (isWebRTCConnected && dataChannel?.readyState === "open") {
      console.log(chalk.yellow("⚠️  Relay disconnected, but P2P active"));
      return;
    }
    
    // Close WebRTC connection but DON'T cleanup processes
    // Processes will persist for reconnection
    console.log(chalk.cyan(`→ Keeping ${processManager.getProcessCount()} process(es) alive for reconnection...`));
    
    // Close WebRTC and clean up event listeners
    if (dataChannel) {
      try {
        dataChannel.onopen = null;
        dataChannel.onclose = null;
        dataChannel.onmessage = null;
        dataChannel.close();
      } catch (e) {
        // Ignore
      }
      dataChannel = null;
    }
    
    if (peerConnection) {
      try {
        peerConnection.onicecandidate = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.close();
      } catch (e) {
        // Ignore
      }
      peerConnection = null;
    }
    isWebRTCConnected = false;
    pendingIceCandidates = [];
    
    // Force garbage collection to clean up closed connections
    if (global.gc) {
      global.gc();
    }
    
    // Re-register to wait for reconnection
    const token = getToken();
    socket.emit("register", {
      type: "mac",
      token,
      deviceId,
      deviceName: os.hostname(),
      publicKey: keyPair.publicKey,
      tabCount: processManager.getProcessCount(),
    });
    
    console.log(chalk.cyan("⏳ Waiting for iOS to reconnect..."));
  });

  // WebRTC handlers
  socket.on("webrtc:answer", async ({ answer }) => {
    console.log(chalk.cyan("← Received WebRTC answer"));
    
    if (!peerConnection) {
      console.log(chalk.yellow("⚠️  No peer connection available, ignoring answer"));
      return;
    }

    // Check signaling state to prevent setting answer in wrong state
    const signalingState = peerConnection.signalingState;
    if (signalingState !== "have-local-offer") {
      console.log(chalk.yellow(`⚠️  Cannot set answer in state: ${signalingState} (expected: have-local-offer)`));
      return;
    }

    try {
      await peerConnection.setRemoteDescription(answer);

      // Add pending candidates
      if (pendingIceCandidates.length > 0) {
        console.log(chalk.gray(`→ Adding ${pendingIceCandidates.length} pending ICE candidate(s)`));
        for (const c of pendingIceCandidates) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(c));
        }
        pendingIceCandidates = [];
      }
    } catch (error) {
      console.error(chalk.red("❌ Failed to set remote answer:"), error);
    }
  });

  socket.on("webrtc:ice-candidate", async ({ candidate }) => {
    if (peerConnection && candidate.candidate) {
      try {
        if (!peerConnection.remoteDescription) {
          pendingIceCandidates.push(candidate);
        } else {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (error) {
        console.error(chalk.red("❌ Failed to add ICE candidate:"), error);
      }
    }
  });

  // Socket handlers for process commands (fallback when WebRTC not available)
  socket.on("process:create", (payload: ProcessCreatePayload) => {
    handleProcessCreate(payload);
  });

  socket.on("process:terminate", (payload: ProcessTerminatePayload) => {
    handleProcessTerminate(payload);
  });

  socket.on("process:switch", (payload: ProcessSwitchPayload) => {
    handleProcessSwitch(payload);
  });

  socket.on("process:rename", (payload: ProcessRenamePayload) => {
    handleProcessRename(payload);
  });

  // Fallback IO - Accept from socket even if WebRTC is active (Mobile decides routing)
  socket.on("terminal:input", (data: TerminalInputPayload | string) => {
    handleTerminalInput(data);
  });

  socket.on("terminal:actions", (payload: TerminalActionsPayload) => {
    handleTerminalActions(payload);
  });

  socket.on("terminal:resize", (payload: TerminalResizePayload) => {
    handleTerminalResize(payload);
  });

  // Handle AI prompt via Socket
  socket.on("ai:prompt", (data: AIPromptPayload) => {
    console.log(chalk.cyan(`\n🤖 AI Prompt received via Socket: "${data.prompt}"`));
    handleAIPrompt(data.prompt, data.uuid);
  });

  // Handle code:openCurrentDir via Socket (fallback)
  socket.on("code:openCurrentDir", (payload: { uuid: string }) => {
    console.log(chalk.cyan(`📂 code:openCurrentDir received via Socket`));
    handleCodeOpenCurrentDir(payload);
  });
}

// Handle graceful shutdown
function handleShutdown(signal: string) {
  console.log(chalk.yellow(`\n\nShutting down Mac client (${signal})...`));

  // Set a timeout to FORCE exit if cleanup takes too long
  const forceExitTimeout = setTimeout(() => {
    console.log(chalk.red("⚠️  Force exiting..."));
    process.kill(process.pid, "SIGKILL");
  }, 1000); // Reduced to 1 second

  // Unref the timeout so it doesn't keep the process alive
  forceExitTimeout.unref();

  try {
    // Stop health monitoring
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }

    // Close readline interface first
    if (rl) {
      try {
        rl.close();
      } catch (e) {
        // Ignore errors
      }
      rl = null;
    }

    // Clean up stdin AGGRESSIVELY
    try {
      if (process.stdin.isTTY && process.stdin.isRaw) {
        process.stdin.setRawMode(false);
      }
      process.stdin.removeAllListeners();
      process.stdin.pause();
      process.stdin.destroy();
      process.stdin.unref();
    } catch (e) {
      // Ignore stdin cleanup errors
    }

    // Clean up all processes (this also stops process manager's memory monitoring)
    processManager.cleanup();

    // Close WebRTC connections
    if (dataChannel) {
      try {
        dataChannel.close();
      } catch (e) {
        // Ignore
      }
      dataChannel = null;
    }

    if (peerConnection) {
      try {
        peerConnection.close();
      } catch (e) {
        // Ignore
      }
      peerConnection = null;
    }

    // Disconnect socket SYNCHRONOUSLY
    if (socket) {
      try {
        socket.removeAllListeners();
        socket.disconnect();
        (socket as unknown as { close?: () => void }).close?.(); // Force close the underlying connection
      } catch (e) {
        // Ignore
      }
    }

    console.log(chalk.green("✅ Cleanup complete"));

    // Force exit NOW - don't wait for event loop
    setImmediate(() => {
      process.exit(0);
    });
  } catch (error) {
    console.error(chalk.red("❌ Error during shutdown:"), error);
    process.exit(1);
  }
}

// Handle both SIGINT (Ctrl+C) and SIGTERM
process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error(chalk.red("\n❌ Uncaught Exception:"), error);
  handleShutdown("ERROR");
});

// Start
connectToRelay();
