/**
 * Teen Empowerment SMS Dashboard
 * 
 * Main React application for managing SMS campaigns.
 * Handles authentication, contact management, CSV imports, and bulk messaging.
 * 
 * @author Teen Empowerment
 * @version 1.0.0
 */

import { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  deleteDoc, 
  doc, 
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

// ============================================================================
// FIREBASE INITIALIZATION
// ============================================================================

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'us-east4'); // Match deployed region

// ============================================================================
// UTILITY COMPONENTS
// ============================================================================

/**
 * Toast notification component
 * Displays temporary success/error messages
 */
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'bg-green-600' : 
                  type === 'error' ? 'bg-red-600' : 'bg-blue-600';

  return (
    <div className={`fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-md`}>
      <div className="flex items-center justify-between">
        <span>{message}</span>
        <button onClick={onClose} className="ml-4 text-white hover:text-gray-200">
          ✕
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  const closeToast = () => {
    setToast(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
      {user ? (
        <Dashboard user={user} showToast={showToast} />
      ) : (
        <AuthView showToast={showToast} />
      )}
    </>
  );
}

// ============================================================================
// AUTHENTICATION VIEW
// ============================================================================

function AuthView({ showToast }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Signed in successfully!', 'success');
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        showToast('Account created successfully!', 'success');
      }
    } catch (error) {
      console.error('Auth error:', error);
      showToast(error.message || 'Authentication failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">TEEN EMPOWERMENT</h1>
          <p className="text-gray-600">SMS Dashboard</p>
        </div>

        <div className="card">
          <h2 className="text-2xl font-bold mb-6 text-center">
            {isLogin ? 'Sign In' : 'Create Account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="admin@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline text-sm"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN DASHBOARD
// ============================================================================

function Dashboard({ user, showToast }) {
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMessageHistory, setShowMessageHistory] = useState(false);

  // Real-time contacts listener
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'contacts'),
      where('userId', '==', user.uid),
      orderBy('addedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contactsData = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      setContacts(contactsData);
    }, (error) => {
      console.error('Error fetching contacts:', error);
      showToast('Error loading contacts', 'error');
    });

    return () => unsubscribe();
  }, [user, showToast]);

  // Real-time messages listener
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'messages'),
      where('userId', '==', user.uid),
      orderBy('sentAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      setMessages(messagesData);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      showToast('Signed out successfully', 'success');
    } catch (error) {
      showToast('Error signing out', 'error');
    }
  };

  // Filter contacts by search query
  const filteredContacts = contacts.filter(contact => {
    const search = searchQuery.toLowerCase();
    return (
      contact.name.toLowerCase().includes(search) ||
      contact.phone.toLowerCase().includes(search)
    );
  });

  const activeContacts = contacts.filter(c => !c.optedOut);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-primary text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">TEEN EMPOWERMENT</h1>
              <p className="text-sm text-gray-200">SMS Dashboard</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm">{user.email}</span>
              <button onClick={handleSignOut} className="btn-secondary">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-600 mb-1">Total Contacts</h3>
            <p className="text-3xl font-bold text-primary">{contacts.length}</p>
          </div>
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-600 mb-1">Active Recipients</h3>
            <p className="text-3xl font-bold text-green-600">{activeContacts.length}</p>
          </div>
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-600 mb-1">Messages Sent</h3>
            <p className="text-3xl font-bold text-secondary">{messages.length}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Contacts Section */}
          <div className="lg:col-span-2">
            <ContactsSection
              contacts={filteredContacts}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onAddClick={() => setShowAddModal(true)}
              showToast={showToast}
              userId={user.uid}
            />
          </div>

          {/* Bulk Send Section */}
          <div className="space-y-6">
            <BulkSendCard
              activeContacts={activeContacts}
              showToast={showToast}
              userId={user.uid}
            />

            <div className="card">
              <button
                onClick={() => setShowMessageHistory(!showMessageHistory)}
                className="w-full btn-secondary"
              >
                {showMessageHistory ? 'Hide' : 'Show'} Message History
              </button>
            </div>
          </div>
        </div>

        {/* Message History */}
        {showMessageHistory && (
          <div className="mt-6">
            <MessageHistory messages={messages} />
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddContactModal
          onClose={() => setShowAddModal(false)}
          showToast={showToast}
          userId={user.uid}
        />
      )}
    </div>
  );
}

// ============================================================================
// CONTACTS SECTION
// ============================================================================

