import crypto from "crypto";

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface ChallengeResponse {
  challenge: string;
  signature: string;
  publicKey: string;
}

/**
 * Generate ECDH key pair for secure handshake
 */
export function generateKeyPair(): KeyPair {
  const ecdh = crypto.createECDH("secp256k1");
  ecdh.generateKeys();

  return {
    publicKey: ecdh.getPublicKey("hex"),
    privateKey: ecdh.getPrivateKey("hex"),
  };
}

/**
 * Derive shared secret from peer's public key
 */
export function deriveSharedSecret(
  privateKey: string,
  peerPublicKey: string
): Buffer {
  const ecdh = crypto.createECDH("secp256k1");
  ecdh.setPrivateKey(Buffer.from(privateKey, "hex"));
  return ecdh.computeSecret(Buffer.from(peerPublicKey, "hex"));
}

/**
 * Sign a challenge with shared secret
 */
export function signChallenge(challenge: string, sharedSecret: Buffer): string {
  const hmac = crypto.createHmac("sha256", sharedSecret);
  hmac.update(challenge);
  return hmac.digest("hex");
}

/**
 * Verify challenge signature
 */
export function verifyChallenge(
  challenge: string,
  signature: string,
  sharedSecret: Buffer
): boolean {
  const expectedSignature = signChallenge(challenge, sharedSecret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}

/**
 * Generate random challenge for handshake
 */
export function generateChallenge(): string {
  return crypto.randomBytes(32).toString("hex");
}

