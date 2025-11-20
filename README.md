# Teen Empowerment SMS Dashboard

A professional SMS management dashboard for bulk messaging via Twilio. Built for Teen Empowerment to manage outreach campaigns with compliance features.

## Features

- **Secure Authentication** - Firebase Auth with multi-user support
- **Contact Management** - Add, import (CSV), search, and manage contacts
- **Bulk SMS** - Send messages to multiple contacts with rate limiting
- **Compliance** - Automatic opt-out handling via Twilio webhooks
- **Message History** - Track all campaigns with success/failure rates
- **Phone Validation** - E.164 format validation
- **Security** - Firestore row-level security, secure credential storage

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: Firebase Cloud Functions (Node.js 20)
- **Database**: Cloud Firestore
- **Auth**: Firebase Authentication
- **SMS**: Twilio Programmable Messaging

---

## Prerequisites

- Node.js 18+ and npm
- [Firebase account](https://firebase.google.com/) (free tier works)
- [Twilio account](https://www.twilio.com/try-twilio) with:
  - Account SID and Auth Token
  - A Twilio phone number or Messaging Service
  - For production: upgraded account (trial accounts can only send to verified numbers)

---

## Quick Setup (10 minutes)

### 1. Install Dependencies

```bash
npm install
cd functions && npm install && cd ..
```

### 2. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable these services:
   - **Authentication** → Email/Password provider
   - **Firestore Database** → Production mode
   - **Cloud Functions** (requires Blaze plan - pay-as-you-go)

### 3. Get Firebase Configuration

1. Firebase Console → Project Settings → General
2. Scroll to "Your apps" → Web app
3. Copy the `firebaseConfig` values

### 4. Create Environment File

Create `.env` in project root:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# Twilio (these are stored as Firebase Secrets, not needed locally)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_MESSAGING_SERVICE_SID=MGxxxxx
TWILIO_RATE_LIMIT_MPS=1
```

### 5. Configure Twilio

1. **Create Messaging Service:**
   - Twilio Console → Messaging → Services
   - Click "Create Messaging Service"
   - Name: "Teen Empowerment SMS"
   - Use Case: "Notifications, Outbound Only"

2. **Add Phone Number:**
   - In your Messaging Service → Senders
   - Add your Twilio phone number

3. **Enable Advanced Opt-Out:**
   - Scroll to "Opt-Out Management"
   - Click "Enable Advanced Opt-Out"
   - Configure opt-out messages (optional)

### 6. Deploy to Firebase

```bash
# Login to Firebase
firebase login

# Initialize project
firebase init
# Select: Firestore, Functions, Hosting
# Use all defaults

# Update project ID in .firebaserc
# Change "your-project-id" to your actual Firebase project ID

# Set Twilio secrets for Cloud Functions
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_MESSAGING_SERVICE_SID

# Deploy everything
firebase deploy
```

### 7. Grant Cloud Functions Permissions

After deploying, grant Firestore access:

1. Go to [Google Cloud Console IAM](https://console.cloud.google.com/iam-admin/iam)
2. Find: `{PROJECT_NUMBER}-compute@developer.gserviceaccount.com`
3. Edit → Add Role: **"Cloud Datastore User"**
4. Save

### 8. Configure Webhook (for automatic opt-outs)

After functions deploy, you'll see a URL like:
```
https://handleincomingsms-xxxxx-uk.a.run.app
```

1. Twilio Console → Messaging → Services → Your Service
2. Integrations → Incoming Messages
3. Webhook URL: Paste your `handleIncomingSMS` function URL
4. Method: POST
5. Save

### 9. Set Functions to Allow Public Access

1. Go to [Cloud Run Console](https://console.cloud.google.com/run)
2. Click on `sendBulkSMS`
3. Security tab → Select "Allow public access"
4. Save
5. Repeat for `validatePhoneNumber`

---

## Development

### Run Locally

```bash
npm run dev
```

Visit `http://localhost:3000`

### Deploy Changes

```bash
# Frontend only
npm run build
firebase deploy --only hosting

# Functions only
firebase deploy --only functions

# Everything
npm run build
firebase deploy
```

### View Logs

```bash
firebase functions:log
```

---

## Usage

### Add Contacts

**Single Contact:**
1. Click "+ Add Contact"
2. Enter name and phone (E.164 format: +12125551234)

**CSV Import:**
1. Prepare CSV with columns: `name,phone`
2. Click "📤 Import CSV"
3. Select file and confirm

### Send Bulk SMS

1. Type message in "Send Bulk SMS" section
2. Review recipient count (excludes opted-out contacts)
3. Click "Send to X Recipients"
4. Wait for completion

### Handle Opt-Outs

**Automatic:** Users reply "STOP" → automatically opted out via webhook

**Manual:** Click "Opt Out" button next to any contact

---

## Project Structure

```
te_sms/
├── src/
│   ├── App.jsx              # Main React application
│   ├── main.jsx             # React entry point
│   └── index.css            # Tailwind styles
│
├── functions/
│   ├── index.js             # Cloud Functions (Twilio integration)
│   └── package.json         # Functions dependencies
│
├── firebase.json            # Firebase configuration
├── firestore.rules          # Database security rules
├── firestore.indexes.json   # Database indexes
├── .env                     # Environment variables (you create this)
├── package.json             # Frontend dependencies
└── README.md                # This file
```

---

## Configuration Files

### Firebase Configuration (`firebase.json`)

```json
{
  "hosting": {
    "public": "dist",
    "rewrites": [{"source": "**", "destination": "/index.html"}]
  },
  "functions": [{
    "source": "functions",
    "runtime": "nodejs20",
    "region": "us-east4"
  }],
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

### Firestore Security Rules (`firestore.rules`)

Users can only access their own data:
- Contacts: filtered by `userId`
- Messages: filtered by `userId`

### Environment Variables

**Frontend** (`.env`):
- `VITE_*` variables - loaded by Vite during build
- Safe to expose in client-side code

**Backend** (Firebase Secrets):
- Twilio credentials stored securely
- Never exposed to client-side

---

## Troubleshooting

### Messages Not Sending

**CORS Errors:**
- Ensure functions have "Allow public access" in Cloud Run
- Verify region is set to `us-east4` in App.jsx

**Permission Errors:**
- Grant "Cloud Datastore User" role to compute service account
- Check IAM settings in Google Cloud Console

**Twilio Errors:**
- Verify Messaging Service SID is correct
- Check Twilio account has sufficient balance
- Trial accounts: verify recipient phone numbers in Twilio Console

### CSV Import Fails

- Ensure CSV has headers: `name,phone`
- Phone numbers must be in E.164 format: `+12125551234`
- Check browser console for detailed errors

### Contacts Not Appearing

- Wait 2-3 minutes for Firestore indexes to build
- Check index status: Firebase Console → Firestore → Indexes
- Hard refresh browser (Cmd+Shift+R or Ctrl+Shift+R)

### Function Deployment Fails

- Ensure billing is enabled (Blaze plan required)
- Grant necessary IAM permissions
- Check Cloud Build logs for detailed errors

---

## Cost Estimates

### Development/Testing (Free Tier)
- **Firebase**: $0/month (within quotas)
- **Twilio**: ~$1/month (phone number only)

### Production (1,000 messages/month)
- **Firebase**: $0-5/month
- **Twilio**: ~$9/month
  - Phone number: $1/month
  - SMS: 1,000 × $0.0079 = $7.90/month

### Scaling (10,000 messages/month)
- **Firebase**: ~$5-10/month
- **Twilio**: ~$80/month

---

## Security Best Practices

1. ✅ Never commit `.env` to version control (in `.gitignore`)
2. ✅ Rotate Twilio credentials every 90 days
3. ✅ Enable 2FA on Firebase and Twilio accounts
4. ✅ Review Firestore security rules regularly
5. ✅ Monitor usage in Firebase and Twilio consoles
6. ✅ Set up billing alerts to avoid unexpected charges

---

## Compliance & Legal

### TCPA Compliance
- Only send to users who opted in
- Honor opt-out requests immediately
- Include opt-out instructions in first message
- Keep records of consent

### Best Practices
- Send during reasonable hours (9 AM - 9 PM local time)
- Keep messages relevant and valuable
- Don't use multiple numbers to circumvent rate limits
- Follow Twilio's [Messaging Policy](https://www.twilio.com/legal/aup)

---

## Support & Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Twilio Messaging Docs](https://www.twilio.com/docs/messaging)
- [React Documentation](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/docs)

---



## Contributing

For questions or issues, contact the development team.
