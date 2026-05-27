/**
 * Sanitize user input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  // Remove control characters
  let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit to reasonable length (enforced by schema, but double-check)
  if (sanitized.length > 4000) {
    sanitized = sanitized.substring(0, 4000);
  }

  return sanitized;
}

/**
 * Validate input for suspicious patterns
 */
export function validateQuestion(question: string): { valid: boolean; reason?: string } {
  // Check for prompt injection patterns
  const suspiciousPatterns = [
    { pattern: /ignore\s+previous\s+instructions/i, reason: 'Prompt injection attempt detected' },
    { pattern: /system\s+prompt/i, reason: 'System prompt manipulation detected' },
    { pattern: /you\s+are\s+now/i, reason: 'Role manipulation detected' },
    { pattern: /disregard\s+(all|any)\s+previous/i, reason: 'Instruction override detected' },
    { pattern: /<script[^>]*>/i, reason: 'Script tag detected' },
    { pattern: /javascript:/i, reason: 'JavaScript protocol detected' },
  ];

  for (const { pattern, reason } of suspiciousPatterns) {
    if (pattern.test(question)) {
      return { valid: false, reason };
    }
  }

  // Check for excessive repetition (potential DoS)
  const words = question.split(/\s+/);
  const uniqueWords = new Set(words);
  if (words.length > 50 && uniqueWords.size / words.length < 0.3) {
    return { valid: false, reason: 'Excessive repetition detected' };
  }

  return { valid: true };
}

/**
 * Escape special characters for safe logging
 */
export function escapeForLogging(text: string): string {
  return text
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/[\x00-\x1F\x7F]/g, '');
}

/**
 * Redact sensitive information from text
 */
export function redactSensitiveInfo(text: string): string {
  // Redact potential API keys, tokens, etc.
  const patterns = [
    { pattern: /\b[A-Za-z0-9]{32,}\b/g, replacement: '[REDACTED_TOKEN]' },
    { pattern: /sk-[A-Za-z0-9]{32,}/g, replacement: '[REDACTED_API_KEY]' },
    { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[REDACTED_CARD]' },
  ];

  let redacted = text;
  for (const { pattern, replacement } of patterns) {
    redacted = redacted.replace(pattern, replacement);
  }

  return redacted;
}
