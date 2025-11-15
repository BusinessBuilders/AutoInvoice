# AutoInvoice CLI - Usage Guide

The AutoInvoice CLI is a powerful admin tool for managing your invoice platform from the command line.

## Installation

The CLI is included with the backend. No additional installation required.

## Usage

```bash
cd apps/backend
npm run cli <command> [options]
```

## Commands Reference

### User Management

**Create Admin User**
```bash
npm run cli user:create john@example.com SecurePass123 "John Doe"
```

**List All Users**
```bash
npm run cli user:list
```

---

### Invoice Management

**List Invoices**
```bash
# List all invoices
npm run cli invoice:list

# Filter by status
npm run cli invoice:list --status=PAID

# Limit results
npm run cli invoice:list --limit=10
```

**Send Invoice Email**
```bash
npm run cli invoice:send <invoice-id>
```

**Create Invoice from Natural Language**
```bash
npm run cli invoice:create "John Smith, mowed lawn today, $50"
```

---

### Customer Management

**List Customers**
```bash
# List all customers
npm run cli customer:list

# Limit results
npm run cli customer:list --limit=20
```

---

### Statistics

**Show System Stats**
```bash
npm run cli stats
```

Output:
```
📊 AutoInvoice Statistics

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total Invoices:     247
  Total Customers:    89
  Total Services:     12
  Paid Invoices:      203
  Overdue Invoices:   8
  Total Revenue:      $45,234.50
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Database Operations

**Create Backup**
```bash
# Default location
npm run cli backup

# Custom location
npm run cli backup --output=/path/to/backup.json
```

**Cleanup Old Data**
```bash
# Dry run (see what would be deleted)
npm run cli cleanup --days=365 --dry-run

# Actually delete
npm run cli cleanup --days=365
```

---

### Services

**Start Queue Workers**
```bash
npm run cli worker:start
```

**Start Telegram Bot**
```bash
npm run cli telegram:start
```

**Google OAuth Setup**
```bash
npm run cli google:auth
```

---

## Examples

### Daily Operations

**Morning Check**
```bash
# See today's stats
npm run cli stats

# Check pending invoices
npm run cli invoice:list --status=SENT
```

**Send Overdue Reminders**
```bash
# List overdue invoices
npm run cli invoice:list --status=OVERDUE

# Send individual reminders
npm run cli invoice:send <invoice-id>
```

### Weekly Maintenance

**Create Backup**
```bash
npm run cli backup --output=./backups/weekly-$(date +%Y%m%d).json
```

**Cleanup Old Data**
```bash
npm run cli cleanup --days=730 --dry-run
```

### User Management

**Add New Team Member**
```bash
npm run cli user:create sarah@company.com TempPass123 "Sarah Johnson"
```

**List All Users**
```bash
npm run cli user:list
```

---

## Tips

### Aliases

Add these to your `.bashrc` or `.zshrc`:

```bash
alias invoice='cd /path/to/AutoInvoice/apps/backend && npm run cli'
alias invoice-stats='invoice stats'
alias invoice-backup='invoice backup'
```

### Cron Jobs

**Daily Backup (3 AM)**
```bash
0 3 * * * cd /path/to/AutoInvoice/apps/backend && npm run cli backup
```

**Weekly Cleanup (Sunday 2 AM)**
```bash
0 2 * * 0 cd /path/to/AutoInvoice/apps/backend && npm run cli cleanup --days=365
```

---

## Troubleshooting

**"Command not found"**
```bash
# Make sure you're in the backend directory
cd apps/backend

# Install dependencies
npm install
```

**"Database connection error"**
```bash
# Check if PostgreSQL is running
docker ps | grep invoice_db

# Start services
docker-compose up -d
```

**"Permission denied"**
```bash
# Make CLI executable
chmod +x src/cli.ts
```

---

## Advanced Usage

### Scripting

Create custom automation scripts:

```bash
#!/bin/bash
# send-all-drafts.sh

# Get all draft invoices and send them
npm run cli invoice:list --status=DRAFT --limit=100 | \
  grep "ID:" | \
  awk '{print $2}' | \
  while read id; do
    npm run cli invoice:send $id
    sleep 2
  done
```

### JSON Output (Coming Soon)

```bash
npm run cli invoice:list --format=json | jq '.[] | select(.status == "OVERDUE")'
```

---

## Security Notes

- **Never commit backup files** to version control
- **Rotate user passwords** regularly
- **Limit CLI access** to admin users only
- **Use environment variables** for sensitive data
- **Audit CLI usage** with logs

---

## Getting Help

```bash
# Show all commands
npm run cli --help

# Show command-specific help
npm run cli invoice:list --help
```

For more help, see the [main documentation](../README.md) or open an issue.
