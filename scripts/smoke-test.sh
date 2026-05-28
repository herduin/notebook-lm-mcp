#!/bin/bash
# Smoke test script for NotebookLM MCP Server
# Validates that all critical endpoints are working correctly

set -e

# Configuration
HOST="${SMOKE_TEST_HOST:-127.0.0.1}"
PORT="${SMOKE_TEST_PORT:-3000}"
API_KEY="${SMOKE_TEST_API_KEY:-test}"
BASE_URL="http://${HOST}:${PORT}"

echo "🧪 Starting smoke tests for NotebookLM MCP Server"
echo "   Target: ${BASE_URL}"
echo ""

# Counter for passed tests
PASSED=0
FAILED=0

# Helper function to test endpoint
test_endpoint() {
  local method=$1
  local endpoint=$2
  local expected_code=$3
  local description=$4
  local data=$5
  local headers=$6

  echo -n "Testing ${method} ${endpoint} ... "

  if [ -n "$data" ]; then
    if [ -n "$headers" ]; then
      response=$(curl -s -w "\n%{http_code}" -X "${method}" "${BASE_URL}${endpoint}" \
        -H "Content-Type: application/json" \
        -H "${headers}" \
        -d "${data}" 2>&1) || true
    else
      response=$(curl -s -w "\n%{http_code}" -X "${method}" "${BASE_URL}${endpoint}" \
        -H "Content-Type: application/json" \
        -d "${data}" 2>&1) || true
    fi
  else
    if [ -n "$headers" ]; then
      response=$(curl -s -w "\n%{http_code}" -X "${method}" "${BASE_URL}${endpoint}" \
        -H "${headers}" 2>&1) || true
    else
      response=$(curl -s -w "\n%{http_code}" -X "${method}" "${BASE_URL}${endpoint}" 2>&1) || true
    fi
  fi

  status_code=$(echo "$response" | tail -n 1)
  body=$(echo "$response" | sed '$d')

  if [ "$status_code" = "$expected_code" ]; then
    echo "✅ PASS (HTTP ${status_code})"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo "❌ FAIL (Expected HTTP ${expected_code}, got ${status_code})"
    echo "   Response: ${body}"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

echo "=== Health Endpoints (No Auth Required) ==="
test_endpoint "GET" "/health" "200" "Health check"
test_endpoint "GET" "/ready" "200" "Readiness check" || true  # May return 503 if not ready
test_endpoint "GET" "/live" "200" "Liveness check"
echo ""

echo "=== Root Endpoint ==="
test_endpoint "GET" "/" "200" "Root API information"
echo ""

echo "=== MCP Endpoints (Auth Required) ==="
test_endpoint "GET" "/mcp/tools" "200" "List MCP tools" "" "X-API-Key: ${API_KEY}"
test_endpoint "POST" "/mcp/call" "200" "Call MCP tool" '{"tool":"get_notebook_metadata","arguments":{}}' "X-API-Key: ${API_KEY}" || true
echo ""

echo "=== REST API Compatibility Endpoints (Auth Required) ==="
test_endpoint "GET" "/api/tools" "200" "List tools (REST alias)" "" "X-API-Key: ${API_KEY}"
test_endpoint "POST" "/api/ask" "200" "Ask question (REST alias)" '{"question":"What is this notebook about?"}' "X-API-Key: ${API_KEY}" || true
echo ""

echo "=== Authentication Tests ==="
test_endpoint "GET" "/mcp/tools" "401" "Should reject without API key"
test_endpoint "GET" "/api/tools" "401" "Should reject without API key (REST)"
echo ""

# Summary
echo "========================================="
echo "Smoke Test Summary"
echo "========================================="
echo "✅ Passed: ${PASSED}"
echo "❌ Failed: ${FAILED}"
echo "========================================="

if [ $FAILED -gt 0 ]; then
  echo "❌ Some tests failed!"
  exit 1
else
  echo "✅ All critical tests passed!"
  exit 0
fi
