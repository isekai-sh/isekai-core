/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents repeated API calls when experiencing sustained 429 rate limit errors.
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, reject requests immediately (serve from cache)
 * - HALF_OPEN: Testing if service recovered, allow limited requests
 *
 * Features Redis persistence for state survival across worker restarts.
 */

import { RedisClientManager } from './redis-client.js';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of consecutive failures before opening
  openDuration: number; // Time to stay open in milliseconds
  halfOpenMaxAttempts: number; // Number of test requests in half-open state
}

export interface CircuitBreakerStatus {
  state: CircuitState;
  failures: number;
  lastFailureTime: Date | null;
  nextAttemptTime: Date | null;
}

/**
 * Circuit Breaker for API rate limiting
 */
export class CircuitBreaker {
  private static circuits = new Map<string, CircuitBreakerState>();

  private static defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 3, // Open after 3 consecutive 429s
    openDuration: 5 * 60 * 1000, // Stay open for 5 minutes
    halfOpenMaxAttempts: 1, // Test with 1 request
  };

  /**
   * Check if request should be allowed through circuit breaker
   *
   * @param key - Circuit identifier (e.g., endpoint or user+endpoint)
   * @param config - Optional circuit breaker configuration
   * @returns true if request should proceed, false if circuit is open
   */
  static async shouldAllowRequest(
    key: string,
    config: Partial<CircuitBreakerConfig> = {}
  ): Promise<boolean> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const circuit = await this.getOrCreateCircuit(key, mergedConfig);

    switch (circuit.state) {
      case CircuitState.CLOSED:
        // Normal operation
        return true;

      case CircuitState.OPEN:
        // Check if enough time has passed to try half-open
        const now = Date.now();
        const timeSinceOpen = now - circuit.lastFailureTime;

        if (timeSinceOpen >= mergedConfig.openDuration) {
          console.log(`[CircuitBreaker] ${key}: Transitioning to HALF_OPEN`);
          circuit.state = CircuitState.HALF_OPEN;
          circuit.halfOpenAttempts = 0;
          return true;
        }

        // Circuit still open, reject request
        console.log(`[CircuitBreaker] ${key}: Circuit OPEN, rejecting request`);
        return false;

      case CircuitState.HALF_OPEN:
        // Allow limited test requests
        if (circuit.halfOpenAttempts < mergedConfig.halfOpenMaxAttempts) {
          circuit.halfOpenAttempts++;
          return true;
        }

        // Max attempts reached, stay in half-open
        console.log(`[CircuitBreaker] ${key}: HALF_OPEN max attempts reached`);
        return false;

      default:
        return true;
    }
  }

  /**
   * Record a successful request
   *
   * @param key - Circuit identifier
   */
  static async recordSuccess(key: string): Promise<void> {
    const circuit = this.circuits.get(key);
    if (!circuit) return;

    // Reset failure count
    circuit.failures = 0;

    // If half-open, transition to closed
    if (circuit.state === CircuitState.HALF_OPEN) {
      console.log(`[CircuitBreaker] ${key}: Success in HALF_OPEN, transitioning to CLOSED`);
      circuit.state = CircuitState.CLOSED;
      circuit.halfOpenAttempts = 0;
    }

    // Persist updated state to Redis
    if (this.isPersistenceEnabled()) {
      await this.saveCircuitToRedis(key, circuit);
    }
  }

  /**
   * Record a failed request (429 error)
   *
   * @param key - Circuit identifier
   * @param config - Optional circuit breaker configuration
   */
  static async recordFailure(
    key: string,
    config: Partial<CircuitBreakerConfig> = {}
  ): Promise<void> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const circuit = await this.getOrCreateCircuit(key, mergedConfig);

    circuit.failures++;
    circuit.lastFailureTime = Date.now();

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Failure in half-open, go back to open
      console.log(`[CircuitBreaker] ${key}: Failure in HALF_OPEN, returning to OPEN`);
      circuit.state = CircuitState.OPEN;
      circuit.halfOpenAttempts = 0;
    } else if (circuit.state === CircuitState.CLOSED) {
      // Check if threshold reached
      if (circuit.failures >= mergedConfig.failureThreshold) {
        console.log(
          `[CircuitBreaker] ${key}: Failure threshold reached (${circuit.failures}), opening circuit`
        );
        circuit.state = CircuitState.OPEN;
      }
    }

    // Persist updated state to Redis
    if (this.isPersistenceEnabled()) {
      await this.saveCircuitToRedis(key, circuit);
    }
  }

  /**
   * Get circuit status
   *
   * @param key - Circuit identifier
   * @returns Circuit status or null if not found
   */
  static getStatus(key: string): CircuitBreakerStatus | null {
    const circuit = this.circuits.get(key);
    if (!circuit) return null;

    const nextAttemptTime =
      circuit.state === CircuitState.OPEN && circuit.lastFailureTime > 0
        ? new Date(circuit.lastFailureTime + circuit.config.openDuration)
        : null;

    return {
      state: circuit.state,
      failures: circuit.failures,
      lastFailureTime: circuit.lastFailureTime > 0 ? new Date(circuit.lastFailureTime) : null,
      nextAttemptTime,
    };
  }

  /**
   * Get all circuit statuses (for monitoring)
   */
  static getAllStatuses(): Record<string, CircuitBreakerStatus> {
    const statuses: Record<string, CircuitBreakerStatus> = {};
    for (const [key, circuit] of this.circuits) {
      const status = this.getStatus(key);
      if (status) {
        statuses[key] = status;
      }
    }
    return statuses;
  }

  /**
   * Reset a specific circuit
   *
   * @param key - Circuit identifier
   */
  static reset(key: string): void {
    const circuit = this.circuits.get(key);
    if (circuit) {
      circuit.state = CircuitState.CLOSED;
      circuit.failures = 0;
      circuit.lastFailureTime = 0;
      circuit.halfOpenAttempts = 0;
      console.log(`[CircuitBreaker] ${key}: Circuit reset to CLOSED`);
    }
  }

  /**
   * Reset all circuits (for testing)
   */
  static resetAll(): void {
    this.circuits.clear();
    console.log('[CircuitBreaker] All circuits reset');
  }

  /**
   * Get or create circuit state (with Redis persistence)
   */
  private static async getOrCreateCircuit(
    key: string,
    config: CircuitBreakerConfig
  ): Promise<CircuitBreakerState> {
    // Check in-memory cache first
    let circuit = this.circuits.get(key);
    if (circuit) {
      return circuit;
    }

    // Check Redis if persistence enabled
    if (this.isPersistenceEnabled()) {
      circuit = await this.getCircuitFromRedis(key);
      if (circuit) {
        // Restore to in-memory cache
        this.circuits.set(key, circuit);
        return circuit;
      }
    }

    // Create new circuit
    circuit = {
      state: CircuitState.CLOSED,
      failures: 0,
      lastFailureTime: 0,
      halfOpenAttempts: 0,
      config,
    };

    this.circuits.set(key, circuit);

    // Persist to Redis
    if (this.isPersistenceEnabled()) {
      await this.saveCircuitToRedis(key, circuit);
    }

    return circuit;
  }

  /**
   * Get circuit state from Redis
   */
  private static async getCircuitFromRedis(key: string): Promise<CircuitBreakerState | null> {
    try {
      const redis = await RedisClientManager.getClient();
      if (!redis) return null;

      const data = await redis.get(`circuit:${key}`);
      if (!data) return null;

      return JSON.parse(data) as CircuitBreakerState;
    } catch (error) {
      console.error('[CircuitBreaker] Error loading from Redis:', error);
      return null;
    }
  }

  /**
   * Save circuit state to Redis
   */
  private static async saveCircuitToRedis(
    key: string,
    circuit: CircuitBreakerState
  ): Promise<void> {
    try {
      const redis = await RedisClientManager.getClient();
      if (!redis) return;

      const ttl = Math.floor(circuit.config.openDuration / 1000) + 60; // TTL slightly longer than open duration

      await redis.setex(`circuit:${key}`, ttl, JSON.stringify(circuit));
    } catch (error) {
      console.error('[CircuitBreaker] Error saving to Redis:', error);
    }
  }

  /**
   * Check if Redis persistence is enabled
   */
  private static isPersistenceEnabled(): boolean {
    const enabled = process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS?.toLowerCase();
    return enabled !== 'false' && enabled !== '0';
  }

  /**
   * Check if circuit breaker is enabled
   */
  static isEnabled(): boolean {
    const enabled = process.env.CIRCUIT_BREAKER_ENABLED?.toLowerCase();
    return enabled !== 'false' && enabled !== '0';
  }

  /**
   * Get configured failure threshold
   */
  static getFailureThreshold(): number {
    const threshold = parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '3', 10);
    return isNaN(threshold) ? 3 : threshold;
  }
}

