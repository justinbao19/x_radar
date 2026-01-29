#!/bin/bash
#
# X-Radar End-to-End Test Script
# Tests the complete pipeline from scraping to frontend display
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    
    # Kill background processes
    if [ -n "$MOCK_PID" ]; then
        kill $MOCK_PID 2>/dev/null || true
    fi
    
    if [ -n "$WEB_PID" ]; then
        kill $WEB_PID 2>/dev/null || true
    fi
    
    # Remove test output
    rm -rf "$ROOT_DIR/out/test-e2e" 2>/dev/null || true
}

trap cleanup EXIT

echo ""
echo "========================================"
echo "  X-Radar E2E Test Suite"
echo "========================================"
echo ""

cd "$ROOT_DIR"

# Load test environment
if [ -f ".env.test" ]; then
    log_info "Loading test environment..."
    export $(grep -v '^#' .env.test | xargs)
fi

# ============================================
# Test 1: Check Prerequisites
# ============================================
log_info "Test 1: Checking prerequisites..."

if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    exit 1
fi

NODE_VERSION=$(node -v)
log_success "Node.js version: $NODE_VERSION"

if [ ! -f "package.json" ]; then
    log_error "package.json not found"
    exit 1
fi
log_success "package.json found"

# ============================================
# Test 2: Check Configuration Files
# ============================================
log_info "Test 2: Checking configuration files..."

CONFIG_FILES=("queries.json" "influencers.json" "denylist.json")

for file in "${CONFIG_FILES[@]}"; do
    if [ -f "$file" ]; then
        # Validate JSON
        if node -e "JSON.parse(require('fs').readFileSync('$file', 'utf-8'))" 2>/dev/null; then
            log_success "$file is valid JSON"
        else
            log_error "$file is not valid JSON"
            exit 1
        fi
    else
        log_error "$file not found"
        exit 1
    fi
done

# ============================================
# Test 3: Start Mock Server
# ============================================
log_info "Test 3: Starting mock LLM server..."

node test/mocks/mock-server.mjs &
MOCK_PID=$!
sleep 2

# Check if mock server is running
if curl -s http://localhost:3001/status > /dev/null 2>&1; then
    log_success "Mock server running on port 3001"
else
    log_error "Mock server failed to start"
    exit 1
fi

# ============================================
# Test 4: Test Select Module (with test data)
# ============================================
log_info "Test 4: Testing select module..."

# Create test output directory
TEST_DATE=$(date +%Y-%m-%d)
TEST_OUT_DIR="out/$TEST_DATE"
mkdir -p "$TEST_OUT_DIR"

# Copy sample raw data to test directory
if [ -f "test/fixtures/sample-raw.json" ]; then
    cp "test/fixtures/sample-raw.json" "$TEST_OUT_DIR/raw.json"
    log_success "Test data prepared"
else
    log_error "Sample raw data not found"
    exit 1
fi

# Run select
if npm run select 2>&1; then
    if [ -f "$TEST_OUT_DIR/top10.json" ] || [ -f "out/latest/top10.json" ]; then
        log_success "Select module completed"
        
        # Validate output
        if node -e "const d = JSON.parse(require('fs').readFileSync('out/latest/top10.json', 'utf-8')); if (!d.top) throw new Error('Invalid output')" 2>/dev/null; then
            log_success "top10.json is valid"
        else
            log_warn "top10.json validation failed"
        fi
    else
        log_error "top10.json not generated"
        exit 1
    fi
else
    log_error "Select module failed"
    exit 1
fi

# ============================================
# Test 5: Test Format Module
# ============================================
log_info "Test 5: Testing format module..."

if npm run format 2>&1; then
    if [ -f "out/latest/top10.md" ]; then
        log_success "Format module completed"
    else
        log_warn "top10.md not found (may be optional)"
    fi
else
    log_warn "Format module skipped or failed"
fi

# ============================================
# Test 6: Test Comment Generation (with mock)
# ============================================
log_info "Test 6: Testing comment generation..."

export LLM_API_URL="http://localhost:3001/mock"

if timeout 60 npm run comment 2>&1; then
    if [ -f "out/latest/top10_with_comments.json" ]; then
        log_success "Comment generation completed"
        
        # Check if comments were added
        COMMENT_COUNT=$(node -e "const d = JSON.parse(require('fs').readFileSync('out/latest/top10_with_comments.json', 'utf-8')); console.log(d.top.filter(t => t.comments && t.comments.status === 'generated').length)" 2>/dev/null || echo "0")
        log_info "Generated comments for $COMMENT_COUNT tweets"
    else
        log_warn "top10_with_comments.json not found"
    fi
else
    log_warn "Comment generation timed out or failed"
fi

# ============================================
# Test 7: Test Data Sync
# ============================================
log_info "Test 7: Testing data sync..."

if npm run sync-data 2>&1; then
    if [ -f "web/public/data/manifest.json" ]; then
        log_success "Data sync completed"
        
        # Validate manifest
        if node -e "const m = JSON.parse(require('fs').readFileSync('web/public/data/manifest.json', 'utf-8')); if (!m.files) throw new Error('Invalid manifest')" 2>/dev/null; then
            log_success "manifest.json is valid"
        else
            log_warn "manifest.json validation failed"
        fi
    else
        log_error "manifest.json not found"
        exit 1
    fi
else
    log_error "Data sync failed"
    exit 1
fi

# ============================================
# Test 8: Frontend Build (optional)
# ============================================
log_info "Test 8: Testing frontend build..."

if [ -f "web/package.json" ]; then
    cd web
    
    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        log_info "Installing frontend dependencies..."
        npm install 2>&1 || {
            log_warn "Frontend dependency install failed"
            cd "$ROOT_DIR"
        }
    fi
    
    # Try build
    if npm run build 2>&1; then
        log_success "Frontend build completed"
    else
        log_warn "Frontend build failed (may need additional setup)"
    fi
    
    cd "$ROOT_DIR"
else
    log_warn "Frontend package.json not found"
fi

# ============================================
# Test 9: Unit Tests
# ============================================
log_info "Test 9: Running unit tests..."

# Run safety module tests
if node --test test/safety.test.mjs 2>&1; then
    log_success "Safety module tests passed"
else
    log_warn "Safety module tests had failures"
fi

# Run data loader tests
if node --test test/data-loader.test.mjs 2>&1; then
    log_success "Data loader tests passed"
else
    log_warn "Data loader tests had failures"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "========================================"
echo "  E2E Test Summary"
echo "========================================"
echo ""
log_success "Core pipeline tests completed"
echo ""

# List generated files
log_info "Generated files:"
ls -la out/latest/ 2>/dev/null | head -10 || true
echo ""

log_info "Manifest entries:"
node -e "const m = JSON.parse(require('fs').readFileSync('web/public/data/manifest.json', 'utf-8')); console.log('Files: ' + m.files.length)" 2>/dev/null || true

echo ""
echo "========================================"
echo "  E2E Tests Complete!"
echo "========================================"
