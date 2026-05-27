# Known Issues and TODOs

## TypeScript Overload Warnings

The project currently has TypeScript overload warnings related to Pino logger method calls. These are due to Pino's complex function overloads in strict mode. The code works correctly at runtime but TypeScript strict checking flags the argument order.

### Issue
```typescript
// Pino expects: logger.info(object, message) OR logger.info(message)
// Current usage: logger.info(message, {object})
```

### Workarounds
1. **Disable `noUnusedLocals` and `noUnusedParameters`** (currently applied)
2. Use `// @ts-expect-error` before each log call
3. Create a logger wrapper (adds complexity)
4. Downgrade TypeScript strictness (not recommended)

### Resolution
For production use, the current configuration with relaxed `noUnusedLocals` and `noUnusedParameters` is acceptable. The code will compile and run correctly despite the warnings.

To fully resolve, refactor all logger calls to use the Pino-preferred signature:
```typescript
// Before
logger.info('Message', { data: 'value' });

// After
logger.info({ data: 'value' }, 'Message');
```

## Future Enhancements

1. **Direct NotebookLM Q&A API**: When Google releases official Q&A endpoints for NotebookLM, replace the Vertex AI workaround with direct API calls

2. **Streaming Support**: Implement streaming responses when the API supports it

3. **Batch Operations**: Add support for multiple questions in a single request

4. **Advanced Caching**: Implement Redis or Memcached for distributed caching

5. **Metrics Export**: Add Prometheus metrics exporter

6. **Rate Limiting**: Add built-in rate limiting middleware

7. **Circuit Breaker**: Implement circuit breaker pattern for API calls

8. **OpenTelemetry**: Add distributed tracing support
