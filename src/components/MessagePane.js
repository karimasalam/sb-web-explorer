import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import './MessagePane.css';

const MessagePane = ({ messages, onClose, isDlq, topic, subscription, onLoadMore, currentPage, totalPages, totalMessages, onRefresh, onSubscriptionUpdate, onQueueUpdate }) => {
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
    // Create a composite key using both messageId and sequenceNumber
    const messageKey = `${message.messageId}:${message.sequenceNumber}`;
    if (newSelected.has(messageKey)) {
      newSelected.delete(messageKey);
    } else {
      newSelected.add(messageKey);
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

  const confirmClearMessages = (selectedOnly = false) => {
    confirmDialog({
      message: selectedOnly 
        ? `Are you sure you want to delete ${selectedMessages.size} selected messages?` 
        : 'Are you sure you want to clear all messages?',
      header: selectedOnly ? 'Delete Selected Messages' : 'Clear All Messages',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: () => clearMessages(selectedOnly),
      reject: () => {}
    });
  };

  const clearMessages = async (selectedOnly = false) => {
    setIsDeleting(true);
    const toastId = toast.loading(selectedOnly ? 'Deleting selected messages...' : 'Clearing all messages...');

    try {
      // Convert selected message keys back to message objects
      const selectedMessageIds = Array.from(selectedMessages).map(key => {
        const [messageId, sequenceNumber] = key.split(':');
        return { 
          messageId, 
          sequenceNumber // Keep as string, don't convert to number
        };
      });

      const isQueue = topic.type === 'queue';
      const url = isQueue
        ? `http://localhost:3001/api/queues/${encodeURIComponent(topic.name)}/messages`
        : `http://localhost:3001/api/topics/${encodeURIComponent(topic.name)}/subscriptions/${encodeURIComponent(subscription.subscriptionName)}/messages`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageIds: selectedOnly ? selectedMessageIds : [],
          isDlq
        }),
      });

      if (!response.ok) {
        throw new Error(`Error deleting messages: ${response.statusText}`);
      }

      const result = await response.json();
      toast.update(toastId, {
        render: `Successfully deleted ${result.deletedCount} messages`,
        type: 'success',
        isLoading: false,
        autoClose: 3000,
      });

      // Clear selected messages
      setSelectedMessages(new Set());
      
      // Refresh the message list and count
      await onRefresh(topic.name, subscription.subscriptionName);
      
      toast.success('Messages deleted successfully');
      
      // Close the message pane
      onClose();
      
      // Fetch updated subscription details to refresh counts
      if (!isQueue) {
        const detailsUrl = `http://localhost:3001/api/topics/${encodeURIComponent(topic.name)}/subscriptions/${encodeURIComponent(subscription.subscriptionName)}/details`;
        const detailsResponse = await fetch(detailsUrl);
        if (detailsResponse.ok) {
          const details = await detailsResponse.json();
          // Update the subscription in the parent component
          onSubscriptionUpdate(details);
        }
      } else {
        // For queues, fetch queue details
        const detailsUrl = `http://localhost:3001/api/queues/${encodeURIComponent(topic.name)}/details`;
        const detailsResponse = await fetch(detailsUrl);
        if (detailsResponse.ok) {
          const details = await detailsResponse.json();
          // Update the queue details in the parent component
          onQueueUpdate(details);
        }
      }
    } catch (error) {
      console.error('Error deleting messages:', error);
      toast.update(toastId, {
        render: `Error deleting messages: ${error.message}`,
        type: 'error',
        isLoading: false,
        autoClose: 5000,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmResubmitMessages = (selectedOnly = false) => {
    confirmDialog({
      message: selectedOnly 
        ? `Are you sure you want to resubmit ${selectedMessages.size} selected messages?` 
        : 'Are you sure you want to resubmit all messages?',
      header: selectedOnly ? 'Resubmit Selected Messages' : 'Resubmit All Messages',
      icon: 'pi pi-exclamation-triangle',
      accept: () => resubmitMessages(selectedOnly),
      reject: () => {}
    });
  };

  const resubmitMessages = async (selectedOnly = false) => {
    setIsDeleting(true);
    const toastId = toast.loading(selectedOnly ? 'Resubmitting selected messages...' : 'Resubmitting all messages...');

    try {
      const isQueue = topic.type === 'queue';
      const url = isQueue
        ? `http://localhost:3001/api/queues/${topic.name}/resubmit`
        : `http://localhost:3001/api/topics/${topic.name}/subscriptions/${subscription.subscriptionName}/resubmit`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageIds: selectedOnly ? Array.from(selectedMessages).map(key => {
            const [messageId, sequenceNumber] = key.split(':');
            return { messageId, sequenceNumber: parseInt(sequenceNumber) };
          }) : [],
          isDlq
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.success) {
          // All messages resubmitted successfully
          toast.update(toastId, {
            render: data.message || 'Messages resubmitted successfully',
            type: 'success',
            isLoading: false,
            autoClose: 3000
          });
          
          // Refresh the list after resubmission
          onRefresh(topic.name, subscription.subscriptionName);
          setSelectedMessages(new Set());
          
          toast.success('Messages resubmitted successfully');
          
          // Close the message pane
          onClose();
        } else {
          throw new Error(data.error || 'Failed to resubmit some messages');
        }
      } else {
        throw new Error(data.error || 'Failed to resubmit messages');
      }
    } catch (error) {
      console.error('Error resubmitting messages:', error);
      toast.update(toastId, {
        render: error.message,
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
    const messageId = (message?.messageId || message?.sequenceNumber?.toString() || message?.id || '').toString();
    return messageId.toLowerCase().includes(idFilter.toLowerCase());
  });

  return (
    <div className="message-pane">
      <ConfirmDialog />
      <div className="message-pane-header">
        <h2>{isDlq ? 'Dead Letter Queue Messages' : 'Messages'}</h2>
        <div className="message-pane-actions">
          <input
            type="text"
            placeholder="Filter by ID..."
            value={idFilter}
            onChange={(e) => setIdFilter(e.target.value)}
            className="message-filter"
          />
          {isDlq && (
            <>
              <button
                className="resubmit-button"
                onClick={() => confirmResubmitMessages(true)}
                disabled={isDeleting || selectedMessages.size === 0}
              >
                Resubmit Selected ({selectedMessages.size})
              </button>
              <button
                className="resubmit-button"
                onClick={() => confirmResubmitMessages(false)}
                disabled={isDeleting || messages.length === 0}
              >
                Resubmit All
              </button>
            </>
          )}
          <button
            className="delete-button"
            onClick={() => confirmClearMessages(true)}
            disabled={isDeleting || selectedMessages.size === 0}
          >
            Delete Selected ({selectedMessages.size})
          </button>
          <button
            className="clear-button"
            onClick={() => confirmClearMessages(false)}
            disabled={isDeleting || messages.length === 0}
          >
            Clear All
          </button>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="message-pane-content">
        <div className="message-list" onScroll={handleScroll}>
          {filteredMessages.map((message) => {
            const messageBody = typeof message.body === 'string' 
              ? message.body 
              : JSON.stringify(message.body, null, 2);
            const previewText = messageBody.length > 150 
              ? messageBody.substring(0, 150) + '...' 
              : messageBody;

            return (
              <div
                key={`${message.messageId}-${message.sequenceNumber}`}
                className={`message-item ${selectedPreviewMessage?.messageId === message.messageId ? 'selected' : ''}`}
                onClick={() => handleMessageClick(message)}
              >
                <div className="message-header">
                  <input
                    type="checkbox"
                    checked={selectedMessages.has(`${message.messageId}:${message.sequenceNumber}`)}
                    onChange={(e) => toggleMessageSelection(message, e)}
                  />
                  <span className="message-id">ID: {message.messageId}</span>
                  <span className="message-time">{new Date(message.enqueuedTime).toLocaleString()}</span>
                </div>
                <div className="message-preview">
                  {message.body ? (
                    <pre>{previewText}</pre>
                  ) : (
                    <span className="no-data">No message body</span>
                  )}
                </div>
              </div>
            );
          })}
          {loading && <div className="loading">Loading more messages...</div>}
        </div>
        <div className="message-preview-pane">
          {selectedPreviewMessage ? (
            <div className="preview-content">
              <h3>Message Details</h3>
              <div className="message-metadata">
                <p><strong>ID:</strong> {selectedPreviewMessage.messageId}</p>
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
