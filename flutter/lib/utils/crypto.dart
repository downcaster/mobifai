import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:pointycastle/export.dart';
import 'package:convert/convert.dart';

/// Key pair for ECDH handshake
class KeyPair {
  final String publicKey;
  final String privateKey;

  const KeyPair({
    required this.publicKey,
    required this.privateKey,
  });
}

/// Cryptography utilities for secure handshake
class CryptoUtils {
  static final _secureRandom = FortunaRandom();
  static bool _randomInitialized = false;

  /// Initialize secure random generator
  static void _initRandom() {
    if (_randomInitialized) return;

    final seedSource = Random.secure();
    final seeds = List<int>.generate(32, (_) => seedSource.nextInt(256));
    _secureRandom.seed(KeyParameter(Uint8List.fromList(seeds)));
    _randomInitialized = true;
  }

  /// Generate ECDH key pair for secure handshake using secp256k1
  static KeyPair generateKeyPair() {
    _initRandom();

    // Use secp256k1 curve (same as React Native implementation)
    final domainParams = ECDomainParameters('secp256k1');
    final keyParams = ECKeyGeneratorParameters(domainParams);
    final keyGenerator = ECKeyGenerator();

    keyGenerator.init(ParametersWithRandom(keyParams, _secureRandom));

    final keyPair = keyGenerator.generateKeyPair();
    final privateKey = keyPair.privateKey as ECPrivateKey;
    final publicKey = keyPair.publicKey as ECPublicKey;

    // Encode public key as hex (uncompressed format)
    final publicKeyHex = publicKey.Q!.getEncoded(false).toHex();

    // Encode private key as hex
    final privateKeyHex = privateKey.d!.toRadixString(16).padLeft(64, '0');

    return KeyPair(
      publicKey: publicKeyHex,
      privateKey: privateKeyHex,
    );
  }

  /// Derive shared secret from peer's public key using ECDH
  static Uint8List deriveSharedSecret(String privateKeyHex, String peerPublicKeyHex) {
    final domainParams = ECDomainParameters('secp256k1');

    // Parse private key
    final privateKeyBigInt = BigInt.parse(privateKeyHex, radix: 16);
    final privateKey = ECPrivateKey(privateKeyBigInt, domainParams);

    // Parse peer's public key
    final peerPublicKeyBytes = peerPublicKeyHex.toBytes();
    final peerPublicPoint = domainParams.curve.decodePoint(peerPublicKeyBytes);
    final peerPublicKey = ECPublicKey(peerPublicPoint, domainParams);

    // Perform ECDH key agreement
    final agreement = ECDHBasicAgreement();
    agreement.init(privateKey);

    final sharedSecret = agreement.calculateAgreement(peerPublicKey);

    // Convert to bytes (pad to 32 bytes)
    final sharedSecretHex = sharedSecret.toRadixString(16).padLeft(64, '0');
    return sharedSecretHex.toBytes();
  }

  /// Sign a challenge with shared secret using HMAC-SHA256
  static String signChallenge(String challenge, Uint8List sharedSecret) {
    final hmac = HMac(SHA256Digest(), 64);
    hmac.init(KeyParameter(sharedSecret));

    final challengeBytes = utf8.encode(challenge);
    final signature = hmac.process(Uint8List.fromList(challengeBytes));

    return signature.toHex();
  }

  /// Verify challenge signature
  static bool verifyChallenge(
    String challenge,
    String signature,
    Uint8List sharedSecret,
  ) {
    final expectedSignature = signChallenge(challenge, sharedSecret);

    // Constant-time comparison to prevent timing attacks
    if (signature.length != expectedSignature.length) return false;

    var result = 0;
    for (var i = 0; i < signature.length; i++) {
      result |= signature.codeUnitAt(i) ^ expectedSignature.codeUnitAt(i);
    }
    return result == 0;
  }

  /// Generate random challenge for handshake
  static String generateChallenge() {
    _initRandom();
    final bytes = _secureRandom.nextBytes(32);
    return bytes.toHex();
  }
}

/// Extension to convert Uint8List to hex string
extension Uint8ListHex on Uint8List {
  String toHex() => hex.encode(this);
}

/// Extension to convert hex string to Uint8List
extension StringHex on String {
  Uint8List toBytes() => Uint8List.fromList(hex.decode(this));
}

