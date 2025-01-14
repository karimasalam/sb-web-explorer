import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import './MessagePane.css';

const MessagePane = ({ messages, onClose, isDlq, topic, subscription, onLoadMore, currentPage, totalPages, totalMessages, onRefresh }) => {
  const [expandedMessages, setExpandedMessages] = useState(new Set());
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    // Reset expanded and selected messages when the message list changes
    setExpandedMessages(new Set());
    setSelectedMessages(new Set());
  }, [messages]);

  const toggleMessage = (messageId) => {
    const newExpanded = new Set(expandedMessages);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
    }
    setExpandedMessages(newExpanded);
  };

  const toggleMessageSelection = (messageId, event) => {
    event.stopPropagation();
    const newSelected = new Set(selectedMessages);
    if (newSelected.has(messageId)) {
      newSelected.delete(messageId);
    } else {
      newSelected.add(messageId);
    }
    setSelectedMessages(newSelected);
  };

  const handleScroll = async (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const scrolledToBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 1;
    
    if (scrolledToBottom && !loading && currentPage < totalPages - 1) {
      setLoading(true);
      try {
        await onLoadMore(currentPage + 1);
      } catch (error) {
        console.error('Error loading more messages:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const clearMessages = async (selectedOnly = false) => {
    if (!window.confirm(selectedOnly 
      ? `Are you sure you want to delete ${selectedMessages.size} selected messages?` 
      : 'Are you sure you want to clear all messages?')) {
      return;
    }

    setIsDeleting(true);
    const toastId = toast.loading(selectedOnly ? 'Deleting selected messages...' : 'Clearing all messages...');

    try {
      const response = await fetch(
        `http://localhost:3001/api/topics/${topic.name}/subscriptions/${subscription.subscriptionName}/messages`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messageIds: selectedOnly ? Array.from(selectedMessages) : [],
            isDlq
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to clear messages');
      }

      // Refresh the subscription details first
      await onRefresh(topic.name, subscription.subscriptionName);
      
      // Show success toast
      toast.update(toastId, {
        render: selectedOnly 
          ? `Successfully deleted ${selectedMessages.size} messages` 
          : 'Successfully cleared all messages',
        type: 'success',
        isLoading: false,
        autoClose: 3000
      });

      // Close the message pane
      onClose();
    } catch (error) {
      console.error('Error clearing messages:', error);
      toast.update(toastId, {
        render: `Failed to clear messages: ${error.message}`,
        type: 'error',
        isLoading: false,
        autoClose: 5000
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const resubmitMessages = async (selectedOnly = false) => {
    if (!window.confirm(selectedOnly 
      ? `Are you sure you want to resubmit ${selectedMessages.size} selected messages?` 
      : 'Are you sure you want to resubmit all messages?')) {
      return;
    }

    setIsDeleting(true);
    const toastId = toast.loading(selectedOnly ? 'Resubmitting selected messages...' : 'Resubmitting all messages...');

    try {
      const response = await fetch(
        `http://localhost:3001/api/topics/${topic.name}/subscriptions/${subscription.subscriptionName}/resubmit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messageIds: selectedOnly ? Array.from(selectedMessages) : [],
            isDlq
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        if (data.success) {
          // All messages resubmitted successfully
          toast.update(toastId, {
            render: data.message,
            type: 'success',
            isLoading: false,
            autoClose: 3000
          });
          // Refresh and close
          await onRefresh(topic.name, subscription.subscriptionName);
          onClose();
        } else {
          // Some messages failed (status 207) or no messages found (status 404)
          toast.update(toastId, {
            render: data.message,
            type: 'warning',
            isLoading: false,
            autoClose: 5000
          });
          if (data.details?.failedMessages?.length > 0) {
            // Show details of failed messages
            console.error('Failed messages:', data.details.failedMessages);
            data.details.failedMessages.forEach(({ messageId, error }) => {
              toast.error(`Failed to resubmit message ${messageId}: ${error}`, {
                autoClose: 5000
              });
            });
          }
          // Refresh to show updated state
          await onRefresh(topic.name, subscription.subscriptionName);
        }
      } else {
        throw new Error(data.message || 'Failed to resubmit messages');
      }
    } catch (error) {
      console.error('Error resubmitting messages:', error);
      toast.update(toastId, {
        render: `Failed to resubmit messages: ${error.message}`,
        type: 'error',
        isLoading: false,
        autoClose: 5000
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="message-pane">
      <div className="message-pane-header">
        <h3>
          {isDlq ? 'Dead Letter Messages' : 'Messages'} - {topic.name}/{subscription.subscriptionName}
          {totalMessages !== undefined && ` (${totalMessages} messages)`}
        </h3>
        <button onClick={onClose} className="close-button">×</button>
      </div>
      <div className="message-actions">
        <button onClick={() => onRefresh(topic.name, subscription.subscriptionName)}>
          <span>🔄</span> Refresh
        </button>
        {isDlq && selectedMessages.size > 0 && (
          <button onClick={() => resubmitMessages(true)} disabled={isDeleting}>
            <span>↩️</span> Resubmit ({selectedMessages.size})
          </button>
        )}
        {isDlq && (
          <button onClick={() => resubmitMessages(false)} disabled={isDeleting}>
            <span>↩️</span> Resubmit All
          </button>
        )}
        {selectedMessages.size > 0 && (
          <button onClick={() => clearMessages(true)} disabled={isDeleting}>
            <span>🗑️</span> Delete ({selectedMessages.size})
          </button>
        )}
        <button onClick={() => clearMessages(false)} disabled={isDeleting}>
          <span>🗑️</span> Clear All
        </button>
      </div>
      <div className="message-list" onScroll={handleScroll}>
        {messages === null ? (
          <div className="loading-messages">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="no-messages">No messages found</div>
        ) : (
          messages.map((message) => (
            <div key={`${message.messageId}-${message.sequenceNumber}`} className="message-item">
              <div 
                className="message-header"
                onClick={() => toggleMessage(message.messageId)}
              >
                <input
                  type="checkbox"
                  checked={selectedMessages.has(message.messageId)}
                  onChange={(e) => toggleMessageSelection(message.messageId, e)}
                  className="message-checkbox"
                />
                <span className="message-id">ID: {message.messageId}</span>
                <span className="expand-icon">
                  {expandedMessages.has(message.messageId) ? '▼' : '▶'}
                </span>
              </div>
              {expandedMessages.has(message.messageId) && (
                <div className="message-details">
                  <div className="message-time">
                    Enqueued: {new Date(message.enqueuedTime).toLocaleString()}
                  </div>
                  {Object.keys(message.properties || {}).length > 0 && (
                    <div className="message-properties">
                      <div className="properties-header">Properties:</div>
                      {Object.entries(message.properties).map(([key, value]) => (
                        <div key={key} className="property-item">
                          <span className="property-key">{key}:</span>
                          <span className="property-value">{JSON.stringify(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="message-body-container">
                    <div className="body-header">Body:</div>
                    <pre className="message-body">{JSON.stringify(message.body, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        {loading && (
          <div className="loading-more">
            Loading more messages... ({messages.length} of {totalMessages} loaded)
          </div>
        )}
        {!loading && currentPage < totalPages - 1 && (
          <div className="scroll-hint">
            Scroll down to load more messages ({messages.length} of {totalMessages} loaded)
          </div>
        )}
      </div>
    </div>
  );
};

export default MessagePane;
