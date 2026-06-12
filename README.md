<div align="center">

# 🛒 AI Smart Inventory Management System

**A full-stack MERN application that digitises inventory, GST billing, customer credit and business intelligence for small & medium retail businesses.**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?logo=tailwindcss&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose_9-47A248?logo=mongodb&logoColor=white)
![Google Gemini](https://img.shields.io/badge/AI-Google_Gemini-8E75B2?logo=googlegemini&logoColor=white)

</div>

---

## 📖 Overview

Most small retailers — kirana stores, traders and wholesalers — still run on paper registers, manual bill calculation and physical credit (*khata*) books. This leads to stock errors, GST mistakes, lost credit records and zero business insight.

**AI Smart Inventory Management System** replaces all of that with a single web application covering the complete retail workflow: **stock in → sell → bill → collect → analyse**. Every sale automatically updates stock, generates a GST invoice, records the payment and — for credit sales — updates the customer's ledger, while accumulated data powers forecasting, alerts and an AI assistant.

---

## ✨ Key Features

### 📦 Inventory & Products
- Product catalogue with categories, pricing, GST rate and **unit of measure** (pcs / kg / g / litre)
- Real-time stock levels updated on every sale and purchase
- Configurable **reorder thresholds** with low-stock detection
- **Stock-adjustment (shrinkage)** tracking — damage, theft, expiry, counting errors

### 🧾 Quick Sale & GST Billing
- Fast point-of-sale billing built for a real shop counter
- **Amount-first mode** — "₹50 of sugar" → quantity is back-calculated
- **Weight & tare** support for items sold by weight
- Automatic **CGST / SGST / IGST** computation (intra- vs inter-state)
- Server-generated **PDF invoices** (PDFKit) + a **UPI "Scan-to-Pay" QR code**
- High-precision money math using **Decimal128** (no floating-point errors) and **atomic, gap-free invoice numbering**

### 📒 Digital Khata (Customer Credit)
- Digital replacement for the paper credit ledger
- Every credit sale posts to the customer's ledger with a running balance
- Full / partial repayments tracked with permanent, timestamped history

### 🤖 Intelligence
- **Demand forecasting & reorder suggestions** computed from sales history (velocity, days-to-stockout, dead-stock, top performers)
- **AI help assistant** powered by the **Google Gemini API**, with a built-in rule-based fallback when the AI service is unavailable
- **OCR bill scanning** — photograph a supplier bill and auto-extract items using **Gemini Vision**, with **Tesseract.js** as a fallback

### 📊 Analytics, Reports & Automation
- Dashboard KPIs, sales trends and category breakdowns (Recharts)
- **Scheduled cron jobs** for periodic report generation and smart stock alerts
- **Tally-compatible export** for accountants
- **Multi-language** UI (i18next) and a guided **onboarding wizard**

---

## 🧱 Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 19, Vite, Tailwind CSS, React Router, Recharts, i18next, Axios, Context API |
| **Backend** | Node.js, Express 5, REST API (`/api/v1`) |
| **Database** | MongoDB + Mongoose 9 (Decimal128 for money) |
| **Auth & Security** | JWT, bcryptjs, Zod validation, express-rate-limit |
| **AI / OCR** | Google Gemini API (assistant + Gemini Vision), Tesseract.js (OCR fallback) |
| **Documents** | PDFKit (invoices), qrcode / qrcode.react (UPI QR) |
| **Automation** | node-cron (reports & alerts), Multer (uploads) |

---

## 🏗️ Architecture

A classic **three-tier architecture**:

```
┌──────────────────┐   REST API    ┌──────────────────┐   Mongoose ODM   ┌──────────────┐
│  Presentation     │  (JSON/Axios) │  Application      │                  │  Data         │
│  React + Vite +   │ ────────────▶ │  Node + Express 5 │ ───────────────▶ │  MongoDB      │
│  Tailwind CSS     │ ◀──────────── │  controllers →    │ ◀─────────────── │  collections  │
│                   │               │  services         │                  │               │
└──────────────────┘               └──────────────────┘                  └──────────────┘
```

Every request flows through: **JWT auth middleware → Zod validation → controller → service → MongoDB**, with central error handling.

> 📐 Detailed architecture, module, data-flow and ER diagrams are in [`Assignment Document/`](./Assignment%20Document/) (project report).

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+ and npm
- **MongoDB** running locally (default `mongodb://127.0.0.1:27017`) or a MongoDB Atlas connection string
- *(Optional)* a **Google Gemini API key** for the AI assistant & OCR features

### 1. Clone
```bash
git clone https://github.com/ajaysinh1901/ai-smart-inventory-management-system.git
cd ai-smart-inventory-management-system
```

### 2. Backend setup
```bash
cd server
npm install
cp .env.example .env      # then edit .env with your values
npm start                 # runs on http://localhost:5000
```

`server/.env`:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/MERNDB
JWT_SECRET=replace-with-a-long-random-string-min-32-chars
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
GEMINI_API_KEY=your-google-gemini-api-key-here   # optional
```

### 3. Frontend setup
```bash
cd ../client
npm install
cp .env.example .env       # VITE_API_URL=http://localhost:5000/api/v1
npm run dev                # runs on http://localhost:5173
```

### 4. (Optional) Seed demo data
```bash
cd ../server
npm run seed:demo
```

Open **http://localhost:5173** and sign up to begin.

---

## 📂 Project Structure

```
.
├── client/                     # React 19 + Vite frontend
│   └── src/
│       ├── pages/              # Dashboard, Inventory, QuickSale, Khata, AI Insights, Analytics, Scanner…
│       ├── components/         # UI library, sale widgets, onboarding wizard
│       ├── context/            # Auth, Theme, Toast, Onboarding (Context API)
│       ├── services/           # Axios API clients
│       └── hooks/              # Custom data hooks
├── server/                     # Node + Express 5 REST API
│   └── src/
│       ├── models/             # Mongoose schemas
│       ├── controllers/        # HTTP layer
│       ├── services/           # OCR, PDF, Tally, Khata, AI logic
│       ├── routes/v1/          # 17 modular route groups
│       ├── middlewares/        # auth (JWT), validate (Zod), rateLimiter, error
│       ├── validators/         # Zod schemas
│       ├── crons/              # reportGenerator, smartAlerts
│       └── migrations/         # seed scripts
├── Assignment Document/        # Project report (.docx/.pdf) + diagrams
└── presentation/               # Viva slide deck
```

### Core data models
`User` · `Settings` · `Product` · `Sale` · `Transaction` · `StockAdjustment` · `Customer` · `KhataEntry` · `Supplier` · `Alert` · `Counter`

### API route groups (`/api/v1`)
`auth` · `users` · `products` · `suppliers` · `transactions` · `ai` · `ocr` · `analytics` · `sales` · `settings` · `alerts` · `customers` · `khata` · `workspace` · `reports` · `sample-packs` · `stock-adjustments`

---

## 🔐 Security & Reliability
- **JWT** authentication with **bcrypt**-hashed passwords; protected routes on API and UI
- **Zod** schema validation on every endpoint via a central middleware
- **express-rate-limit** against brute-force / abuse
- **Decimal128** for all currency & weight values — exact GST and totals
- Central error middleware (server) + React error boundaries & toasts (client)

---

## 🗺️ Roadmap
- Mobile app (React Native / PWA)
- WhatsApp / SMS invoices & payment reminders
- Barcode scanning at the counter
- Multi-store / multi-user workspaces with roles
- Offline-first mode with background sync

---

## 📄 License

This project was developed as an academic project. Add a license of your choice (e.g. MIT) if you intend to open-source it.

---

## 🎓 Acknowledgement

Developed as a **Master of Computer Applications (MCA – Semester II)** project at **R.B. Institute of Management Studies (RBIMS)**, affiliated with **Gujarat Technological University (GTU)**, Ahmedabad — Academic Year 2025–26.

<div align="center">
<sub>Built with the MERN stack ❤️</sub>
</div>
