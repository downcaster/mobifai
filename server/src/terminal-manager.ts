import * as pty from 'node-pty';
import os from 'os';

interface TerminalSession {
  ptyProcess: pty.IPty;
  createdAt: Date;
}

export class TerminalManager {
  private sessions: Map<string, TerminalSession> = new Map();

  createSession(sessionId: string): pty.IPty {
    // Determine the shell based on OS
    const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';

    // Create PTY process
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME || process.cwd(),
      env: process.env as { [key: string]: string }
    });

    // Store session
    this.sessions.set(sessionId, {
      ptyProcess,
      createdAt: new Date()
    });

    console.log(`✅ Terminal session created: ${sessionId}`);

    return ptyProcess;
  }

  getSession(sessionId: string): pty.IPty | undefined {
    return this.sessions.get(sessionId)?.ptyProcess;
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (session) {
      session.ptyProcess.kill();
      this.sessions.delete(sessionId);
      console.log(`❌ Terminal session closed: ${sessionId}`);
    }
  }

  getActiveSessions(): number {
    return this.sessions.size;
  }

  // Cleanup old sessions (optional, for long-running servers)
  cleanup(maxAgeMinutes: number = 60): void {
    const now = new Date();

    for (const [sessionId, session] of this.sessions.entries()) {
      const ageMinutes = (now.getTime() - session.createdAt.getTime()) / 60000;

      if (ageMinutes > maxAgeMinutes) {
        this.closeSession(sessionId);
      }
    }
  }
}
