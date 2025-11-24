import crypto from "react-native-quick-crypto";
import { ec as EC } from "elliptic";
import { Buffer } from "buffer";

const ec = new EC("secp256k1");

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Generate ECDH key pair for secure handshake
 */
export function generateKeyPair(): KeyPair {
  try {
    // Manually generate private key using RNG to avoid elliptic RNG issues
    const privateKeyBytes = crypto.randomBytes(32);
    const key = ec.keyFromPrivate(privateKeyBytes);

    return {
      publicKey: key.getPublic("hex"),
      privateKey: key.getPrivate("hex"),
    };
  } catch (error) {
    console.error("❌ Error generating key pair:", error);
    throw error;
  }
}

/**
 * Derive shared secret from peer's public key
 */
export function deriveSharedSecret(
  privateKey: string,
  peerPublicKey: string
): Buffer {
  const key = ec.keyFromPrivate(privateKey, "hex");
  const shared = key.derive(ec.keyFromPublic(peerPublicKey, "hex").getPublic());
  // @ts-ignore - BN type definition might be missing toArrayLike in some versions, but it exists
  return Buffer.from(shared.toArray());
}

/**
 * Sign a challenge with shared secret
 */
export function signChallenge(challenge: string, sharedSecret: Buffer): string {
  const hmac = crypto.createHmac("sha256", sharedSecret);
  hmac.update(challenge);
  return hmac.digest("hex") as string;
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
  // @ts-ignore
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}

/**
 * Generate random challenge for handshake
 */
export function generateChallenge(): string {
  return crypto.randomBytes(32).toString("hex") as string;
}
