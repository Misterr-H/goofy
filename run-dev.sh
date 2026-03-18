#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🎵 Goofy Music Server - Development Setup${NC}"
echo "=========================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Check if Redis container is already running
if docker ps --format "table {{.Names}}" | grep -q "goofy-redis"; then
    echo -e "${YELLOW}⚠️  Redis container 'goofy-redis' is already running${NC}"
else
    echo -e "${BLUE}🐳 Starting Redis container...${NC}"
    
    # Stop any existing container with the same name
    docker stop goofy-redis > /dev/null 2>&1
    docker rm goofy-redis > /dev/null 2>&1
    
    # Start Redis container with memory limits
    docker run -d \
        --name goofy-redis \
        -p 6379:6379 \
        --memory=600m \
        --memory-reservation=100m \
        redis:7-alpine \
        redis-server \
        --appendonly yes \
        --maxmemory 512mb \
        --maxmemory-policy allkeys-lru \
        --save 900 1 \
        --save 300 10 \
        --save 60 10000
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Redis container started successfully${NC}"
    else
        echo -e "${RED}❌ Failed to start Redis container${NC}"
        exit 1
    fi
fi

# Wait a moment for Redis to be ready
echo -e "${BLUE}⏳ Waiting for Redis to be ready...${NC}"
sleep 2

# Test Redis connection
if docker exec goofy-redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is ready and responding${NC}"
else
    echo -e "${RED}❌ Redis is not responding. Please check the container logs.${NC}"
    echo "You can check logs with: docker logs goofy-redis"
    exit 1
fi

# Check if .env file exists in backend
if [ ! -f "packages/backend/.env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found in packages/backend/${NC}"
    echo -e "${BLUE}📝 Creating .env file from .env.example...${NC}"
    
    if [ -f "packages/backend/.env.example" ]; then
        cp packages/backend/.env.example packages/backend/.env
        echo -e "${GREEN}✅ .env file created from .env.example${NC}"
        echo -e "${YELLOW}⚠️  Please update packages/backend/.env with your actual configuration${NC}"
    else
        echo -e "${RED}❌ .env.example not found. Please create packages/backend/.env manually${NC}"
        echo "Required variables:"
        echo "  REDIS_URL=redis://localhost:6379"
        exit 1
    fi
fi

# Navigate to backend directory
cd packages/backend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 Installing dependencies...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}🚀 Starting backend development server...${NC}"
echo -e "${BLUE}📍 Server will be available at: http://localhost:3000${NC}"
echo -e "${BLUE}📍 Redis is available at: localhost:6379${NC}"
echo ""
echo -e "${YELLOW}💡 Useful commands:${NC}"
echo "  - Stop Redis: docker stop goofy-redis"
echo "  - View Redis logs: docker logs goofy-redis"
echo "  - Redis CLI: docker exec -it goofy-redis redis-cli"
echo "  - Stop server: Ctrl+C"
echo ""

# Start the backend development server
npm run dev 