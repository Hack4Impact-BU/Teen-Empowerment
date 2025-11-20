/**
 * Teen Empowerment SMS Dashboard - Cloud Functions
 * 
 * Firebase Cloud Functions for handling SMS operations via Twilio.
 * These functions run on Google Cloud and handle:
 * - Bulk SMS sending with rate limiting
 * - Automatic opt-out detection via webhooks
 * - Phone number validation
 * 
 * @requires firebase-functions v5+
 * @requires firebase-admin
 * @requires twilio
 */

import { onRequest, onCall } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import twilio from 'twilio';

// ============================================================================
// INITIALIZATION
// ============================================================================

initializeApp();
const db = getFirestore();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Initialize Twilio client with credentials from environment
 * Lazy initialization prevents deployment errors when secrets aren't available
 */
function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN as Firebase Secrets.');
  }
  
  return twilio(accountSid, authToken);
}

/**
 * Validate phone number in E.164 format
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} True if valid E.164 format
 */
function isValidE164(phoneNumber) {
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phoneNumber);
}

/**
 * Delay execution for rate limiting
 * @param {number} ms - Milliseconds to delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Send Bulk SMS
 * 
 * Callable function that sends SMS messages to multiple contacts via Twilio.
 * Implements rate limiting, error handling, and status tracking.
 * 
 * @param {Object} request.data
 * @param {string} request.data.messageBody - The SMS message to send
 * @param {string[]} request.data.contactIds - Array of Firestore contact IDs
 * 
 * @returns {Object} Results object with success/failure counts
 * 
 * @example
 * const sendBulkSMS = httpsCallable(functions, 'sendBulkSMS');
 * const result = await sendBulkSMS({
 *   messageBody: 'Hello!',
 *   contactIds: ['contact1', 'contact2']
 * });
 */
export const sendBulkSMS = onCall({ 
  secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MESSAGING_SERVICE_SID'],
  region: 'us-east4',
  invoker: 'public'
}, async (request) => {
  // Verify user is authenticated
  if (!request.auth) {
    throw new Error('User must be authenticated');
  }

  const userId = request.auth.uid;
  const { messageBody, contactIds } = request.data;

  // Validate input
  if (!messageBody || typeof messageBody !== 'string' || messageBody.trim().length === 0) {
    throw new Error('Message body is required');
  }

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    throw new Error('At least one contact is required');
  }

  console.log(`[${userId}] Starting bulk send to ${contactIds.length} contacts`);

  // Fetch contacts from Firestore
  const contactsRef = db.collection('contacts');
  const contactPromises = contactIds.map(id => contactsRef.doc(id).get());
  const contactSnapshots = await Promise.all(contactPromises);

  const validContacts = [];
  const errors = [];

  // Validate and filter contacts
  for (const snap of contactSnapshots) {
    if (!snap.exists) {
      errors.push({ error: 'Contact not found', contactId: snap.id });
      continue;
    }

    const contact = snap.data();
    
    // Security check: user must own the contact
    if (contact.userId !== userId) {
      errors.push({ error: 'Unauthorized access', contactId: snap.id });
      continue;
    }

    // Skip opted-out contacts
    if (contact.optedOut) {
      errors.push({ error: 'Contact opted out', contactId: snap.id, phone: contact.phone });
      continue;
    }

    // Validate phone number format
    if (!isValidE164(contact.phone)) {
      errors.push({ error: 'Invalid phone format', contactId: snap.id, phone: contact.phone });
      continue;
    }

    validContacts.push({ id: snap.id, ...contact });
  }

  console.log(`[${userId}] Valid: ${validContacts.length}, Skipped: ${errors.length}`);

  // Initialize Twilio
  const twilioClient = getTwilioClient();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const rateLimitMps = parseInt(process.env.TWILIO_RATE_LIMIT_MPS || '1', 10);

  if (!messagingServiceSid) {
    throw new Error('TWILIO_MESSAGING_SERVICE_SID not configured');
  }

  // Send messages with rate limiting
  const results = [];
  const delayBetweenMessages = Math.ceil(1000 / rateLimitMps);

  for (let i = 0; i < validContacts.length; i++) {
    const contact = validContacts[i];
    
    try {
      // Send SMS via Twilio
      const message = await twilioClient.messages.create({
        body: messageBody,
        to: contact.phone,
        messagingServiceSid: messagingServiceSid,
      });

      results.push({
        success: true,
        contactId: contact.id,
        phone: contact.phone,
        messageSid: message.sid,
        status: message.status,
      });

      // Update contact with delivery status
      await contactsRef.doc(contact.id).update({
        lastMessageStatus: 'sent',
        lastMessageSid: message.sid,
        lastMessageAt: FieldValue.serverTimestamp(),
      });

      console.log(`[${userId}] Sent to ${contact.phone}: ${message.sid}`);

    } catch (error) {
      console.error(`[${userId}] Failed to send to ${contact.phone}:`, error.message);
      
      results.push({
        success: false,
        contactId: contact.id,
        phone: contact.phone,
        error: error.message,
        errorCode: error.code,
      });

      // Update contact with error status
      await contactsRef.doc(contact.id).update({
        lastMessageStatus: 'failed',
        lastMessageError: error.message,
        lastMessageAt: FieldValue.serverTimestamp(),
      });
    }

    // Rate limiting delay between messages
    if (i < validContacts.length - 1) {
      await delay(delayBetweenMessages);
    }
  }

  // Save campaign to messages collection
  const messagesRef = db.collection('messages');
  await messagesRef.add({
    userId,
    body: messageBody,
    recipientCount: validContacts.length,
    successCount: results.filter(r => r.success).length,
    failureCount: results.filter(r => !r.success).length,
    status: 'completed',
    sentAt: FieldValue.serverTimestamp(),
    results: results.map(r => ({
      contactId: r.contactId,
      success: r.success,
      messageSid: r.messageSid || null,
      error: r.error || null,
    })),
  });

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  
  console.log(`[${userId}] Bulk send completed. Success: ${successCount}, Failed: ${failureCount}`);

  return {
    success: true,
    totalSent: successCount,
    totalFailed: failureCount + errors.length,
    results,
    errors,
  };
});

