import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptedPayload {
  encrypted: string; // base64 ciphertext
  iv: string; // base64 nonce
  authTag: string; // base64 GCM auth tag
}

/**
 * AES-256-GCM authenticated encryption for MTProto session strings.
 * The key never leaves ENV; only ciphertext + iv + tag are stored in the DB.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;
  private static readonly ALGO = 'aes-256-gcm';

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.get<string>('sessionEncryptionKey')!, 'hex');
  }

  encrypt(plaintext: string): EncryptedPayload {
    const iv = randomBytes(12);
    const cipher = createCipheriv(CryptoService.ALGO, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  decrypt(payload: EncryptedPayload): string {
    const decipher = createDecipheriv(
      CryptoService.ALGO,
      this.key,
      Buffer.from(payload.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.encrypted, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