function ContactsSection({ contacts, searchQuery, setSearchQuery, onAddClick, showToast, userId }) {
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const handleOptOut = async (contactId, contactName) => {
    if (!confirm(`Mark ${contactName} as opted out?`)) return;

    try {
      await updateDoc(doc(db, 'contacts', contactId), {
        optedOut: true,
        optedOutAt: serverTimestamp(),
        optOutMethod: 'manual',
      });
      showToast(`${contactName} has been opted out`, 'success');
    } catch (error) {
      console.error('Error opting out:', error);
      showToast('Error opting out contact', 'error');
    }
  };

  const handleDelete = async (contactId, contactName) => {
    if (!confirm(`Delete ${contactName}? This cannot be undone.`)) return;

    try {
      await deleteDoc(doc(db, 'contacts', contactId));
      showToast(`${contactName} deleted`, 'success');
    } catch (error) {
      console.error('Error deleting:', error);
      showToast('Error deleting contact', 'error');
    }
  };

  const handleCSVUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setImporting(true);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        showToast('CSV file is empty or invalid', 'error');
        setImporting(false);
        return;
      }

      // Parse header row
      const header = lines[0].toLowerCase().split(',').map(h => h.trim());
      const nameIndex = header.indexOf('name');
      const phoneIndex = header.indexOf('phone');

      if (nameIndex === -1 || phoneIndex === -1) {
        showToast('CSV must have "name" and "phone" columns', 'error');
        setImporting(false);
        return;
      }

      // Parse contacts
      const parsedContacts = [];
      const errors = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const name = values[nameIndex];
        let phone = values[phoneIndex];

        if (!name || !phone) {
          errors.push(`Row ${i + 1}: Missing name or phone`);
          continue;
        }

        // Auto-add country code if missing
        try {
          if (!phone.startsWith('+')) {
            phone = '+1' + phone.replace(/\D/g, '');
          }

          if (!isValidPhoneNumber(phone)) {
            errors.push(`Row ${i + 1}: Invalid phone number ${phone}`);
            continue;
          }

          const parsed = parsePhoneNumber(phone);
          parsedContacts.push({
            name,
            phone: parsed.number,
          });
        } catch (error) {
          errors.push(`Row ${i + 1}: Invalid phone format ${phone}`);
        }
      }

      if (parsedContacts.length === 0) {
        showToast('No valid contacts found in CSV', 'error');
        setImporting(false);
        return;
      }

      // Confirm import
      const confirmMsg = `Import ${parsedContacts.length} contacts?${errors.length > 0 ? ` (${errors.length} errors)` : ''}`;
      if (!confirm(confirmMsg)) {
        setImporting(false);
        return;
      }

      // Add to Firestore
      const contactsRef = collection(db, 'contacts');
      let successCount = 0;

      for (const contact of parsedContacts) {
        try {
          await addDoc(contactsRef, {
            userId,
            name: contact.name,
            phone: contact.phone,
            optedOut: false,
            addedAt: serverTimestamp(),
          });
          successCount++;
        } catch (error) {
          console.error('Error adding contact:', error);
          errors.push(`Failed to add ${contact.name}`);
        }
      }

      showToast(
        `Imported ${successCount} contacts${errors.length > 0 ? ` (${errors.length} failed)` : ''}`,
        'success'
      );

      if (errors.length > 0) {
        console.log('Import errors:', errors);
      }
    } catch (error) {
      console.error('CSV import error:', error);
      showToast('Error importing CSV file', 'error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Contacts</h2>
        <div className="flex gap-2">
          <button onClick={onAddClick} className="btn-primary">
            + Add Contact
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="btn-secondary disabled:opacity-50"
          >
            {importing ? 'Importing...' : '📤 Import CSV'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCSVUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-field"
        />
      </div>

      {/* Contacts Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Last Message</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {contacts.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                  No contacts yet. Add your first contact or import from CSV.
                </td>
              </tr>
            ) : (
              contacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{contact.name}</td>
                  <td className="px-4 py-3 font-mono text-sm">{contact.phone}</td>
                  <td className="px-4 py-3">
                    {contact.optedOut ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                        Opted Out
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {contact.lastMessageStatus ? (
                      <span className={contact.lastMessageStatus === 'sent' ? 'text-green-600' : 'text-red-600'}>
                        {contact.lastMessageStatus}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {!contact.optedOut && (
                        <button
                          onClick={() => handleOptOut(contact.id, contact.name)}
                          className="text-xs text-orange-600 hover:text-orange-800 font-semibold"
                        >
                          Opt Out
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(contact.id, contact.name)}
                        className="text-xs text-red-600 hover:text-red-800 font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// ADD CONTACT MODAL
// ============================================================================

function AddContactModal({ onClose, showToast, userId }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim() || !phone.trim()) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    let formattedPhone = phone.trim();
    
    try {
      // Auto-add country code if missing
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+1' + formattedPhone.replace(/\D/g, '');
      }

      if (!isValidPhoneNumber(formattedPhone)) {
        showToast('Invalid phone number. Use E.164 format (e.g., +12125551234)', 'error');
        return;
      }

      const parsed = parsePhoneNumber(formattedPhone);
      formattedPhone = parsed.number;

    } catch (error) {
      showToast('Invalid phone number format', 'error');
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, 'contacts'), {
        userId,
        name: name.trim(),
        phone: formattedPhone,
        optedOut: false,
        addedAt: serverTimestamp(),
      });

      showToast('Contact added successfully!', 'success');
      onClose();
    } catch (error) {
      console.error('Error adding contact:', error);
      showToast('Error adding contact', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold mb-4">Add New Contact</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="John Doe"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-field"
              placeholder="+12125551234"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Use E.164 format: +[country code][number]</p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 btn-primary disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Contact'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// BULK SEND CARD
// ============================================================================

function BulkSendCard({ activeContacts, showToast, userId }) {
  const [messageBody, setMessageBody] = useState('');
  const [sending, setSending] = useState(false);

  const handleBulkSend = async () => {
    if (!messageBody.trim()) {
      showToast('Please enter a message', 'error');
      return;
    }

    if (activeContacts.length === 0) {
      showToast('No active contacts to send to', 'error');
      return;
    }

    const confirmMsg = `Send message to ${activeContacts.length} contacts?`;
    if (!confirm(confirmMsg)) return;

    setSending(true);

    // Warn user not to close browser
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Bulk send in progress. Are you sure you want to leave?';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    try {
      const sendBulkSMS = httpsCallable(functions, 'sendBulkSMS');
      
      const result = await sendBulkSMS({
        messageBody: messageBody.trim(),
        contactIds: activeContacts.map(c => c.id),
      });

      const data = result.data;
      
      showToast(
        `Sent to ${data.totalSent} contacts${data.totalFailed > 0 ? `, ${data.totalFailed} failed` : ''}`,
        data.totalFailed > 0 ? 'error' : 'success'
      );

      if (data.totalFailed === 0) {
        setMessageBody('');
      }

      console.log('Bulk send results:', data);

    } catch (error) {
      console.error('Bulk send error:', error);
      showToast(error.message || 'Error sending messages', 'error');
    } finally {
      setSending(false);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  };

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">Send Bulk SMS</h2>

      <div className="mb-4">
        <label className="block text-sm font-semibold mb-2">Message</label>
        <textarea
          value={messageBody}
          onChange={(e) => setMessageBody(e.target.value)}
          className="input-field min-h-[120px]"
          placeholder="Enter your message here..."
          disabled={sending}
          maxLength={1600}
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Max 1600 characters</span>
          <span>{messageBody.length} / 1600</span>
        </div>
      </div>

      <div className="mb-4 p-3 bg-gray-50 rounded">
        <div className="text-sm font-semibold text-gray-700">Total Recipients</div>
        <div className="text-2xl font-bold text-primary">{activeContacts.length}</div>
      </div>

      {sending && (
        <div className="mb-4">
          <div className="text-sm font-semibold mb-2">
            Sending... Please do not close this window
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-primary h-2 rounded-full transition-all duration-300 w-full" />
          </div>
        </div>
      )}

      <button
        onClick={handleBulkSend}
        disabled={sending || activeContacts.length === 0 || !messageBody.trim()}
        className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? 'Sending...' : `Send to ${activeContacts.length} Recipients`}
      </button>
    </div>
  );
}

// ============================================================================
// MESSAGE HISTORY
// ============================================================================

function MessageHistory({ messages }) {
  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">Message History</h2>

      {messages.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No messages sent yet</p>
      ) : (
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <p className="text-sm text-gray-600">
                    {message.sentAt?.toDate ? message.sentAt.toDate().toLocaleString() : 'Just now'}
                  </p>
                  <p className="text-sm font-semibold mt-1">
                    Recipients: {message.recipientCount} | 
                    Success: <span className="text-green-600">{message.successCount || 0}</span> | 
                    Failed: <span className="text-red-600">{message.failureCount || 0}</span>
                  </p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                  message.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {message.status}
                </span>
              </div>
              <p className="text-gray-700 text-sm bg-gray-50 p-3 rounded">{message.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
