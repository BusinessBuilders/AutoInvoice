#!/bin/bash

# AutoInvoice Quick Start Script
# Gets everything up and running in one command

set -e

echo "🚀 AutoInvoice Quick Start"
echo "=========================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Step 1: Start Docker services
echo -e "${BLUE}Step 1/5: Starting Docker services...${NC}"
docker compose up -d
echo -e "${GREEN}✅ Docker services started${NC}"
echo ""

# Wait for services to be ready
echo -e "${BLUE}Waiting for services to be ready...${NC}"
sleep 5

# Step 2: Install root dependencies
echo -e "${BLUE}Step 2/5: Installing root dependencies...${NC}"
npm install
echo -e "${GREEN}✅ Root dependencies installed${NC}"
echo ""

# Step 3: Install backend dependencies
echo -e "${BLUE}Step 3/5: Installing backend dependencies...${NC}"
cd apps/backend
npm install
echo -e "${GREEN}✅ Backend dependencies installed${NC}"
cd ../..
echo ""

# Step 4: Setup database
echo -e "${BLUE}Step 4/5: Setting up database...${NC}"
cd apps/backend
npx prisma generate
npx prisma db push --accept-data-loss
echo -e "${GREEN}✅ Database schema created${NC}"
echo ""

echo -e "${YELLOW}Would you like to seed the database with sample data? (y/n)${NC}"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    npx tsx prisma/seed.ts
    echo -e "${GREEN}✅ Sample data added${NC}"
fi
cd ../..
echo ""

# Step 5: Install frontend dependencies
echo -e "${BLUE}Step 5/5: Installing web dependencies...${NC}"
cd apps/web
npm install
cd ../..
echo -e "${GREEN}✅ Web dependencies installed${NC}"
echo ""

echo "======================================"
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo -e "${YELLOW}To start developing:${NC}"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd apps/backend"
echo "  npm run dev"
echo ""
echo "Terminal 2 (Web App):"
echo "  cd apps/web"
echo "  npm run dev"
echo ""
echo -e "${YELLOW}Then open:${NC}"
echo "  🌐 Web App:        http://localhost:3000"
echo "  📡 API Health:     http://localhost:4000/health"
echo "  🗄️  Prisma Studio:  npm run db:studio"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  npm run docker:logs    # View Docker logs"
echo "  npm run docker:down    # Stop all services"
echo "  npm run db:studio      # Open database GUI"
echo ""
