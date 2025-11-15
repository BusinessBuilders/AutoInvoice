# 🚀 QUICK START - Run This First!

## One-Command Setup

```bash
./setup-database.sh
```

That's it! This script will:
1. ✅ Start PostgreSQL & Redis
2. ✅ Run database migrations
3. ✅ Create Check payment tables
4. ✅ Set up everything you need

---

## If Something Goes Wrong

### Script Failed? Try Manual Setup:

```bash
# 1. Start database
docker compose up -d postgres redis

# 2. Wait a moment for it to start
sleep 5

# 3. Run migrations
cd apps/backend
npx prisma migrate dev --name add_check_payment_feature
```

---

## What You Get

After running the setup:

- ✅ PostgreSQL database with all tables
- ✅ Check payment recognition ready
- ✅ Receipt OCR ready
- ✅ Quick invoice AI ready
- ✅ All 100% complete features working

---

## Next Steps

1. **Configure API Keys** (apps/backend/.env):
   ```bash
   OPENAI_API_KEY=sk-...
   # or
   ANTHROPIC_API_KEY=sk-ant-...
   ```

2. **Start Backend**:
   ```bash
   cd apps/backend
   npm install
   npm run dev
   ```

3. **Start Frontend** (new terminal):
   ```bash
   cd apps/web
   npm install
   npm run dev
   ```

4. **Open Browser**:
   - Frontend: http://localhost:3000
   - Check Upload: http://localhost:3000/checks/upload

---

## 🎯 Test the Check Payment Feature

1. Go to: http://localhost:3000/checks/upload
2. Upload a check photo
3. AI extracts: check #, amount, date, payee
4. System finds matching invoice
5. **Auto-marks invoice as PAID!** ✅

---

For detailed setup instructions, see **SETUP_GUIDE.md**

**🎉 The project is 100% complete - just run the setup!**
