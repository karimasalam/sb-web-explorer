const express = require('express');
const cors = require('cors');
const { ServiceBusClient, ServiceBusAdministrationClient, delay } = require('@azure/service-bus');

const app = express();
app.use(cors());
app.use(express.json());

// Store connection string temporarily (in production, use proper secret management)
let serviceBusConnection = null;

app.post('/api/connect', async (req, res) => {
    try {
        const { connectionString } = req.body;
        
        // Test the connection
        const adminClient = new ServiceBusAdministrationClient(connectionString);
        await adminClient.listQueues().next(); // Test if we can list queues
        
        serviceBusConnection = connectionString;
        res.json({ success: true });
    } catch (error) {
        console.error('Connection error:', error);
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/entities', async (req, res) => {
    try {
        if (!serviceBusConnection) {
            return res.status(400).json({ error: 'No connection string provided' });
        }

        const adminClient = new ServiceBusAdministrationClient(serviceBusConnection);
        
        // Fetch queues
        const queues = [];
        for await (const queue of adminClient.listQueues()) {
            try {
                const runtimeProperties = await adminClient.getQueueRuntimeProperties(queue.name);
                console.log(`Queue ${queue.name} runtime properties:`, JSON.stringify(runtimeProperties, null, 2));
                
                // Get the actual message count properties
                const totalMessageCount = typeof runtimeProperties.messageCount === 'number' 
                    ? runtimeProperties.messageCount 
                    : (runtimeProperties.totalMessageCount || 0);
                    
                const dlqCount = typeof runtimeProperties.deadLetterMessageCount === 'number'
                    ? runtimeProperties.deadLetterMessageCount
                    : 0;

                // Calculate active messages (total minus DLQ)
                const activeMessageCount = Math.max(0, totalMessageCount - dlqCount);

                queues.push({
                    name: queue.name,
                    status: queue.status,
                    createdAt: queue.createdAt,
                    messageCount: totalMessageCount,
                    activeMessageCount: activeMessageCount,
                    dlqMessageCount: dlqCount
                });
            } catch (error) {
                console.error(`Error getting runtime properties for queue ${queue.name}:`, error);
                queues.push({
                    name: queue.name,
                    status: queue.status,
                    createdAt: queue.createdAt,
                    messageCount: 0,
                    activeMessageCount: 0,
                    dlqMessageCount: 0
                });
            }
        }

        // Fetch topics and their subscriptions
        const topics = [];
        for await (const topic of adminClient.listTopics()) {
            const subscriptions = [];
            for await (const subscription of adminClient.listSubscriptions(topic.name)) {
                try {
                    const runtimeProperties = await adminClient.getSubscriptionRuntimeProperties(
                        topic.name,
                        subscription.subscriptionName
                    );
                    console.log(`Subscription ${topic.name}/${subscription.subscriptionName} runtime properties:`, 
                        JSON.stringify(runtimeProperties, null, 2));

                    // Get the actual message count properties
                    const totalMessageCount = typeof runtimeProperties.messageCount === 'number'
                        ? runtimeProperties.messageCount
                        : (runtimeProperties.totalMessageCount || 0);
                        
                    const dlqCount = typeof runtimeProperties.deadLetterMessageCount === 'number'
                        ? runtimeProperties.deadLetterMessageCount
                        : 0;

                    // Calculate active messages (total minus DLQ)
                    const activeMessageCount = Math.max(0, totalMessageCount - dlqCount);

                    subscriptions.push({
                        subscriptionName: subscription.subscriptionName,
                        status: subscription.status,
                        createdAt: subscription.createdAt,
                        messageCount: totalMessageCount,
                        activeMessageCount: activeMessageCount,
                        dlqMessageCount: dlqCount
                    });
                } catch (error) {
                    console.error(`Error getting runtime properties for subscription ${topic.name}/${subscription.subscriptionName}:`, error);
                    subscriptions.push({
                        subscriptionName: subscription.subscriptionName,
                        status: subscription.status,
                        createdAt: subscription.createdAt,
                        messageCount: 0,
                        activeMessageCount: 0,
                        dlqMessageCount: 0
                    });
                }
            }
            topics.push({
                name: topic.name,
                status: topic.status,
                createdAt: topic.createdAt,
                subscriptions: subscriptions
            });
        }

        console.log('Final response:', JSON.stringify({ queues, topics }, null, 2));
        res.json({ queues, topics });
    } catch (error) {
        console.error('Error fetching entities:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get messages from a subscription
app.get('/api/topics/:topicName/subscriptions/:subscriptionName/messages', async (req, res) => {
    try {
        const { topicName, subscriptionName } = req.params;
        const { page = 0, isDlq = false } = req.query;
        const pageSize = 100;
        const skip = parseInt(page) * pageSize;

        // Get total message count first
        const adminClient = new ServiceBusAdministrationClient(serviceBusConnection);
        const runtimeProperties = await adminClient.getSubscriptionRuntimeProperties(
            topicName, 
            subscriptionName
        );

        console.log('Runtime properties:', runtimeProperties);
        
        // Use activeMessageCount for active messages and deadLetterMessageCount for DLQ
        const totalMessages = isDlq === 'true' 
            ? runtimeProperties.deadLetterMessageCount 
            : runtimeProperties.activeMessageCount;

        // Calculate total pages
        const totalPages = Math.max(1, Math.ceil(totalMessages / pageSize));

        // Get messages for current page
        const client = new ServiceBusClient(serviceBusConnection);
        const receiver = client.createReceiver(topicName, subscriptionName, {
            receiveMode: "peekLock",
            subQueueType: isDlq === 'true' ? "deadLetter" : undefined
        });

        try {
            console.log(`Fetching messages for ${topicName}/${subscriptionName}:`, {
                page,
                skip,
                pageSize,
                totalMessages,
                totalPages,
                isDlq
            });

            const messages = await receiver.peekMessages(pageSize, { skip });
            const formattedMessages = messages.map(message => ({
                messageId: message.messageId,
                body: message.body,
                enqueuedTime: message.enqueuedTimeUtc,
                properties: message.applicationProperties,
                sequenceNumber: message.sequenceNumber
            }));

            res.json({ 
                messages: formattedMessages,
                totalMessages,
                currentPage: parseInt(page),
                totalPages,
                hasMore: parseInt(page) < totalPages - 1
            });
        } finally {
            await receiver.close();
            await client.close();
        }
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete messages from a subscription
app.delete('/api/topics/:topicName/subscriptions/:subscriptionName/messages', async (req, res) => {
    try {
        const { topicName, subscriptionName } = req.params;
        const { messageIds, isDlq = false } = req.body;

        if (!serviceBusConnection) {
            return res.status(400).json({ error: 'No connection string provided' });
        }

        const client = new ServiceBusClient(serviceBusConnection);
        const receiver = client.createReceiver(topicName, subscriptionName, {
            receiveMode: "peekLock",
            subQueueType: isDlq === true ? "deadLetter" : undefined
        });

        try {
            if (messageIds && messageIds.length > 0) {
                // Delete specific messages by receiving and completing them
                for (let i = 0; i < messageIds.length; i += 20) {
                    const batch = messageIds.slice(i, i + 20);
                    const messages = await receiver.receiveMessages(batch.length, { maxWaitTimeInMs: 5000 });
                    
                    for (const message of messages) {
                        if (batch.includes(message.messageId)) {
                            await receiver.completeMessage(message);
                        }
                    }
                }
            } else {
                // Delete all messages in batches
                while (true) {
                    const messages = await receiver.receiveMessages(20, { maxWaitTimeInMs: 5000 });
                    if (messages.length === 0) break;
                    
                    for (const message of messages) {
                        await receiver.completeMessage(message);
                    }

                    // Small delay to prevent overwhelming the service
                    await delay(100);
                }
            }

            res.json({ success: true });
        } finally {
            await receiver.close();
            await client.close();
        }
    } catch (error) {
        console.error('Error deleting messages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Resubmit messages to a subscription
app.post('/api/topics/:topicName/subscriptions/:subscriptionName/resubmit', async (req, res) => {
    try {
        const { topicName, subscriptionName } = req.params;
        const { messageIds, isDlq = false } = req.body;

        if (!serviceBusConnection) {
            return res.status(400).json({ error: 'No connection string provided' });
        }

        const client = new ServiceBusClient(serviceBusConnection);
        const sender = client.createSender(topicName);
        const receiver = client.createReceiver(topicName, subscriptionName, {
            receiveMode: "peekLock",
            subQueueType: isDlq === true ? "deadLetter" : undefined
        });

        try {
            // Process messages in batches
            for (let i = 0; i < messageIds.length; i += 20) {
                const batch = messageIds.slice(i, i + 20);
                const messages = await receiver.receiveMessages(batch.length, { maxWaitTimeInMs: 5000 });
                
                for (const message of messages) {
                    if (batch.includes(message.messageId)) {
                        // Create a new message with the same content and properties
                        await sender.sendMessages({
                            body: message.body,
                            messageId: `resubmit-${message.messageId}`,
                            correlationId: message.correlationId,
                            subject: message.subject,
                            contentType: message.contentType,
                            applicationProperties: message.applicationProperties
                        });

                        // Complete the original message
                        await receiver.completeMessage(message);
                    }
                }
            }

            res.json({ success: true });
        } finally {
            await receiver.close();
            await sender.close();
            await client.close();
        }
    } catch (error) {
        console.error('Error resubmitting messages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Refresh subscription details
app.get('/api/topics/:topicName/subscriptions/:subscriptionName/details', async (req, res) => {
    try {
        const { topicName, subscriptionName } = req.params;

        if (!serviceBusConnection) {
            return res.status(400).json({ error: 'No connection string provided' });
        }

        const adminClient = new ServiceBusAdministrationClient(serviceBusConnection);
        const runtimeProperties = await adminClient.getSubscriptionRuntimeProperties(
            topicName,
            subscriptionName
        );

        // Get the actual message count properties
        const totalMessageCount = typeof runtimeProperties.messageCount === 'number'
            ? runtimeProperties.messageCount
            : (runtimeProperties.totalMessageCount || 0);
            
        const dlqCount = typeof runtimeProperties.deadLetterMessageCount === 'number'
            ? runtimeProperties.deadLetterMessageCount
            : 0;

        // Calculate active messages (total minus DLQ)
        const activeMessageCount = Math.max(0, totalMessageCount - dlqCount);

        res.json({
            messageCount: totalMessageCount,
            activeMessageCount: activeMessageCount,
            dlqMessageCount: dlqCount
        });
    } catch (error) {
        console.error('Error refreshing subscription details:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