/**
 * Internal circuit state
 */
interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureTime: number; // Timestamp in ms
  halfOpenAttempts: number;
  config: CircuitBreakerConfig;
}

/**
 * Wrap an API call with circuit breaker protection
 *
 * @param key - Circuit identifier
 * @param fn - Function to execute
 * @param fallback - Fallback function if circuit is open (e.g., serve stale cache)
 * @param config - Optional circuit breaker configuration
 * @returns Result of fn or fallback
 */
export async function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  fallback: () => Promise<T>,
  config: Partial<CircuitBreakerConfig> = {}
): Promise<T> {
  if (!CircuitBreaker.isEnabled()) {
    // Circuit breaker disabled, execute normally
    return fn();
  }

  // Check if request allowed
  const allowed = await CircuitBreaker.shouldAllowRequest(key, config);

  if (!allowed) {
    // Circuit open, use fallback
    console.log(`[CircuitBreaker] ${key}: Using fallback (circuit OPEN)`);
    return fallback();
  }

  try {
    // Execute function
    const result = await fn();

    // Record success
    CircuitBreaker.recordSuccess(key);

    return result;
  } catch (error: any) {
    // Check if 429 error
    const is429 =
      error?.status === 429 ||
      error?.statusCode === 429 ||
      error?.message?.toLowerCase().includes('rate limit') ||
      error?.message?.toLowerCase().includes('429');

    if (is429) {
      // Record failure for circuit breaker
      CircuitBreaker.recordFailure(key, config);
      console.log(`[CircuitBreaker] ${key}: 429 error, recorded failure`);

      // Use fallback
      return fallback();
    }

    // Non-429 error, don't affect circuit breaker
    throw error;
  }
}
