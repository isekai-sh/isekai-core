import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, isValidApiKeyFormat } from './api-key-utils.js';

describe('generateApiKey', () => {
  it('should generate a valid API key', () => {
    const { key, hash, prefix } = generateApiKey();

    expect(key).toBeDefined();
    expect(hash).toBeDefined();
    expect(prefix).toBeDefined();
  });

  it('should generate keys with correct prefix', () => {
    const { key, prefix } = generateApiKey();

    expect(key).toMatch(/^isk_/);
    expect(prefix).toMatch(/^isk_/);
  });

  it('should generate keys with correct length', () => {
    const { key } = generateApiKey();

    // isk_ (4) + 64 hex characters = 68 total
    expect(key.length).toBe(68);
  });

  it('should generate keys with only lowercase hex characters', () => {
    const { key } = generateApiKey();

    expect(key).toMatch(/^isk_[a-f0-9]{64}$/);
  });

  it('should generate prefix of correct length', () => {
    const { prefix } = generateApiKey();

    // First 12 characters: isk_abc12345
    expect(prefix.length).toBe(12);
  });

  it('should generate unique keys on each call', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    const key3 = generateApiKey();

    expect(key1.key).not.toBe(key2.key);
    expect(key2.key).not.toBe(key3.key);
    expect(key1.key).not.toBe(key3.key);
  });

  it('should generate hash matching the key', () => {
    const { key, hash } = generateApiKey();

    const expectedHash = hashApiKey(key);
    expect(hash).toBe(expectedHash);
  });

  it('should generate unique hashes', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();

    expect(key1.hash).not.toBe(key2.hash);
  });

  it('should generate unique prefixes', () => {
    // Run multiple times to ensure high probability of uniqueness
    const prefixes = new Set();
    for (let i = 0; i < 100; i++) {
      const { prefix } = generateApiKey();
      prefixes.add(prefix);
    }

    // Should have at least 95 unique prefixes out of 100
    expect(prefixes.size).toBeGreaterThan(95);
  });
});

describe('hashApiKey', () => {
  it('should generate SHA-256 hash', () => {
    const key = 'isk_' + 'a'.repeat(64);
    const hash = hashApiKey(key);

    // SHA-256 produces 64 hex characters
    expect(hash.length).toBe(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should be deterministic (same input = same output)', () => {
    const key = 'isk_test123456789012345678901234567890123456789012345678901234';

    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    const hash3 = hashApiKey(key);

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it('should generate different hashes for different keys', () => {
    const key1 = 'isk_' + 'a'.repeat(64);
    const key2 = 'isk_' + 'b'.repeat(64);

    const hash1 = hashApiKey(key1);
    const hash2 = hashApiKey(key2);

    expect(hash1).not.toBe(hash2);
  });

  it('should handle edge cases', () => {
    expect(() => hashApiKey('')).not.toThrow();
    expect(() => hashApiKey('short')).not.toThrow();
    expect(hashApiKey('test')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should be case sensitive', () => {
    const hash1 = hashApiKey('isk_abc');
    const hash2 = hashApiKey('isk_ABC');

    expect(hash1).not.toBe(hash2);
  });

  it('should produce consistent hashes for generated keys', () => {
    const { key, hash: originalHash } = generateApiKey();
    const computedHash = hashApiKey(key);

    expect(computedHash).toBe(originalHash);
  });
});

describe('isValidApiKeyFormat', () => {
  it('should validate correct API key format', () => {
    const validKey = 'isk_' + 'a'.repeat(64);
    expect(isValidApiKeyFormat(validKey)).toBe(true);
  });

  it('should accept keys with mixed hex characters', () => {
    const validKey = 'isk_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    expect(isValidApiKeyFormat(validKey)).toBe(true);
  });

  it('should reject keys without correct prefix', () => {
    expect(isValidApiKeyFormat('abc_' + 'a'.repeat(64))).toBe(false);
    expect(isValidApiKeyFormat('ISK_' + 'a'.repeat(64))).toBe(false); // uppercase
    expect(isValidApiKeyFormat('sk_' + 'a'.repeat(64))).toBe(false);
  });

  it('should reject keys with wrong length', () => {
    expect(isValidApiKeyFormat('isk_' + 'a'.repeat(63))).toBe(false); // too short
    expect(isValidApiKeyFormat('isk_' + 'a'.repeat(65))).toBe(false); // too long
    expect(isValidApiKeyFormat('isk_')).toBe(false); // way too short
    expect(isValidApiKeyFormat('isk_abc')).toBe(false);
  });

  it('should reject keys with invalid characters', () => {
    expect(isValidApiKeyFormat('isk_' + 'z'.repeat(64))).toBe(false); // 'z' not in hex
    expect(isValidApiKeyFormat('isk_' + 'A'.repeat(64))).toBe(false); // uppercase not allowed
    expect(isValidApiKeyFormat('isk_' + 'a'.repeat(63) + 'G')).toBe(false);
    expect(isValidApiKeyFormat('isk_' + 'a'.repeat(63) + '!')).toBe(false);
  });

  it('should reject empty or malformed keys', () => {
    expect(isValidApiKeyFormat('')).toBe(false);
    expect(isValidApiKeyFormat('isk_')).toBe(false);
    expect(isValidApiKeyFormat('notakey')).toBe(false);
    expect(isValidApiKeyFormat('random string')).toBe(false);
  });

  it('should validate keys generated by generateApiKey', () => {
    // Test multiple generated keys
    for (let i = 0; i < 10; i++) {
      const { key } = generateApiKey();
      expect(isValidApiKeyFormat(key)).toBe(true);
    }
  });

  it('should reject keys with spaces', () => {
    expect(isValidApiKeyFormat('isk_ ' + 'a'.repeat(63))).toBe(false);
    expect(isValidApiKeyFormat('isk_' + 'a'.repeat(32) + ' ' + 'a'.repeat(31))).toBe(false);
  });

  it('should reject keys with special characters in hex part', () => {
    expect(isValidApiKeyFormat('isk_' + 'a'.repeat(60) + '@#$!')).toBe(false);
  });
});
