# AWS API Gateway Session Auth (React + Node.js + Lambda Authorizer)

This project is a **full-stack example** showing how to secure APIs behind **AWS API Gateway** using a custom **Lambda Authorizer** and **DynamoDB-based sessions with sliding expiration**.

- **Frontend**: React (handles login/logout, stores HttpOnly cookie automatically)
- **Backend**: Node.js/Express (login/logout endpoints, manages sessions in DynamoDB)
- **Authorizer**: AWS Lambda (validates session tokens for protected routes)
- **Session Store**: DynamoDB with TTL (sessions expire on inactivity)

This setup gives you **server-controlled sessions** that expire after inactivity, unlike stateless JWTs.

---

## ✨ Features

- Login with username/password → creates session in DynamoDB  
- Session ID stored in HttpOnly cookie (or Authorization header)  
- **Lambda Authorizer** protects API Gateway routes  
- **Sliding expiration**: every valid request extends session lifetime  
- Session auto-deletes via DynamoDB TTL  
- Secure cookie handling with CORS & credentials support  

---

## 🏗️ Architecture
React Client ──> API Gateway (HTTP API)
│
├─> Lambda Authorizer (validates session)
│ │
│ └─> DynamoDB (sessions table, TTL)
│
└─> Node.js Backend (login/logout, APIs)


---

## 📂 Project Structure
├── backend/ # Express server (login/logout, profile API)
├── authorizer/ # Lambda function for API Gateway
└── frontend/ # React app

## ⚙️ Setup & Deployment

### 1. DynamoDB
- Create table `sessions`
  - Partition key: `sessionId` (String)
  - Attribute: `expiresAt` (Number, epoch seconds)
- Enable **TTL** on `expiresAt`

### 2. Lambda Authorizer
- Deploy `authorizer/index.js` as AWS Lambda (Node.js 18 runtime)
- Env vars:
```bash
    SESSIONS_TABLE=sessions
    INACTIVITY_SECONDS=1800
    AWS_REGION=us-east-1
```
- Attach IAM policy with DynamoDB access:
```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:UpdateItem",
    "dynamodb:PutItem",
    "dynamodb:DeleteItem"
  ],
  "Resource": "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/sessions"
}
```

3. API Gateway (HTTP API recommended)

- Create HTTP API
- Routes:
    POST /auth/login → Backend
    POST /auth/logout → Backend
    GET /api/profile → Backend (protected by authorizer)
- Attach Lambda authorizer to protected routes
- Enable CORS with credentials (Access-Control-Allow-Credentials: true)

4. Backend (Node.js/Express)
```bash
cd backend
npm install
npm start
```
Env vars (.env):
```bash
AWS_REGION=us-east-1
SESSIONS_TABLE=sessions
INACTIVITY_SECONDS=1800
SESSION_COOKIE_NAME=sid
NODE_ENV=development
PORT=3000
```
5. Frontend (React)
```bash
cd frontend
npm install
npm start
```
Env vars (.env):
```bash
REACT_APP_API_BASE=https://<your-api-id>.execute-api.<region>.amazonaws.com
```

🔑 Usage
- Start frontend & backend locally, or deploy backend to EC2/ECS/Fargate
- Go to React app in browser
- Login with test users:
- alice / password123
- bob / secret
- Try “Get Profile” → should return user info
- After inactivity (default 30 min), session expires automatically

🔒 Security Notes
- Use HTTPS (API Gateway gives you HTTPS by default)
- Cookies must be Secure + SameSite=None if cross-origin
- Disable authorizer caching (or set low TTL) to keep sliding expiration accurate
- Rotate demo users with a real DB or Cognito for production
