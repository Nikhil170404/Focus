import React, { useState, useEffect, useRef } from 'react';
import { FiSend } from 'react-icons/fi';

function SessionChat({ sessionId, userId, userName }) {
  const [messages, setMessages] = useState([
    { id: 1, text: "Welcome to the session!", userId: 'system', userName: 'System', time: new Date() }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const message = {
      id: Date.now(),
      text: newMessage,
      userId: userId,
      userName: userName,
      time: new Date()
    };

    setMessages([...messages, message]);
    setNewMessage('');
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="chat-widget">
      <div className="chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.userId === userId ? 'own' : ''}`}>
            <div className="message-bubble">
              <div className="message-text">{msg.text}</div>
              <div className="message-time">{formatTime(msg.time)}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={sendMessage} className="chat-form">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="chat-input"
        />
        <button type="submit" className="send-button">
          <FiSend />
        </button>
      </form>
    </div>
  );
}

export default SessionChat;