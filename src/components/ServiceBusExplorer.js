import React, { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './ServiceBusExplorer.css';
import MessagePane from './MessagePane';

const SubscriptionActions = ({ topic, subscription, onViewMessages, onViewDlq, onRefresh }) => {
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState(null);
  const [isDlq, setIsDlq] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);

  const fetchMessages = async (page = 0, isNewFetch = true, isDeadLetter = isDlq) => {
    try {
      console.log('Fetching messages:', { topic: topic.name, subscription: subscription.subscriptionName, isDlq: isDeadLetter, page });
      const response = await fetch(
        `http://localhost:3001/api/topics/${topic.name}/subscriptions/${subscription.subscriptionName}/messages?page=${page}&isDlq=${isDeadLetter}`
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
      toast.error('Failed to fetch messages. Please try again.');
    }
  };

  const handleAction = async (action) => {
    setLoading(true);
    try {
      switch (action) {
        case 'messages':
          setIsDlq(false);
          await fetchMessages(0, true, false);
          break;
        case 'dlq':
          setIsDlq(true);
          await fetchMessages(0, true, true);
          break;
        case 'refresh':
          const detailsResponse = await fetch(
            `http://localhost:3001/api/topics/${topic.name}/subscriptions/${subscription.subscriptionName}/details`
          );
          const details = await detailsResponse.json();
          onRefresh(topic.name, subscription.subscriptionName, details);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error performing action:', error);
      toast.error('An error occurred. Please try again.');
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
          📨 Messages
        </button>
        <button 
          onClick={() => handleAction('dlq')} 
          disabled={loading}
          className="action-button"
        >
          📨 DLQ
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
  const [expandedSections, setExpandedSections] = useState({
    queues: true,
    topics: true
  });
  const [expandedTopicSubscriptions, setExpandedTopicSubscriptions] = useState({});

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

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

  const toggleTopicSubscriptions = (topicName) => {
    setExpandedTopicSubscriptions(prev => ({
      ...prev,
      [topicName]: !prev[topicName]
    }));
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
      console.log('Fetching messages:', { topicName, subscriptionName, isDlq, page });
      const response = await fetch(
        `http://localhost:3001/api/topics/${topicName}/subscriptions/${subscriptionName}/messages?page=${page}&isDlq=${isDlq}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      
      const data = await response.json();
      console.log('Received messages:', data);
      
      if (!data.messages) {
        throw new Error('No messages data received');
      }
      
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
      // Set initial state with null messages to indicate loading
      setSelectedSubscription({
        topic,
        subscription,
        isDlq,
        messages: null,
        totalMessages: 0,
        currentPage: 0,
        totalPages: 0,
        hasMore: false
      });
      
      console.log('Loading messages for:', { topic: topic.name, subscription: subscription.subscriptionName, isDlq });
      const messageData = await fetchMessages(topic.name, subscription.subscriptionName, isDlq);
      console.log('Loaded messages:', messageData);
      
      setSelectedSubscription(prev => {
        // Check if the component is still mounted and subscription is still selected
        if (!prev) return null;
        return {
          ...prev,
          ...messageData,
          messages: messageData.messages
        };
      });
    } catch (error) {
      console.error('Error viewing messages:', error);
      toast.error('Failed to load messages. Please try again.');
      setSelectedSubscription(null);
    }
  };

  const handleLoadMore = async (page) => {
    if (!selectedSubscription || !selectedSubscription.messages) return;
    
    setLoading(true);
    try {
      const messageData = await fetchMessages(
        selectedSubscription.topic.name,
        selectedSubscription.subscription.subscriptionName,
        selectedSubscription.isDlq,
        page
      );
      
      setSelectedSubscription(prev => {
        if (!prev) return null;
        return {
          ...prev,
          messages: [...prev.messages, ...(messageData.messages || [])],
          currentPage: messageData.currentPage,
          hasMore: messageData.hasMore
        };
      });
    } catch (error) {
      console.error('Error loading more messages:', error);
      toast.error('Failed to load more messages. Please try again.');
    } finally {
      setLoading(false);
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
          <h4 onClick={() => toggleSection('queues')} style={{ cursor: 'pointer' }}>
            <span>{expandedSections.queues ? '▼' : '▶'}</span>
            Queues
            <span className="badge">{entities.queues.length}</span>
          </h4>
          {expandedSections.queues && (
            <ul className="entity-list">
              {entities.queues.map((queue) => (
                <li key={queue.name} className="entity-item">
                  <div className="queue-info">
                    <div className="queue-name">
                      <span className="queue-name-icon">📬</span>
                      <span>{queue.name}</span>
                    </div>
                    <div className="queue-metrics">
                      <div className="metric-item">
                        <span className="metric-label">Active:</span>
                        <span className="metric-value">{queue.activeMessageCount || 0}</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">DLQ:</span>
                        <span className="metric-value">{queue.dlqMessageCount || 0}</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">Total:</span>
                        <span className="metric-value">{queue.messageCount || 0}</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="entity-section">
          <h4 onClick={() => toggleSection('topics')} style={{ cursor: 'pointer' }}>
            <span>{expandedSections.topics ? '▼' : '▶'}</span>
            Topics
            <span className="badge">{entities.topics.length}</span>
          </h4>
          {expandedSections.topics && (
            <ul className="entity-list">
              {entities.topics.map((topic) => (
                <li key={topic.name} className="entity-item">
                  <div className="topic-name" onClick={() => toggleTopicSubscriptions(topic.name)} style={{ cursor: 'pointer' }}>
                    <span>{expandedTopicSubscriptions[topic.name] ? '▼' : '▶'}</span>
                    <svg className="topic-icon" width="20" height="20" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M0 10C0 4.47715 4.47715 0 10 0H40C45.5228 0 50 4.47715 50 10V40C50 45.5228 45.5228 50 40 50H10C4.47715 50 0 45.5228 0 40V10Z" fill="#0078D4"/>
                      <path d="M34 16H16C14.8954 16 14 16.8954 14 18V32C14 33.1046 14.8954 34 16 34H34C35.1046 34 36 33.1046 36 32V18C36 16.8954 35.1046 16 34 16Z" stroke="white" strokeWidth="2"/>
                      <path d="M14 20L25 26L36 20" stroke="white" strokeWidth="2"/>
                      <rect x="20" y="23" width="10" height="2" fill="white"/>
                      <rect x="20" y="27" width="10" height="2" fill="white"/>
                    </svg>
                    {topic.name}
                  </div>
                  {expandedTopicSubscriptions[topic.name] && Array.isArray(topic.subscriptions) && topic.subscriptions.length > 0 && (
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
                                <svg className="subscription-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <rect x="2" y="2" width="20" height="20" rx="2" fill="#0078d4"/>
                                  <path d="M6 8L12 12L18 8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                                  <path d="M6 12L12 16L18 12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                                {sub.subscriptionName}
                              </span>
                              <div className="queue-metrics">
                                <div className="metric-item">
                                  <span className="metric-label">Active:</span>
                                  <span className="metric-value">{sub.activeMessageCount || 0}</span>
                                </div>
                                <div className="metric-item">
                                  <span className="metric-label">DLQ:</span>
                                  <span className="metric-value">{sub.dlqMessageCount || 0}</span>
                                </div>
                                <div className="metric-item">
                                  <span className="metric-label">Total:</span>
                                  <span className="metric-value">{sub.messageCount || 0}</span>
                                </div>
                              </div>
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
          )}
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
