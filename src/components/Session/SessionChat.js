import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { FiSend, FiSmile, FiMoreVertical, FiHeart, FiThumbsUp, FiCoffee } from 'react-icons/fi';
import { format } from 'date-fns';

function SessionChat({ sessionId, userId, userName, partnerId, partnerName }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showQuickMessages, setShowQuickMessages] = useState(true);
  const [loading, setLoading] = useState(true);
  const [lastTypingTime, setLastTypingTime] = useState(0);
  const [partnerTyping, setPartnerTyping] = useState(false);
  
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const studyFocusedQuickMessages = [
    { text: "👍 Good luck!", category: "encouragement" },
    { text: "🎯 Stay focused!", category: "encouragement" },
    { text: "💪 You got this!", category: "encouragement" },
    { text: "🔥 Great progress!", category: "praise" },
    { text: "✅ Task completed!", category: "progress" },
    { text: "📝 Taking notes", category: "status" },
    { text: "☕ Quick break", category: "status" },
    { text: "🤔 Need help with this", category: "help" },
    { text: "💡 Found a solution!", category: "help" },
    { text: "📚 Reading chapter", category: "progress" },
    { text: "🧮 Solving problems", category: "progress" },
    { text: "⏰ 5 more minutes!", category: "time" },
    { text: "🎉 Finished early!", category: "celebration" },
    { text: "😊 Thanks partner!", category: "gratitude" },
    { text: "🤝 Let's sync up", category: "coordination" },
    { text: "📊 Making progress", category: "progress" }
  ];

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (sessionId && userId) {
      setupRealTimeChat();
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [sessionId, userId]);

  const setupRealTimeChat = () => {
    try {
      setLoading(true);
      
      const messagesQuery = query(
        collection(db, 'chats', sessionId, 'messages'),
        orderBy('timestamp', 'asc'),
        limit(100)
      );

      unsubscribeRef.current = onSnapshot(messagesQuery, (snapshot) => {
        const messagesData = [];
        
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          messagesData.push({
            id: doc.id,
            ...data,
            timestamp: data.timestamp?.toDate() || new Date()
          });
        });
        
        setMessages(messagesData);
        setLoading(false);
        
        // Add welcome message if no messages exist
        if (messagesData.length === 0) {
          addSystemMessage("Welcome to your focus session! 🎯 Use this chat to support each other and stay motivated!");
        }

        // Check for partner typing indicators
        const recentMessages = messagesData.slice(-10);
        const partnerTypingMessage = recentMessages.find(msg => 
          msg.type === 'typing' && 
          msg.userId !== userId && 
          Date.now() - msg.timestamp.getTime() < 5000
        );
        setPartnerTyping(!!partnerTypingMessage);
        
      }, (error) => {
        console.error('Error listening to messages:', error);
        setLoading(false);
      });

    } catch (error) {
      console.error('Error setting up real-time chat:', error);
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

  const sendTypingIndicator = useCallback(async () => {
    const now = Date.now();
    
    // Throttle typing indicators
    if (now - lastTypingTime < 2000) return;
    
    try {
      await addDoc(collection(db, 'chats', sessionId, 'messages'), {
        type: 'typing',
        userId: userId,
        userName: userName,
        timestamp: serverTimestamp()
      });
      
      setLastTypingTime(now);
    } catch (error) {
      console.error('Error sending typing indicator:', error);
    }
  }, [sessionId, userId, userName, lastTypingTime]);

  const sendMessage = async (messageText = null) => {
    const textToSend = messageText || newMessage.trim();
    if (!textToSend || !sessionId || !userId) return;

    setNewMessage('');
    setIsTyping(false);

    try {
      const messageData = {
        text: textToSend,
        userId: userId,
        userName: userName,
        timestamp: serverTimestamp(),
        type: 'user',
        reactions: {},
        edited: false
      };

      await addDoc(collection(db, 'chats', sessionId, 'messages'), messageData);
      setShowQuickMessages(false);
      
      // Focus back on input
      chatInputRef.current?.focus();
      
    } catch (error) {
      console.error('Error sending message:', error);
      if (!messageText) {
        setNewMessage(textToSend); // Restore message on error
      }
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setNewMessage(value);
    
    // Send typing indicator
    if (value.trim() && !isTyping) {
      setIsTyping(true);
      sendTypingIndicator();
      
      // Clear typing indicator after 3 seconds
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
      }, 3000);
    } else if (!value.trim() && isTyping) {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp) => {
    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      const now = new Date();
      const diffInHours = (now - date) / (1000 * 60 * 60);
      
      if (diffInHours < 24) {
        return format(date, 'HH:mm');
      } else {
        return format(date, 'MMM d, HH:mm');
      }
    } catch (error) {
      return '';
    }
  };

  const sendQuickMessage = (messageText) => {
    sendMessage(messageText);
  };

  const addReaction = async (messageId, emoji) => {
    try {
      // This would require updating the message document with reactions
      // For now, we'll just send a reaction as a quick message
      await sendMessage(`${emoji}`);
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  const renderMessage = (msg) => {
    const isOwn = msg.userId === userId;
    const isSystem = msg.type === 'system';
    const isTyping = msg.type === 'typing';
    
    if (isTyping) return null; // Don't render typing messages
    
    return (
      <div 
        key={msg.id} 
        className={`message ${isOwn ? 'own' : ''} ${isSystem ? 'system' : 'user'}`}
      >
        {!isOwn && !isSystem && (
          <div className="message-avatar">
            {partnerName?.charAt(0).toUpperCase() || '👥'}
          </div>
        )}
        
        <div className="message-content">
          {!isSystem && (
            <div className="message-header">
              <span className="message-sender">
                {isOwn ? 'You' : msg.userName}
              </span>
              <span className="message-time">{formatTime(msg.timestamp)}</span>
            </div>
          )}
          
          <div className={`message-bubble ${isSystem ? 'system-bubble' : ''}`}>
            <div className="message-text">{msg.text}</div>
            {!isSystem && (
              <div className="message-actions">
                <button 
                  className="reaction-btn"
                  onClick={() => addReaction(msg.id, '👍')}
                  title="Like"
                >
                  <FiThumbsUp size={12} />
                </button>
                <button 
                  className="reaction-btn"
                  onClick={() => addReaction(msg.id, '❤️')}
                  title="Love"
                >
                  <FiHeart size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const groupedQuickMessages = studyFocusedQuickMessages.reduce((acc, msg) => {
    if (!acc[msg.category]) acc[msg.category] = [];
    acc[msg.category].push(msg);
    return acc;
  }, {});

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
          <h4>Study Chat</h4>
          <span className="online-indicator">
            <span className="pulse"></span>
            {partnerId ? (
              <>
                {partnerTyping ? '✍️ Partner typing...' : '🟢 Partner online'}
              </>
            ) : (
              '⏳ Waiting for partner'
            )}
          </span>
        </div>
        <button 
          className="chat-menu-btn"
          onClick={() => setShowQuickMessages(!showQuickMessages)}
          title="Quick messages"
        >
          <FiSmile />
        </button>
      </div>
      
      <div className="chat-messages">
        {messages.length === 0 && !loading ? (
          <div className="empty-chat">
            <div className="empty-chat-icon">💬</div>
            <p>Start chatting with your study partner!</p>
            <p className="empty-chat-subtitle">
              Encourage each other and share progress
            </p>
          </div>
        ) : (
          messages.map(renderMessage)
        )}
        
        {partnerTyping && (
          <div className="message typing-indicator">
            <div className="message-avatar">👥</div>
            <div className="message-content">
              <div className="message-bubble typing">
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span className="typing-text">{partnerName} is typing...</span>
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
            <button 
              className="close-quick-messages"
              onClick={() => setShowQuickMessages(false)}
            >
              ×
            </button>
          </div>
          
          <div className="quick-messages-categories">
            {Object.entries(groupedQuickMessages).map(([category, messages]) => (
              <div key={category} className="quick-category">
                <h5 className="category-title">
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </h5>
                <div className="quick-messages-grid">
                  {messages.map((message, index) => (
                    <button
                      key={index}
                      className="quick-message-btn"
                      onClick={() => sendQuickMessage(message.text)}
                      title={`Send: ${message.text}`}
                    >
                      {message.text}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Chat Input */}
      <div className="chat-form">
        <div className="chat-input-container">
          <textarea
            ref={chatInputRef}
            value={newMessage}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Send encouragement or ask for help..."
            className="chat-input"
            rows={1}
            maxLength={500}
            disabled={!sessionId}
          />
          <div className="chat-input-actions">
            <button 
              type="button"
              className="emoji-button"
              onClick={() => setShowQuickMessages(!showQuickMessages)}
              title="Quick messages"
            >
              <FiSmile size={16} />
            </button>
            <button 
              type="button"
              onClick={() => sendMessage()}
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
            💡 Keep messages positive and study-focused
          </span>
        </div>
      </div>
      
      {/* Study Tips */}
      <div className="study-tips">
        <h5>💡 Study Tips</h5>
        <div className="tip-carousel">
          <div className="tip active">
            <FiCoffee className="tip-icon" />
            <span>Take breaks every 25-50 minutes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SessionChat;