/**
 * Handle Incoming SMS (Webhook)
 * 
 * HTTP endpoint that receives webhooks from Twilio when users reply to messages.
 * Automatically handles opt-out requests when OptOutType is "STOP".
 * 
 * Configure this URL in Twilio Messaging Service:
 * Integrations → Incoming Messages → Webhook URL
 * 
 * @param {Object} req.body.From - Sender's phone number
 * @param {Object} req.body.Body - Message text
 * @param {Object} req.body.OptOutType - Twilio's opt-out detection result
 * 
 * @returns {string} TwiML response
 */
export const handleIncomingSMS = onRequest({ 
  region: 'us-east4',
  invoker: 'public'
}, async (req, res) => {
  const { From, Body, OptOutType } = req.body;

  console.log(`Incoming SMS from ${From}: "${Body}", OptOutType: ${OptOutType}`);

  // Handle automatic opt-out detection
  if (OptOutType === 'STOP') {
    try {
      const contactsRef = db.collection('contacts');
      const querySnapshot = await contactsRef.where('phone', '==', From).get();

      if (!querySnapshot.empty) {
        // Update all matching contacts (could be in multiple user accounts)
        const updatePromises = querySnapshot.docs.map(doc =>
          doc.ref.update({
            optedOut: true,
            optedOutAt: FieldValue.serverTimestamp(),
            optOutMethod: 'auto_reply',
          })
        );
        
        await Promise.all(updatePromises);
        console.log(`Opted out ${From} (${querySnapshot.size} contact(s) updated)`);
      } else {
        console.log(`Contact not found for ${From}`);
      }
    } catch (error) {
      console.error('Error handling opt-out:', error);
    }
  }

  // Return TwiML response to Twilio
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thank you for your message.</Message>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

/**
 * Validate Phone Number
 * 
 * Callable function that validates phone number format.
 * Can be extended to use Twilio Lookup API for carrier/line type validation.
 * 
 * @param {Object} request.data
 * @param {string} request.data.phoneNumber - Phone number to validate
 * 
 * @returns {Object} Validation result
 */
export const validatePhoneNumber = onCall({ 
  region: 'us-east4',
  invoker: 'public'
}, async (request) => {
  if (!request.auth) {
    throw new Error('User must be authenticated');
  }

  const { phoneNumber } = request.data;

  if (!phoneNumber || typeof phoneNumber !== 'string') {
    throw new Error('Phone number is required');
  }

  const isValid = isValidE164(phoneNumber);

  return {
    isValid,
    phoneNumber,
    format: 'E.164',
    message: isValid 
      ? 'Valid phone number' 
      : 'Invalid format. Must be in E.164 format (e.g., +12125551234)',
  };
});
