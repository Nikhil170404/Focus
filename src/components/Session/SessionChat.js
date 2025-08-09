import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { FiSend, FiSmile, FiMoreVertical } from 'react-icons/fi';
import toast from 'react-hot-toast';

function SessionChat({ sessionId, userId, userName, partnerId, partnerName }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showQuickMessages, setShowQuickMessages] = useState(true);
  const [loading, setLoading] = useState(true);
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
    if (sessionId && userId) {
      setupRealTimeChat();
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [sessionId, userId]);

  const setupRealTimeChat = () => {
    try {
      setLoading(true);
      
      const messagesQuery = query(
        collection(db, 'chats', sessionId, 'messages'),
        orderBy('timestamp', 'asc')
      );

      unsubscribeRef.current = onSnapshot(messagesQuery, (snapshot) => {
        const messagesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate() || new Date()
        }));
        
        setMessages(messagesData);
        setLoading(false);
        
        // Add welcome message if no messages exist
        if (messagesData.length === 0) {
          addSystemMessage("Welcome to your focus session! 🎯 Use this chat to communicate with your partner.");
        }
      }, (error) => {
        console.error('Error listening to messages:', error);
        toast.error('Failed to load chat messages');
        setLoading(false);
      });

    } catch (error) {
      console.error('Error setting up real-time chat:', error);
      toast.error('Failed to setup chat');
      setLoading(false);
    }
  };

  const addSystemMessage = async (text) => {
    try {
      const systemMessage = {
        text: text,
        userId: 'system',
        userName: 'FocusMate',
        timestamp: serverTimestamp(),
        type: 'system'
      };

      await addDoc(collection(db, 'chats', sessionId, 'messages'), systemMessage);
    } catch (error) {
      console.error('Error adding system message:', error);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !sessionId || !userId) return;

    const messageText = newMessage.trim();
    setNewMessage('');

    try {
      const messageData = {
        text: messageText,
        userId: userId,
        userName: userName,
        timestamp: serverTimestamp(),
        type: 'user'
      };

      await addDoc(collection(db, 'chats', sessionId, 'messages'), messageData);
      setShowQuickMessages(false);
      
      // Focus back on input
      chatInputRef.current?.focus();
      
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
      setNewMessage(messageText); // Restore message on error
    }
  };

  const formatTime = (timestamp) => {
    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      return '';
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
      const fakeEvent = { preventDefault: () => {} };
      sendMessage(fakeEvent);
    }, 100);
  };

  const toggleQuickMessages = () => {
    setShowQuickMessages(!showQuickMessages);
  };

  const getMessageIcon = (type, userId) => {
    if (type === 'system') return '🤖';
    return userId === userId ? '💭' : '👤';
  };

  if (loading) {
    return (
      <div className="chat-widget">
        <div className="chat-header">
          <h4>Session Chat</h4>
        </div>
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-widget">
      <div className="chat-header">
        <div className="chat-title">
          <h4>Session Chat</h4>
          <span className="online-indicator">
            <span className="pulse"></span>
            {partnerId ? 'Partner Online' : 'Waiting for Partner'}
          </span>
        </div>
      </div>
      
      <div className="chat-messages">
        {messages.length === 0 && !loading ? (
          <div className="empty-chat">
            <div className="empty-chat-icon">💬</div>
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map(msg => (
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
          ))
        )}
        
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
      
      {/* Quick Messages - Mobile Only */}
      {showQuickMessages && isMobile && (
        <div className="quick-messages mobile-only">
          <div className="quick-messages-header">
            <span>Quick Messages</span>
            <button 
              className="close-quick-messages"
              onClick={() => setShowQuickMessages(false)}
            >
              ×
            </button>
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
            placeholder="Type a message..."
            className="chat-input"
            rows={1}
            maxLength={500}
            disabled={!sessionId}
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
              disabled={!newMessage.trim() || !sessionId}
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
            💡 Keep messages focused and encouraging
          </span>
        </div>
      </form>
    </div>
  );
}

export default SessionChat;