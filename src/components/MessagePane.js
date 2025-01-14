import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import './MessagePane.css';

const MessagePane = ({ messages, onClose, isDlq, topic, subscription, onLoadMore, currentPage, totalPages, totalMessages, onRefresh }) => {
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [selectedPreviewMessage, setSelectedPreviewMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [idFilter, setIdFilter] = useState('');

  useEffect(() => {
    // Reset expanded and selected messages when the message list changes
    setSelectedMessages(new Set());
  }, [messages]);

  const toggleMessageSelection = (message, event) => {
    event.stopPropagation();
    const newSelected = new Set(selectedMessages);
    const messageId = message.messageId;
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
      console.log('Attempting to delete messages:', {
        selectedOnly,
        messageIds: selectedOnly ? Array.from(selectedMessages) : [],
        topic: topic.name,
        subscription: subscription.subscriptionName,
        isDlq
      });

      const response = await fetch(
        `http://localhost:3001/api/topics/${encodeURIComponent(topic.name)}/subscriptions/${encodeURIComponent(subscription.subscriptionName)}/messages`,
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

      console.log('Delete response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Delete response error:', errorData);
        throw new Error(errorData.error || 'Failed to clear messages');
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

  const handleMessageClick = (message) => {
    setSelectedPreviewMessage(message);
  };

  const filteredMessages = messages.filter(message => {
    if (!idFilter) return true;
    const messageId = message?.messageId || message?.id || '';
    return messageId.toString().toLowerCase().includes(idFilter.toLowerCase());
  });

  return (
    <div className="message-pane">
      <div className="message-pane-header">
        <h2>{isDlq ? 'Dead Letter Queue Messages' : 'Messages'}</h2>
        <div className="message-controls">
          <input
            type="text"
            placeholder="Filter by ID..."
            value={idFilter}
            onChange={(e) => setIdFilter(e.target.value)}
            className="id-filter"
          />
          <button onClick={onClose} className="close-icon-button">×</button>
        </div>
      </div>
      <div className="message-actions">
        <button
          onClick={() => clearMessages(true)}
          disabled={selectedMessages.size === 0 || isDeleting}
        >
          Delete Selected ({selectedMessages.size})
        </button>
        <button
          onClick={() => clearMessages(false)}
          disabled={messages.length === 0 || isDeleting}
        >
          Clear All
        </button>
        {isDlq && (
          <>
            <button
              onClick={() => resubmitMessages(true)}
              disabled={selectedMessages.size === 0 || isDeleting}
            >
              Resubmit Selected ({selectedMessages.size})
            </button>
            <button
              onClick={() => resubmitMessages(false)}
              disabled={messages.length === 0 || isDeleting}
            >
              Resubmit All
            </button>
          </>
        )}
      </div>
      <div className="message-pane-content">
        <div className="message-list" onScroll={handleScroll}>
          {filteredMessages.map((message) => (
            <div
              key={message.messageId || message.id}
              className={`message-item ${selectedPreviewMessage?.messageId === message.messageId ? 'selected' : ''}`}
              onClick={() => handleMessageClick(message)}
            >
              <div className="message-header">
                <input
                  type="checkbox"
                  checked={selectedMessages.has(message.messageId)}
                  onChange={(e) => toggleMessageSelection(message, e)}
                />
                <span className="message-id">ID: {message.messageId}</span>
              </div>
              <div className="message-preview">
                {message.body ? (
                  <pre>{typeof message.body === 'string' ? message.body.substring(0, 100) : JSON.stringify(message.body, null, 2).substring(2, 100)}...</pre>
                ) : (
                  <span className="no-data">No data</span>
                )}
              </div>
            </div>
          ))}
          {loading && <div className="loading">Loading more messages...</div>}
        </div>
        <div className="message-preview-pane">
          {selectedPreviewMessage ? (
            <div className="preview-content">
              <h3>Message Details</h3>
              <div className="message-metadata">
                <p><strong>ID:</strong> {selectedPreviewMessage.messageId || selectedPreviewMessage.id}</p>
                <p><strong>Published:</strong> {new Date(selectedPreviewMessage.enqueuedTime).toLocaleString()}</p>
              </div>
              <div className="message-data">
                <h4>Payload:</h4>
                <pre>
                  {typeof selectedPreviewMessage.body === 'string'
                    ? selectedPreviewMessage.body
                    : JSON.stringify(selectedPreviewMessage.body, null, 2)}
                </pre>
              </div>
              {selectedPreviewMessage.properties && Object.keys(selectedPreviewMessage.properties).length > 0 && (
                <div className="message-attributes">
                  <h4>Properties:</h4>
                  <pre>{JSON.stringify(selectedPreviewMessage.properties, null, 2)}</pre>
                </div>
              )}
            </div>
          ) : (
            <div className="no-preview">
              <p>Select a message to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessagePane;
