#!/bin/bash
# Script to validate all HTTP API endpoints

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:3100}"
HEALTH_BASE_URL="${HEALTH_BASE_URL:-http://localhost:3000}"

echo "======================================"
echo "NotebookLM MCP Server Endpoint Tests"
echo "======================================"
echo ""
echo "API Base URL: $API_BASE_URL"
echo "Health Base URL: $HEALTH_BASE_URL"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to test endpoint
test_endpoint() {
    local method=$1
    local url=$2
    local data=$3
    local description=$4
    local expected_status=${5:-200}

    echo -n "Testing: $description... "

    if [ "$method" == "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -X GET "$url" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X POST "$url" \
            -H "Content-Type: application/json" \
            -d "$data" 2>&1)
    fi

    # Extract status code (last line)
    status_code=$(echo "$response" | tail -n 1)
    # Extract body (all but last line)
    body=$(echo "$response" | sed '$d')

    if [ "$status_code" == "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (Status: $status_code)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        if [ -n "$body" ] && [ "$body" != "000" ]; then
            echo "  Response: $(echo "$body" | head -c 100)..."
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (Expected: $expected_status, Got: $status_code)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo "  Response: $body"
    fi
    echo ""
}

# Test health endpoints (Port 3000)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Health Endpoints (Port 3000)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_endpoint "GET" "$HEALTH_BASE_URL/health" "" "GET /health - Health check" 200
test_endpoint "GET" "$HEALTH_BASE_URL/ready" "" "GET /ready - Readiness check" 200
test_endpoint "GET" "$HEALTH_BASE_URL/live" "" "GET /live - Liveness check" 200

# Test HTTP API endpoints (Port 3100)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "HTTP API Endpoints (Port 3100)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test root endpoint
test_endpoint "GET" "$API_BASE_URL/" "" "GET / - API info" 200

# Test GET /api/tools
test_endpoint "GET" "$API_BASE_URL/api/tools" "" "GET /api/tools - List tools" 200

# Test POST /api/ask (will fail without proper setup, but we validate endpoint exists)
test_data='{"question":"What is this notebook about?"}'
test_endpoint "POST" "$API_BASE_URL/api/ask" "$test_data" "POST /api/ask - Ask question" "200|401|500"

# Test POST /mcp/call
mcp_call_data='{"tool":"ask_notebook","arguments":{"question":"Test question"}}'
test_endpoint "POST" "$API_BASE_URL/mcp/call" "$mcp_call_data" "POST /mcp/call - MCP tool call" "200|401|500"

# Test POST /mcp/tools
test_endpoint "POST" "$API_BASE_URL/mcp/tools" "" "POST /mcp/tools - MCP list tools" 200

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
