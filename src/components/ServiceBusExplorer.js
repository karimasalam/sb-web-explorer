import React, { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './ServiceBusExplorer.css';
import MessagePane from './MessagePane';
import { Tree } from 'primereact/tree';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';

const SubscriptionActions = ({ topic, subscription, onViewMessages, onRefresh, onSubscriptionUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState(null);
  const [isDlq, setIsDlq] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);

  const handleSubscriptionUpdate = (details) => {
    onSubscriptionUpdate?.(topic.name, subscription.subscriptionName, details);
  };

  const handleAction = async (action) => {
    setLoading(true);
    try {
      switch (action) {
        case 'messages':
          setIsDlq(false);
          onViewMessages(topic, subscription, false);
          break;
        case 'dlq':
          setIsDlq(true);
          onViewMessages(topic, subscription, true);
          break;
        case 'refresh':
          await onRefresh(topic.name, subscription.subscriptionName);
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
    </div>
  );
};

const QueueActions = ({ queue, onViewMessages, onViewDlq, onRefresh, onQueueUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState(null);
  const [isDlq, setIsDlq] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);

  const fetchMessages = async (page = 0, isNewFetch = true, isDeadLetter = isDlq) => {
    try {
      console.log('Fetching messages:', { queue: queue.name, isDlq: isDeadLetter, page });
      const response = await fetch(
        `http://localhost:3001/api/queues/${queue.name}/messages?page=${page}&isDlq=${isDeadLetter}`
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
            `http://localhost:3001/api/queues/${queue.name}/details`
          );
          const details = await detailsResponse.json();
          onRefresh(queue.name, details);
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

  const handleQueueUpdate = (details) => {
    onQueueUpdate?.(queue.name, details);
  };

  return (
    <div className="queue-actions">
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
          topic={queue}
          subscription={null}
          onLoadMore={() => fetchMessages(currentPage + 1, false)}
          currentPage={currentPage}
          totalPages={totalPages}
          totalMessages={totalMessages}
          onRefresh={fetchMessages}
          onQueueUpdate={handleQueueUpdate}
        />
      )}
    </div>
  );
};

const ServiceBusExplorer = ({ connectionString, onSignOut }) => {
  const [entities, setEntities] = useState({ queues: [], topics: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState({});
  const [treeData, setTreeData] = useState([]);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedQueue, setSelectedQueue] = useState(null);
  const [expandedKeys, setExpandedKeys] = useState({});

  const transformToTreeData = (entities) => {
    const data = [];
    const expanded = {};
    
    // Add Queues node
    if (entities.queues.length > 0) {
      data.push({
        key: 'queues',
        label: 'Queues',
        icon: 'pi pi-inbox',
        data: 'queues',
        children: entities.queues.map(queue => ({
          key: `queue-${queue.name}`,
          label: queue.name,
          icon: 'pi pi-inbox',
          data: { type: 'queue', name: queue.name, ...queue }
        }))
      });
      expanded['queues'] = true;
    }

    // Add Topics node
    if (entities.topics.length > 0) {
      data.push({
        key: 'topics',
        label: 'Topics',
        icon: 'pi pi-send',
        data: 'topics',
        children: entities.topics.map(topic => ({
          key: `topic-${topic.name}`,
          label: topic.name,
          icon: 'pi pi-envelope',
          data: { type: 'topic', ...topic }
        }))
      });
      expanded['topics'] = true;
    }
    
    setExpandedKeys(expanded);
    return data;
  };

  const handleSelect = (e) => {
    const nodeData = e.node.data;
    if (nodeData.type === 'topic') {
      setSelectedTopic(nodeData);
      setSelectedSubscription(null);
      setSelectedQueue(null);
    } else if (nodeData.type === 'queue') {
      setSelectedQueue(nodeData);
      setSelectedTopic(null);
      setSelectedSubscription(null);
    }
  };

  const subscriptionActionsTemplate = (subscription) => {
    return (
      <div className="subscription-actions-cell">
        <Button 
          icon="pi pi-envelope" 
          className="p-button-text p-button-sm" 
          tooltip="View Messages"
          tooltipOptions={{ position: 'left' }}
          onClick={() => handleViewMessages(selectedTopic, subscription, false)}
        />
        <Button 
          icon="pi pi-exclamation-triangle" 
          className="p-button-text p-button-sm" 
          tooltip="View DLQ"
          tooltipOptions={{ position: 'left' }}
          onClick={() => handleViewMessages(selectedTopic, subscription, true)}
        />
        <Button 
          icon="pi pi-refresh" 
          className="p-button-text p-button-sm" 
          tooltip="Refresh"
          tooltipOptions={{ position: 'left' }}
          onClick={() => {
            console.log('Refresh button clicked for:', subscription);
            handleRefreshSubscription(selectedTopic.name, subscription.subscriptionName);
          }}
        />
      </div>
    );
  };

  const queueActionsTemplate = (queue) => {
    return (
      <div className="subscription-actions-cell">
        <Button 
          icon="pi pi-envelope" 
          className="p-button-text p-button-sm" 
          tooltip="Get Messages"
          onClick={() => handleViewMessages({ ...queue, type: 'queue' }, { subscriptionName: queue.name }, false)}
        />
        <Button 
          icon="pi pi-exclamation-triangle" 
          className="p-button-text p-button-sm p-button-warning" 
          tooltip="Get DLQ Messages"
          tooltipOptions={{ position: 'left'}}
          onClick={() => handleViewMessages({ ...queue, type: 'queue' }, { subscriptionName: queue.name }, true)}
        />
        <Button 
          icon="pi pi-refresh" 
          className="p-button-text p-button-sm" 
          tooltip="Refresh"
          tooltipOptions={{ position: 'left'}}
          onClick={() => handleRefreshSubscription(queue.name, queue.name)}
        />
      </div>
    );
  };

  const handleViewMessages = async (topic, subscription, isDlq = false) => {
    try {
      // Set initial state with empty messages array
      setSelectedSubscription({
        topic,
        subscription,
        isDlq,
        messages: [],
        totalMessages: 0,
        currentPage: 0,
        totalPages: 0,
        hasMore: false
      });
      
      let url;
      let fetchOptions = {
        method: topic.type === 'queue' ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      };

      if (topic.type === 'queue') {
        url = `http://localhost:3001/api/queues/${topic.name}/messages?isDlq=${isDlq}`;
      } else {
        url = `http://localhost:3001/api/topics/${topic.name}/subscriptions/${subscription.subscriptionName}/messages?isDlq=${isDlq}`;
      }

      console.log('Fetching from URL:', url, 'with options:', fetchOptions);

      const response = await fetch(url, fetchOptions);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      setSelectedSubscription(prev => {
        // Check if the component is still mounted and subscription is still selected
        if (!prev) return null;
        return {
          ...prev,
          ...data,
          messages: data.messages || []
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
      let url;
      let fetchOptions = {
        method: selectedSubscription.topic.type === 'queue' ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (selectedSubscription.topic.type === 'queue') {
        url = `http://localhost:3001/api/queues/${selectedSubscription.topic.name}/messages?page=${page}&isDlq=${selectedSubscription.isDlq}`;
      } else {
        url = `http://localhost:3001/api/topics/${selectedSubscription.topic.name}/subscriptions/${selectedSubscription.subscription.subscriptionName}/messages?page=${page}&isDlq=${selectedSubscription.isDlq}`;
      }

      console.log('Fetching from URL:', url, 'with options:', fetchOptions);

      const response = await fetch(url, fetchOptions);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      setSelectedSubscription(prev => {
        if (!prev) return null;
        return {
          ...prev,
          messages: [...prev.messages, ...(data.messages || [])],
          currentPage: data.currentPage,
          hasMore: data.hasMore
        };
      });
    } catch (error) {
      console.error('Error loading more messages:', error);
      toast.error('Failed to load more messages');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseMessages = () => {
    setSelectedSubscription(null);
  };

  const handleRefreshSubscription = async (topicName, subscriptionName) => {
    try {
      setLoading(true);
      console.log('Refreshing subscription:', { topicName, subscriptionName });
      
      const detailsUrl = `http://localhost:3001/api/topics/${encodeURIComponent(topicName)}/subscriptions/${encodeURIComponent(subscriptionName)}/details`;
      const response = await fetch(detailsUrl);
      
      if (!response.ok) {
        throw new Error('Failed to refresh subscription details');
      }

      const details = await response.json();
      console.log('Received subscription details:', details);

      setEntities(prev => {
        // Create completely new references
        const newEntities = {
          ...prev,
          topics: prev.topics.map(topic => {
            if (topic.name === topicName) {
              return {
                ...topic,
                subscriptions: topic.subscriptions.map(sub => {
                  if (sub.subscriptionName === subscriptionName) {
                    const updatedSub = {
                      ...sub,
                      activeMessageCount: parseInt(details.activeMessageCount),
                      dlqMessageCount: parseInt(details.dlqMessageCount),
                      messageCount: parseInt(details.messageCount)
                    };
                    console.log('Updated subscription:', updatedSub);
                    return updatedSub;
                  }
                  return sub;
                })
              };
            }
            return topic;
          })
        };

        console.log('Updated entities:', JSON.stringify(newEntities, null, 2));
        return newEntities;
      });

      // Force a re-render of the selected topic
      setSelectedTopic(prev => {
        if (prev && prev.name === topicName) {
          const updatedTopic = {
            ...prev,
            subscriptions: prev.subscriptions.map(sub => {
              if (sub.subscriptionName === subscriptionName) {
                return {
                  ...sub,
                  activeMessageCount: parseInt(details.activeMessageCount),
                  dlqMessageCount: parseInt(details.dlqMessageCount),
                  messageCount: parseInt(details.messageCount)
                };
              }
              return sub;
            })
          };
          console.log('Updated selected topic:', updatedTopic);
          return updatedTopic;
        }
        return prev;
      });

      toast.success('Subscription refreshed successfully');
    } catch (error) {
      console.error('Error refreshing subscription:', error);
      toast.error('Failed to refresh subscription');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscriptionUpdate = (topicName, subscriptionName, details) => {
    console.log('Updating subscription details:', { topicName, subscriptionName, details });
    setEntities(prev => {
      console.log('Current entities:', prev);
      const newEntities = { ...prev };
      const topic = newEntities.topics.find(t => t.name === topicName);
      if (topic) {
        const subIndex = topic.subscriptions.findIndex(s => s.subscriptionName === subscriptionName);
        if (subIndex !== -1) {
          console.log('Updating subscription at index:', subIndex);
          topic.subscriptions[subIndex] = {
            ...topic.subscriptions[subIndex],
            activeMessageCount: parseInt(details.activeMessageCount),
            dlqMessageCount: parseInt(details.dlqMessageCount),
            messageCount: parseInt(details.messageCount)
          };
        }
      }
      console.log('Updated entities:', newEntities);
      return newEntities;
    });
  };

  const handleQueueUpdate = (queueName, details) => {
    setEntities(prev => {
      const newEntities = { ...prev };
      const queueIndex = newEntities.queues.findIndex(q => q.name === queueName);
      if (queueIndex !== -1) {
        newEntities.queues[queueIndex] = {
          ...newEntities.queues[queueIndex],
          ...details
        };
      }
      return newEntities;
    });
  };

  const handleQueueMessages = (queue) => {
    handleViewMessages({ ...queue, type: 'queue' }, { subscriptionName: queue.name }, false);
  };

  const handleQueueDlq = (queue) => {
    handleViewMessages({ ...queue, type: 'queue' }, { subscriptionName: queue.name }, true);
  };

  const handleQueueRefresh = (queueName) => {
    handleRefreshSubscription(queueName, queueName);
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
        setTreeData(transformToTreeData(data));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchServiceBusEntities();
  }, [connectionString]);

  useEffect(() => {
    console.log('Entities updated:', entities);
  }, [entities]);

  return (
    <div className="service-bus-explorer">
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
      <div className="explorer-header">
        <h2>Service Bus Explorer</h2>
        <Button
          icon="pi pi-sign-out"
          className="p-button-text p-button-sm"
          tooltip="Sign Out"
          tooltipOptions={{ position: 'left' }}
          onClick={onSignOut}
        />
      </div>
      <div className="explorer-content">
        <div className="explorer-layout">
          <div className="tree-section">
            {loading ? (
              <div className="loading">Loading Service Bus entities...</div>
            ) : error ? (
              <div className="error">Error: {error}</div>
            ) : (
              <Tree
                value={treeData}
                expandedKeys={expandedKeys}
                onToggle={e => setExpandedKeys(e.value)}
                selectionMode="single"
                onSelect={handleSelect}
                className="w-full"
              />
            )}
          </div>

          <div className="subscriptions-section">
            {selectedTopic && !selectedSubscription && (
              <>
                <h3>{selectedTopic.name} Subscriptions</h3>
                <DataTable
                  value={selectedTopic?.subscriptions || []}
                  className="subscription-table"
                  loading={loading}
                  dataKey="subscriptionName"
                  scrollable
                  scrollHeight="400px"
                  onValueChange={(e) => {
                    console.log('DataTable value changed:', e.value);
                  }}
                >
                  <Column 
                    field="subscriptionName" 
                    header="Name" 
                    body={row => {
                      console.log('Rendering subscription row:', row);
                      return row.subscriptionName;
                    }}
                  />
                  <Column 
                    field="activeMessageCount" 
                    header="Active Messages" 
                    body={row => {
                      console.log('Active count for:', row.subscriptionName, row.activeMessageCount);
                      return row.activeMessageCount;
                    }}
                  />
                  <Column 
                    field="dlqMessageCount" 
                    header="DLQ Messages" 
                    body={row => {
                      console.log('DLQ count for:', row.subscriptionName, row.dlqMessageCount);
                      return row.dlqMessageCount;
                    }}
                  />
                  <Column 
                    field="messageCount" 
                    header="Total Messages" 
                    body={row => {
                      console.log('Total count for:', row.subscriptionName, row.messageCount);
                      return row.messageCount;
                    }}
                  />
                  <Column 
                    body={subscriptionActionsTemplate} 
                    header="Actions" 
                    style={{ width: '150px' }}
                  />
                </DataTable>
              </>
            )}
            {selectedSubscription && (
              <SubscriptionActions
                topic={selectedTopic}
                subscription={selectedSubscription}
                onViewMessages={(topic, sub, isDlq) => handleViewMessages(topic, sub, isDlq)}
                onRefresh={handleRefreshSubscription}
                onSubscriptionUpdate={handleSubscriptionUpdate}
              />
            )}
            {selectedQueue && (
              <QueueActions
                queue={selectedQueue}
                onViewMessages={handleQueueMessages}
                onViewDlq={handleQueueDlq}
                onRefresh={handleQueueRefresh}
                onQueueUpdate={handleQueueUpdate}
              />
            )}
          </div>
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
          onRefresh={handleRefreshSubscription}
          onSubscriptionUpdate={handleSubscriptionUpdate}
        />
      )}
    </div>
  );
};

export default ServiceBusExplorer;
