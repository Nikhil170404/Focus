import React, { useState, useEffect, useRef } from 'react';
import { FiSend, FiSmile } from 'react-icons/fi';

function SessionChat({ sessionId, userId, userName }) {
  const [messages, setMessages] = useState([
    { 
      id: 1, 
      text: "Welcome to your focus session! 🎯", 
      userId: 'system', 
      userName: 'FocusMate', 
      time: new Date(),
      type: 'system'
    },
    { 
      id: 2, 
      text: "Stay focused and make the most of this time together!", 
      userId: 'system', 
      userName: 'FocusMate', 
      time: new Date(),
      type: 'system'
    }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Simulate partner messages for demo
    const partnerMessages = [
      "Hi! Ready to focus together?",
      "What are you working on today?",
      "Let's stay productive! 💪",
      "Great session so far!",
      "Keep up the good work!"
    ];

    const intervals = [];
    
    partnerMessages.forEach((message, index) => {
      const timeout = setTimeout(() => {
        if (Math.random() > 0.3) { // 70% chance to send each message
          addPartnerMessage(message);
        }
      }, (index + 1) * 30000 + Math.random() * 20000); // Random intervals
      
      intervals.push(timeout);
    });

    return () => {
      intervals.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  const addPartnerMessage = (text) => {
    const partnerMessage = {
      id: Date.now() + Math.random(),
      text: text,
      userId: 'partner',
      userName: 'Focus Partner',
      time: new Date(),
      type: 'partner'
    };
    
    setMessages(prev => [...prev, partnerMessage]);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const message = {
      id: Date.now(),
      text: newMessage.trim(),
      userId: userId,
      userName: userName,
      time: new Date(),
      type: 'user'
    };

    setMessages(prev => [...prev, message]);
    setNewMessage('');

    // Simulate typing indicator for partner response
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
          "You've got this! 🚀"
        ];
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        addPartnerMessage(randomResponse);
      }, 1000 + Math.random() * 2000);
    }

    // Focus back on input
    chatInputRef.current?.focus();
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', { 
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
    "💪 Keep going!"
  ];

  const sendQuickMessage = (messageText) => {
    setNewMessage(messageText);
    setTimeout(() => {
      sendMessage({ preventDefault: () => {} });
    }, 100);
  };

  return (
    <div className="chat-widget">
      <div className="chat-header">
        <h4>Session Chat</h4>
        <span className="online-indicator">
          <span className="pulse"></span>
          Online
        </span>
      </div>
      
      <div className="chat-messages">
        {messages.map(msg => (
          <div 
            key={msg.id} 
            className={`message ${msg.userId === userId ? 'own' : ''} ${msg.type}`}
          >
            <div className="message-avatar">
              {msg.type === 'system' ? '🤖' : 
               msg.userId === userId ? 
                 (userName?.charAt(0).toUpperCase() || '👤') : 
                 '👥'}
            </div>
            <div className="message-content">
              <div className="message-header">
                <span className="message-sender">{msg.userName}</span>
                <span className="message-time">{formatTime(msg.time)}</span>
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
      <div className="quick-messages">
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
      
      <form onSubmit={sendMessage} className="chat-form">
        <div className="chat-input-container">
          <textarea
            ref={chatInputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message... (Enter to send)"
            className="chat-input"
            rows={1}
            maxLength={500}
          />
          <button 
            type="submit" 
            className={`send-button ${newMessage.trim() ? 'active' : ''}`}
            disabled={!newMessage.trim()}
            title="Send message"
          >
            <FiSend size={18} />
          </button>
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