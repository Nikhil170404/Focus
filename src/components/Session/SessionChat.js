import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { FiSend, FiSmile, FiMoreVertical } from 'react-icons/fi';

function SessionChat({ sessionId, userId, userName, partnerId, partnerName }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showQuickMessages, setShowQuickMessages] = useState(true);
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (sessionId && sessionId !== 'demo') {
      setupRealTimeChat();
    } else {
      // Setup demo messages for offline mode
      setupDemoMessages();
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [sessionId, userId]);

  const setupRealTimeChat = () => {
    try {
      const messagesQuery = query(
        collection(db, 'chats', sessionId, 'messages'),
        orderBy('timestamp', 'asc')
      );

      unsubscribeRef.current = onSnapshot(messagesQuery, (snapshot) => {
        const messagesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMessages(messagesData);
      }, (error) => {
        console.error('Error listening to messages:', error);
        // Fallback to demo mode if Firebase fails
        setupDemoMessages();
      });

      // Add welcome message for new chats
      if (messages.length === 0) {
        addSystemMessage("Welcome to your focus session! 🎯 Use this chat to communicate with your partner.");
      }
    } catch (error) {
      console.error('Error setting up real-time chat:', error);
      setupDemoMessages();
    }
  };

  const setupDemoMessages = () => {
    const demoMessages = [
      { 
        id: 'demo-1', 
        text: "Welcome to your focus session! 🎯", 
        userId: 'system', 
        userName: 'FocusMate', 
        timestamp: new Date(),
        type: 'system'
      },
      { 
        id: 'demo-2', 
        text: "Stay focused and make the most of this time!", 
        userId: 'system', 
        userName: 'FocusMate', 
        timestamp: new Date(),
        type: 'system'
      }
    ];
    setMessages(demoMessages);

    // Simulate partner joining in demo mode
    setTimeout(() => {
      if (partnerName) {
        addDemoMessage(`${partnerName} joined the session`, 'system');
      }
    }, 2000);
  };

  const addSystemMessage = async (text) => {
    const systemMessage = {
      text: text,
      userId: 'system',
      userName: 'FocusMate',
      timestamp: serverTimestamp(),
      type: 'system'
    };

    try {
      await addDoc(collection(db, 'chats', sessionId, 'messages'), systemMessage);
    } catch (error) {
      console.error('Error adding system message:', error);
    }
  };

  const addDemoMessage = (text, type = 'partner') => {
    const message = {
      id: Date.now() + Math.random(),
      text: text,
      userId: type === 'system' ? 'system' : (partnerId || 'partner'),
      userName: type === 'system' ? 'FocusMate' : (partnerName || 'Focus Partner'),
      timestamp: new Date(),
      type: type
    };
    
    setMessages(prev => [...prev, message]);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const messageData = {
      text: newMessage.trim(),
      userId: userId,
      userName: userName,
      timestamp: serverTimestamp(),
      type: 'user'
    };

    try {
      if (sessionId && sessionId !== 'demo') {
        // Send to Firebase
        await addDoc(collection(db, 'chats', sessionId, 'messages'), messageData);
      } else {
        // Demo mode - add message locally
        const localMessage = {
          ...messageData,
          id: Date.now(),
          timestamp: new Date()
        };
        setMessages(prev => [...prev, localMessage]);

        // Simulate partner response in demo mode
        simulatePartnerResponse();
      }

      setNewMessage('');
      setShowQuickMessages(false);
      
      // Focus back on input
      chatInputRef.current?.focus();
    } catch (error) {
      console.error('Error sending message:', error);
      // Fallback to local message
      const localMessage = {
        ...messageData,
        id: Date.now(),
        timestamp: new Date()
      };
      setMessages(prev => [...prev, localMessage]);
      setNewMessage('');
    }
  };

  const simulatePartnerResponse = () => {
    if (Math.random() > 0.5) { // 50% chance for partner to respond
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const responses = [
          "Great point!",
          "Thanks for sharing!",
          "Keep it up! 👍",
          "That sounds productive!",
          "Nice work!",
          "I'm focused too!",
          "Good luck with that!",
          "You've got this! 🚀",
          "Same here!",
          "Let's stay focused! 💪"
        ];
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        addDemoMessage(randomResponse);
      }, 1000 + Math.random() * 2000);
    }
  };

  const formatTime = (timestamp) => {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true
    });
  };

  const getMessageIcon = (type) => {
    switch (type) {
      case 'system':
        return '🤖';
      case 'partner':
        return '👤';
      default:
        return '💭';
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  const quickMessages = [
    "👍 Good luck!",
    "🎯 Stay focused!",
    "☕ Taking a break",
    "✅ Task completed!",
    "💪 Keep going!",
    "🔥 On fire today!",
    "📝 Taking notes",
    "🎉 Great progress!"
  ];

  const sendQuickMessage = (messageText) => {
    setNewMessage(messageText);
    setTimeout(() => {
      sendMessage({ preventDefault: () => {} });
    }, 100);
  };

  const toggleQuickMessages = () => {
    setShowQuickMessages(!showQuickMessages);
  };

  return (
    <div className="chat-widget">
      <div className="chat-header">
        <div className="chat-title">
          <h4>Session Chat</h4>
          <span className="online-indicator">
            <span className="pulse"></span>
            {partnerId ? 'Partner Online' : 'Demo Mode'}
          </span>
        </div>
        {isMobile && (
          <button 
            className="chat-menu-btn"
            onClick={toggleQuickMessages}
            aria-label="Toggle quick messages"
          >
            <FiMoreVertical size={16} />
          </button>
        )}
      </div>
      
      <div className="chat-messages">
        {messages.map(msg => (
          <div 
            key={msg.id} 
            className={`message ${msg.userId === userId ? 'own' : ''} ${msg.type || 'user'}`}
          >
            <div className="message-avatar">
              {msg.type === 'system' ? '🤖' : 
               msg.userId === userId ? 
                 (userName?.charAt(0).toUpperCase() || '👤') : 
                 (partnerName?.charAt(0).toUpperCase() || '👥')}
            </div>
            <div className="message-content">
              <div className="message-header">
                <span className="message-sender">{msg.userName}</span>
                <span className="message-time">{formatTime(msg.timestamp)}</span>
              </div>
              <div className="message-bubble">
                <div className="message-text">{msg.text}</div>
              </div>
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="message typing-indicator">
            <div className="message-avatar">👥</div>
            <div className="message-content">
              <div className="message-bubble typing">
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span className="typing-text">Partner is typing...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Quick Messages */}
      {showQuickMessages && (
        <div className="quick-messages">
          <div className="quick-messages-header">
            <span>Quick Messages</span>
            {isMobile && (
              <button 
                className="close-quick-messages"
                onClick={() => setShowQuickMessages(false)}
              >
                ×
              </button>
            )}
          </div>
          <div className="quick-messages-grid">
            {quickMessages.map((message, index) => (
              <button
                key={index}
                className="quick-message-btn"
                onClick={() => sendQuickMessage(message)}
                title={`Send: ${message}`}
              >
                {message}
              </button>
            ))}
          </div>
        </div>
      )}
      
      <form onSubmit={sendMessage} className="chat-form">
        <div className="chat-input-container">
          <textarea
            ref={chatInputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isMobile ? "Type a message..." : "Type a message... (Enter to send)"}
            className="chat-input"
            rows={isMobile ? 1 : 1}
            maxLength={500}
          />
          <div className="chat-input-actions">
            {!isMobile && (
              <button 
                type="button"
                className="emoji-button"
                onClick={toggleQuickMessages}
                title="Quick messages"
              >
                <FiSmile size={16} />
              </button>
            )}
            <button 
              type="submit" 
              className={`send-button ${newMessage.trim() ? 'active' : ''}`}
              disabled={!newMessage.trim()}
              title="Send message"
            >
              <FiSend size={16} />
            </button>
          </div>
        </div>
        <div className="chat-footer">
          <span className="char-count">
            {newMessage.length}/500
          </span>
          <span className="chat-tip">
            💡 {isMobile ? 'Stay focused & encourage each other' : 'Keep messages focused and encouraging'}
          </span>
        </div>
      </form>
    </div>
  );
}

export default SessionChat;