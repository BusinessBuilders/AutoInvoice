# AutoInvoice - Project Overview

## Purpose
AutoInvoice is an **AI-powered invoice automation platform** designed to streamline invoice creation and expense management through multiple input channels (voice, Telegram, web, mobile). The platform leverages AI for natural language processing, OCR receipt scanning, and intelligent data extraction.

## Key Mission
Enable users to create professional invoices and manage expenses through:
- Natural language voice commands
- Telegram bot interactions
- Receipt photo scanning with OCR
- Traditional web dashboard
- Mobile app (React Native)

## Core Value Proposition
- **Multi-channel input**: Voice, chat, photo, web, mobile
- **AI-powered**: GPT-4 Vision for OCR, Whisper for voice, GPT-4 for NLP
- **Production-ready**: Database-first architecture with PostgreSQL
- **Type-safe**: Full TypeScript stack with tRPC for end-to-end type safety
- **Scalable**: Built on modern cloud-native patterns

## Key Features

### ✅ Implemented
- Multi-channel invoice creation (natural language, voice, Telegram, web, mobile)
- Customer management with profiles, nicknames, locations, custom pricing
- Invoice management with automatic numbering, line items, tax/discount calculation, status tracking, PDF generation
- Receipt processing with AI OCR extraction, automatic categorization, item-level parsing
- Background job queue system (PDF generation, email sending, OCR processing, payment reminders, database backups)

### 🔄 In Progress
- Telegram bot integration (framework ready)
- Google Workspace integration (OAuth configured)
- Email invoice delivery (queue system ready)
- Payment reminder automation (scheduler configured)
- Voice message processing (Whisper integrated)

## Target Users
Small business owners, freelancers, contractors who need quick invoice generation and expense tracking without complex accounting software.
