import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;

/**
 * Encryption utility for HIPAA-compliant data protection
 * Uses AES-256-GCM for authenticated encryption
 */
export class EncryptionService {
  private key: Buffer;

  constructor(encryptionKey?: string) {
    const keyString = encryptionKey || process.env.ENCRYPTION_KEY;
    
    if (!keyString || keyString === 'your-aes-256-encryption-key-here') {
      throw new Error('Encryption key not configured. Set ENCRYPTION_KEY environment variable.');
    }

    // Derive a proper 256-bit key from the provided key string
    this.key = crypto.scryptSync(keyString, 'salt', KEY_LENGTH);
  }

  /**
   * Encrypt sensitive data
   * @param plaintext - Data to encrypt
   * @returns Encrypted data with IV and auth tag (base64 encoded)
   */
  encrypt(plaintext: string): string {
    if (!plaintext) {
      return plaintext;
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Combine IV + encrypted data + auth tag
    const combined = Buffer.concat([
      iv,
      Buffer.from(encrypted, 'hex'),
      authTag
    ]);

    return combined.toString('base64');
  }

  /**
   * Decrypt encrypted data
   * @param encryptedData - Base64 encoded encrypted data with IV and auth tag
   * @returns Decrypted plaintext
   */
  decrypt(encryptedData: string): string {
    if (!encryptedData) {
      return encryptedData;
    }

    try {
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract IV, encrypted data, and auth tag
      const iv = combined.subarray(0, IV_LENGTH);
      const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
      const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error('Decryption failed. Data may be corrupted or key is incorrect.');
    }
  }

  /**
   * Encrypt an object's specified fields
   * @param obj - Object to encrypt
   * @param fields - Array of field names to encrypt
   * @returns Object with encrypted fields
   */
  encryptFields<T extends Record<string, any>>(obj: T, fields: string[]): T {
    const result: Record<string, any> = { ...obj };
    
    for (const field of fields) {
      if (result[field] !== undefined && result[field] !== null) {
        result[field] = this.encrypt(String(result[field]));
      }
    }
    
    return result as T;
  }

  /**
   * Decrypt an object's specified fields
   * @param obj - Object to decrypt
   * @param fields - Array of field names to decrypt
   * @returns Object with decrypted fields
   */
  decryptFields<T extends Record<string, any>>(obj: T, fields: string[]): T {
    const result: Record<string, any> = { ...obj };
    
    for (const field of fields) {
      if (result[field] !== undefined && result[field] !== null) {
        try {
          result[field] = this.decrypt(String(result[field]));
        } catch (error) {
          // Log error but don't fail - field might not be encrypted
          console.error(`Failed to decrypt field ${field}:`, error);
        }
      }
    }
    
    return result as T;
  }

  /**
   * Hash sensitive data for comparison (one-way)
   * @param data - Data to hash
   * @returns Hashed data (hex encoded)
   */
  hash(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }

  /**
   * Generate a secure random token
   * @param length - Length of token in bytes (default 32)
   * @returns Random token (hex encoded)
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
}

// Singleton instance
let encryptionService: EncryptionService | null = null;

export function getEncryptionService(): EncryptionService {
  if (!encryptionService) {
    encryptionService = new EncryptionService();
  }
  return encryptionService;
}
