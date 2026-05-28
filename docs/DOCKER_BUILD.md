# Docker Build Notes

## Platform Support

### Linux AMD64 (x86_64)
✅ **Fully Supported** - The Docker image is currently built for `linux/amd64` platform only.

This decision was made because:
1. The production EC2 instance runs on x86_64 architecture
2. ARM64 builds were failing with QEMU emulation errors during `npm ci` in GitHub Actions
3. Immediate production deployment is prioritized over multi-architecture support

### Linux ARM64
⚠️ **Temporarily Disabled** - ARM64 builds are disabled due to QEMU emulation issues in GitHub Actions.

**Error Details:**
```
qemu: uncaught target signal 4 (Illegal instruction) - core dumped
Illegal instruction (core dumped)
exit code: 132
```

The failure occurs during `npm ci --omit=dev` when building `linux/arm64` in the Docker multi-platform build.

**Future Support:**
ARM64 support can be re-enabled when:
1. GitHub Actions runners with native ARM64 support are available
2. A dedicated ARM64 build workflow using native runners is set up
3. The QEMU emulation issues are resolved upstream

**Workaround for ARM64 Users:**
If you need to run on ARM64 (e.g., Apple Silicon, AWS Graviton):
1. Clone the repository
2. Build locally on an ARM64 machine: `docker build -t notebooklm-mcp:arm64 .`
3. Push to your own registry

## Build Configuration

The current GitHub Actions workflow (`.github/workflows/docker-build.yml`) is configured to:
- Build only for `linux/amd64`
- Push to `ghcr.io/herduin/notebook-lm-mcp`
- Tag with: `latest`, `{branch}-{sha}`, and semver tags

## Re-enabling ARM64 Builds

To re-enable ARM64 builds in the future, modify `.github/workflows/docker-build.yml`:

```yaml
- name: Build and push Docker image
  uses: docker/build-push-action@v5
  with:
    platforms: linux/amd64,linux/arm64  # Add back arm64
    # ... rest of configuration
```

Or create a separate workflow with native ARM64 runners:

```yaml
jobs:
  build-arm64:
    runs-on: [self-hosted, linux, ARM64]  # Native ARM64 runner
    steps:
      # ... build steps for ARM64 only
```
