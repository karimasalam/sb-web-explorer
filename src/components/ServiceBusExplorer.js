import React, { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './ServiceBusExplorer.css';

const MessagePane = ({ messages, onClose, isDlq, topic, subscription, onLoadMore, currentPage, totalPages, totalMessages, onRefresh }) => {
  const [expandedMessages, setExpandedMessages] = useState(new Set());
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);

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

  const resubmitMessages = async () => {
    if (!window.confirm(`Are you sure you want to resubmit ${selectedMessages.size} selected messages?`)) {
      return;
    }

    setIsResubmitting(true);
    const toastId = toast.loading('Resubmitting selected messages...');

    try {
      const response = await fetch(
        `http://localhost:3001/api/topics/${topic.name}/subscriptions/${subscription.subscriptionName}/resubmit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messageIds: Array.from(selectedMessages),
            isDlq
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to resubmit messages');
      }

      // Refresh the subscription details
      await onRefresh(topic.name, subscription.subscriptionName);
      
      // Show success toast
      toast.update(toastId, {
        render: `Successfully resubmitted ${selectedMessages.size} messages`,
        type: 'success',
        isLoading: false,
        autoClose: 3000
      });

      // Close the message pane
      onClose();
    } catch (error) {
      console.error('Error resubmitting messages:', error);
      toast.update(toastId, {
        render: `Failed to resubmit messages: ${error.message}`,
        type: 'error',
        isLoading: false,
        autoClose: 5000
      });
    } finally {
      setIsResubmitting(false);
    }
  };

  const formatMessageStats = () => {
    const start = currentPage * 100 + 1;
    const end = Math.min(start + messages.length - 1, totalMessages);
    return `Showing ${start}-${end} of ${totalMessages} messages (Page ${currentPage + 1} of ${totalPages})`;
  };

  return (
    <div className="message-pane">
      <div className="message-pane-header">
        <div>
          <h3>{isDlq ? 'Dead Letter Queue Messages' : 'Active Messages'}</h3>
          <div className="message-pane-subheader">
            {topic.name}/{subscription.subscriptionName}
          </div>
          <div className="message-pane-stats">
            {formatMessageStats()}
          </div>
        </div>
        <div className="message-pane-actions">
          {selectedMessages.size > 0 && (
            <>
              <button 
                onClick={() => clearMessages(true)}
                disabled={isDeleting || isResubmitting}
                className="delete-button"
              >
                {isDeleting ? 'Deleting...' : `Delete Selected (${selectedMessages.size})`}
              </button>
              <button 
                onClick={resubmitMessages}
                disabled={isDeleting || isResubmitting}
                className="resubmit-button"
              >
                {isResubmitting ? 'Resubmitting...' : `Resubmit Selected (${selectedMessages.size})`}
              </button>
            </>
          )}
          <button 
            onClick={() => clearMessages(false)}
            disabled={isDeleting || isResubmitting}
            className="clear-button"
          >
            {isDeleting ? 'Clearing...' : 'Clear All'}
          </button>
          <button onClick={onClose} className="close-button">×</button>
        </div>
      </div>
      <div className="message-list" onScroll={handleScroll}>
        {messages.length === 0 ? (
          <p className="no-messages">No messages found</p>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={`${msg.messageId}-${msg.sequenceNumber}`} className="message-item">
                <div 
                  className="message-header"
                  onClick={() => toggleMessage(msg.messageId)}
                >
                  <input
                    type="checkbox"
                    checked={selectedMessages.has(msg.messageId)}
                    onChange={(e) => toggleMessageSelection(msg.messageId, e)}
                    className="message-checkbox"
                  />
                  <span className="message-id">ID: {msg.messageId}</span>
                  <span className="expand-icon">
                    {expandedMessages.has(msg.messageId) ? '▼' : '▶'}
                  </span>
                </div>
                {expandedMessages.has(msg.messageId) && (
                  <div className="message-details">
                    <div className="message-time">
                      Enqueued: {new Date(msg.enqueuedTime).toLocaleString()}
                    </div>
                    {Object.keys(msg.properties || {}).length > 0 && (
                      <div className="message-properties">
                        <div className="properties-header">Properties:</div>
                        {Object.entries(msg.properties).map(([key, value]) => (
                          <div key={key} className="property-item">
                            <span className="property-key">{key}:</span>
                            <span className="property-value">{JSON.stringify(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="message-body-container">
                      <div className="body-header">Body:</div>
                      <pre className="message-body">{JSON.stringify(msg.body, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
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
          </>
        )}
      </div>
    </div>
  );
};

const SubscriptionActions = ({ topic, subscription, onViewMessages, onViewDlq, onRefresh }) => {
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState(null);
  const [isDlq, setIsDlq] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);

  const fetchMessages = async (page = 0, isNewFetch = true) => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/topics/${topic.name}/subscriptions/${subscription.subscriptionName}/messages?page=${page}&isDlq=${isDlq}`
      );
      const data = await response.json();
      
      if (isNewFetch) {
        setMessages(data.messages);
      } else {
        setMessages(prev => [...prev, ...data.messages]);
      }
      setCurrentPage(data.currentPage);
      setTotalPages(data.totalPages);
      setTotalMessages(data.totalMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const handleAction = async (action) => {
    setLoading(true);
    try {
      switch (action) {
        case 'messages':
        case 'dlq':
          setIsDlq(action === 'dlq');
          await fetchMessages(0, true);
          break;
        case 'refresh':
          const detailsResponse = await fetch(
            `http://localhost:3001/api/topics/${topic.name}/subscriptions/${subscription.subscriptionName}/details`
          );
          const details = await detailsResponse.json();
          onRefresh(topic.name, subscription.subscriptionName, details);
          break;
      }
    } catch (error) {
      console.error('Error performing action:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="subscription-actions">
      <div className="action-buttons">
        <button 
          onClick={() => handleAction('messages')} 
          disabled={loading}
          className="action-button"
        >
          Get Messages
        </button>
        <button 
          onClick={() => handleAction('dlq')} 
          disabled={loading}
          className="action-button"
        >
          Get DLQ Messages
        </button>
        <button 
          onClick={() => handleAction('refresh')} 
          disabled={loading}
          className="action-button refresh-button"
        >
          🔄 Refresh
        </button>
      </div>
      {messages && (
        <MessagePane 
          messages={messages}
          onClose={() => setMessages(null)}
          isDlq={isDlq}
          topic={topic}
          subscription={subscription}
          onLoadMore={(page) => fetchMessages(page, false)}
          currentPage={currentPage}
          totalPages={totalPages}
          totalMessages={totalMessages}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
};

const ServiceBusExplorer = ({ connectionString }) => {
  const [entities, setEntities] = useState({ queues: [], topics: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSubscriptions, setExpandedSubscriptions] = useState(new Set());
  const [selectedSubscription, setSelectedSubscription] = useState(null);

  const toggleSubscription = (topicName, subscriptionName) => {
    const key = `${topicName}:${subscriptionName}`;
    const newExpanded = new Set(expandedSubscriptions);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSubscriptions(newExpanded);
  };

  const handleSubscriptionRefresh = async (topicName, subscriptionName) => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/topics/${topicName}/subscriptions/${subscriptionName}/details`
      );
      if (!response.ok) {
        throw new Error('Failed to refresh subscription details');
      }
      const details = await response.json();
      
      setEntities(prev => ({
        ...prev,
        topics: prev.topics.map(topic => {
          if (topic.name === topicName) {
            return {
              ...topic,
              subscriptions: topic.subscriptions.map(sub => {
                if (sub.subscriptionName === subscriptionName) {
                  return {
                    ...sub,
                    messageCount: details.messageCount || 0,
                    activeMessageCount: details.activeMessageCount || 0,
                    dlqMessageCount: details.dlqMessageCount || 0
                  };
                }
                return sub;
              })
            };
          }
          return topic;
        })
      }));

      // If this subscription is currently selected, update its messages
      if (selectedSubscription && 
          selectedSubscription.topic.name === topicName && 
          selectedSubscription.subscription.subscriptionName === subscriptionName) {
        await fetchMessages(topicName, subscriptionName, selectedSubscription.isDlq);
      }
    } catch (error) {
      console.error('Error refreshing subscription:', error);
    }
  };

  const fetchMessages = async (topicName, subscriptionName, isDlq = false, page = 0) => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/topics/${topicName}/subscriptions/${subscriptionName}/messages?page=${page}&isDlq=${isDlq}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      const data = await response.json();
      return {
        messages: data.messages,
        totalMessages: data.totalMessages,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
        hasMore: data.hasMore
      };
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  };

  const handleViewMessages = async (topic, subscription, isDlq = false) => {
    try {
      const messageData = await fetchMessages(topic.name, subscription.subscriptionName, isDlq);
      setSelectedSubscription({
        topic,
        subscription,
        isDlq,
        ...messageData
      });
    } catch (error) {
      console.error('Error viewing messages:', error);
    }
  };

  const handleLoadMore = async (page) => {
    if (!selectedSubscription) return;
    
    try {
      const messageData = await fetchMessages(
        selectedSubscription.topic.name,
        selectedSubscription.subscription.subscriptionName,
        selectedSubscription.isDlq,
        page
      );
      
      setSelectedSubscription(prev => ({
        ...prev,
        messages: [...prev.messages, ...messageData.messages],
        currentPage: messageData.currentPage,
        hasMore: messageData.hasMore
      }));
    } catch (error) {
      console.error('Error loading more messages:', error);
    }
  };

  const handleCloseMessages = () => {
    setSelectedSubscription(null);
  };

  useEffect(() => {
    const fetchServiceBusEntities = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const connectResponse = await fetch('http://localhost:3001/api/connect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ connectionString }),
        });

        if (!connectResponse.ok) {
          const error = await connectResponse.json();
          throw new Error(error.error || 'Failed to connect to Service Bus');
        }

        const entitiesResponse = await fetch('http://localhost:3001/api/entities');
        if (!entitiesResponse.ok) {
          const error = await entitiesResponse.json();
          throw new Error(error.error || 'Failed to fetch Service Bus entities');
        }

        const data = await entitiesResponse.json();
        setEntities(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchServiceBusEntities();
  }, [connectionString]);

  if (loading) {
    return <div className="loading">Loading Service Bus entities...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="explorer-container">
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
      <div className="explorer-content">
        <h3>Service Bus Explorer</h3>
        
        <div className="entity-section">
          <h4>Queues ({entities.queues.length})</h4>
          <ul className="entity-list">
            {entities.queues.map((queue) => (
              <li key={queue.name} className="entity-item">
                <div className="queue-info">
                  <span className="entity-name">📬 {queue.name}</span>
                  <span className="message-count">
                    Active: {queue.activeMessageCount || 0} | DLQ: {queue.dlqMessageCount || 0} | Total: {queue.messageCount || 0}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="entity-section">
          <h4>Topics ({entities.topics.length})</h4>
          <ul className="entity-list">
            {entities.topics.map((topic) => (
              <li key={topic.name} className="entity-item">
                <div className="topic-name">📢 {topic.name}</div>
                {Array.isArray(topic.subscriptions) && topic.subscriptions.length > 0 && (
                  <ul className="subscription-list">
                    {topic.subscriptions.map((sub) => {
                      const isExpanded = expandedSubscriptions.has(`${topic.name}:${sub.subscriptionName}`);
                      return (
                        <li key={sub.subscriptionName} className="subscription-item">
                          <div 
                            className="subscription-header"
                            onClick={() => toggleSubscription(topic.name, sub.subscriptionName)}
                          >
                            <span className="subscription-name">
                              📥 {sub.subscriptionName}
                            </span>
                            <span className="message-count">
                              Active: {sub.activeMessageCount || 0} | DLQ: {sub.dlqMessageCount || 0} | Total: {sub.messageCount || 0}
                            </span>
                          </div>
                          {isExpanded && (
                            <SubscriptionActions 
                              topic={topic}
                              subscription={sub}
                              onViewMessages={() => handleViewMessages(topic, sub)}
                              onViewDlq={() => handleViewMessages(topic, sub, true)}
                              onRefresh={() => handleSubscriptionRefresh(topic.name, sub.subscriptionName)}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {selectedSubscription && (
        <MessagePane
          messages={selectedSubscription.messages}
          onClose={handleCloseMessages}
          isDlq={selectedSubscription.isDlq}
          topic={selectedSubscription.topic}
          subscription={selectedSubscription.subscription}
          onLoadMore={handleLoadMore}
          currentPage={selectedSubscription.currentPage}
          totalPages={selectedSubscription.totalPages}
          totalMessages={selectedSubscription.totalMessages}
          onRefresh={handleSubscriptionRefresh}
        />
      )}
    </div>
  );
};

export default ServiceBusExplorer;
