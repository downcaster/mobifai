import crypto from 'crypto';

interface PairingCode {
  code: string;
  deviceName: string;
  createdAt: Date;
  expiresAt: Date;
}

interface TokenData {
  token: string;
  createdAt: Date;
}

export class AuthManager {
  private pairingCodes: Map<string, PairingCode> = new Map();
  private tokens: Set<string> = new Set();
  private readonly PAIRING_CODE_EXPIRY = 5 * 60 * 1000; // 5 minutes

  generatePairingCode(deviceName: string): string {
    // Generate a simple 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const pairingData: PairingCode = {
      code,
      deviceName,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.PAIRING_CODE_EXPIRY)
    };

    this.pairingCodes.set(code, pairingData);

    // Auto-cleanup expired codes after expiry time
    setTimeout(() => {
      this.pairingCodes.delete(code);
    }, this.PAIRING_CODE_EXPIRY);

    console.log(`🔑 Pairing code generated: ${code} for device: ${deviceName}`);

    return code;
  }

  verifyPairingCode(code: string): string | null {
    const pairingData = this.pairingCodes.get(code);

    if (!pairingData) {
      console.log(`❌ Invalid pairing code: ${code}`);
      return null;
    }

    // Check if expired
    if (new Date() > pairingData.expiresAt) {
      console.log(`⏰ Expired pairing code: ${code}`);
      this.pairingCodes.delete(code);
      return null;
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    this.tokens.add(token);

    // Remove pairing code after use
    this.pairingCodes.delete(code);

    console.log(`✅ Pairing successful for device: ${pairingData.deviceName}`);

    return token;
  }

  verifyToken(token: string): boolean {
    return this.tokens.has(token);
  }

  revokeToken(token: string): void {
    this.tokens.delete(token);
  }

  getActivePairingCodes(): number {
    return this.pairingCodes.size;
  }

  getActiveTokens(): number {
    return this.tokens.size;
  }
}
