const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

// Middleware - Enhanced CORS for JSONP
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'https://malawiwaves.neocities.org',
        'https://gdfarms-blip.github.io',
        'https://*.neocities.org',
        'http://*.neocities.org',
        '*'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// JSONP middleware - enhanced to handle various JSONP formats
app.use((req, res, next) => {
    // Check if this is a JSONP request
    const callbackParam = req.query.callback || req.query.jsonp || req.query.jsoncallback;
    if (callbackParam) {
        req.isJSONP = true;
        req.jsonpCallback = callbackParam;
        
        // Parse data from query parameters for GET requests
        if (req.method === 'GET' && req.query.data) {
            try {
                req.body = JSON.parse(decodeURIComponent(req.query.data));
            } catch (error) {
                console.warn('Failed to parse JSONP data:', error);
            }
        }
    }
    next();
});

// Neon PostgreSQL connection with connection pooling
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://neondb_owner:npg_MJtAn0uFcr2R@ep-spring-pine-ad3s7zse-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', (client) => {
    console.log('✅ New client connected to Neon PostgreSQL');
});

pool.on('error', (err, client) => {
    console.error('❌ Database connection error:', err);
});

// Enhanced helper function to send JSONP or regular JSON response
const sendResponse = (req, res, data, statusCode = 200) => {
    res.status(statusCode);
    
    if (req.isJSONP && req.jsonpCallback) {
        // JSONP response - wrap in callback function
        res.set('Content-Type', 'application/javascript');
        res.set('X-Content-Type-Options', 'nosniff');
        
        // Sanitize callback name for security
        const sanitizedCallback = req.jsonpCallback.replace(/[^a-zA-Z0-9_.]/g, '');
        const jsonpResponse = `/***/ typeof ${sanitizedCallback} === 'function' && ${sanitizedCallback}(${JSON.stringify(data)});`;
        
        res.send(jsonpResponse);
    } else {
        // Regular JSON response
        res.json(data);
    }
};

// Health check endpoint with JSONP support
app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        const responseData = { 
            status: 'OK', 
            message: 'GDFarms API is running!',
            database: 'Connected',
            timestamp: new Date().toISOString(),
            jsonp_support: true,
            version: '2.0.0'
        };
        sendResponse(req, res, responseData);
    } catch (error) {
        const errorData = { 
            status: 'ERROR', 
            message: 'Database connection failed',
            error: error.message,
            timestamp: new Date().toISOString()
        };
        sendResponse(req, res, errorData, 500);
    }
});

// API info endpoint
app.get('/', (req, res) => {
    const responseData = {
        message: 'GDFarms API Server',
        frontend: 'https://malawiwaves.neocities.org',
        version: '2.0.0',
        health: '/health',
        status: 'running',
        jsonp_support: true,
        endpoints: {
            health: 'GET /health',
            user_data: 'GET/POST /api/neon/user-data',
            load_user_data: 'GET/POST /api/neon/load-user-data',
            delete_user_data: 'GET/POST /api/neon/delete-user-data',
            jsonp_test: 'GET /api/neon/jsonp-test'
        }
    };
    sendResponse(req, res, responseData);
});

// Enhanced parameter extraction for both GET and POST
const extractParams = (req) => {
    if (req.method === 'GET') {
        return {
            userId: req.query.userId || (req.body ? req.body.userId : null),
            data: req.body || (req.query.data ? JSON.parse(decodeURIComponent(req.query.data)) : null)
        };
    } else {
        return {
            userId: req.body.userId,
            data: req.body.data
        };
    }
};

// Save user data - enhanced JSONP support
const handleUserData = async (req, res) => {
    try {
        const { userId, data } = extractParams(req);
        
        if (!userId) {
            return sendResponse(req, res, { 
                success: false, 
                error: 'User ID is required' 
            }, 400);
        }

        console.log(`💾 Saving data for user: ${userId}`);
        
        const result = await pool.query(
            `INSERT INTO user_data (user_id, data) 
             VALUES ($1, $2) 
             ON CONFLICT (user_id) 
             DO UPDATE SET data = $2, updated_at = NOW() 
             RETURNING *`,
            [userId, data]
        );
        
        sendResponse(req, res, { 
            success: true, 
            data: result.rows[0],
            message: 'Data saved successfully',
            userId: userId
        });
    } catch (error) {
        console.error('❌ Error saving user data:', error);
        sendResponse(req, res, { 
            success: false, 
            error: error.message,
            code: 'SAVE_ERROR'
        }, 500);
    }
};

app.post('/api/neon/user-data', handleUserData);
app.get('/api/neon/user-data', handleUserData);

// Load user data - enhanced JSONP support
const handleLoadUserData = async (req, res) => {
    try {
        const { userId } = extractParams(req);
        
        if (!userId) {
            return sendResponse(req, res, { 
                success: false, 
                error: 'User ID is required' 
            }, 400);
        }

        console.log(`📥 Loading data for user: ${userId}`);
        
        const result = await pool.query(
            'SELECT data, updated_at FROM user_data WHERE user_id = $1',
            [userId]
        );
        
        if (result.rows.length > 0) {
            sendResponse(req, res, { 
                success: true, 
                data: result.rows[0].data,
                updatedAt: result.rows[0].updated_at,
                message: 'Data loaded successfully',
                userId: userId
            });
        } else {
            sendResponse(req, res, { 
                success: true, 
                data: null,
                message: 'No data found for user',
                userId: userId
            });
        }
    } catch (error) {
        console.error('❌ Error loading user data:', error);
        sendResponse(req, res, { 
            success: false, 
            error: error.message,
            code: 'LOAD_ERROR'
        }, 500);
    }
};

app.post('/api/neon/load-user-data', handleLoadUserData);
app.get('/api/neon/load-user-data', handleLoadUserData);

// Delete user data - enhanced JSONP support
const handleDeleteUserData = async (req, res) => {
    try {
        const { userId } = extractParams(req);
        
        if (!userId) {
            return sendResponse(req, res, { 
                success: false, 
                error: 'User ID is required' 
            }, 400);
        }

        console.log(`🗑️ Deleting data for user: ${userId}`);
        
        await pool.query('DELETE FROM user_data WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM products WHERE user_id = $1', [userId]);
        
        sendResponse(req, res, { 
            success: true, 
            message: 'User data deleted successfully',
            userId: userId
        });
    } catch (error) {
        console.error('❌ Error deleting user data:', error);
        sendResponse(req, res, { 
            success: false, 
            error: error.message,
            code: 'DELETE_ERROR'
        }, 500);
    }
};

app.post('/api/neon/delete-user-data', handleDeleteUserData);
app.get('/api/neon/delete-user-data', handleDeleteUserData);

// Enhanced transaction endpoints with JSONP
const handleTransaction = async (req, res) => {
    try {
        const { userId, transaction } = extractParams(req);
        
        if (!userId || !transaction) {
            return sendResponse(req, res, { 
                success: false, 
                error: 'User ID and transaction data are required' 
            }, 400);
        }

        const result = await pool.query(
            `INSERT INTO transactions 
             (user_id, date, product_id, product_name, quantity, order_price, selling_price, 
              transport_to_market, transport_from_market, total_cost, total_revenue, profit) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
             RETURNING *`,
            [
                userId, 
                transaction.date, 
                transaction.productId, 
                transaction.productName,
                transaction.quantity, 
                transaction.orderPrice, 
                transaction.sellingPrice,
                transaction.transportToMarket || 0, 
                transaction.transportFromMarket || 0,
                transaction.totalCost || 0, 
                transaction.totalRevenue || 0, 
                transaction.profit || 0
            ]
        );
        
        sendResponse(req, res, { 
            success: true, 
            data: result.rows[0],
            message: 'Transaction saved successfully'
        });
    } catch (error) {
        console.error('Error saving transaction:', error);
        sendResponse(req, res, { 
            success: false, 
            error: error.message 
        }, 500);
    }
};

app.post('/api/neon/transaction', handleTransaction);
app.get('/api/neon/transaction', handleTransaction);

// Enhanced products endpoints with JSONP
const handleProducts = async (req, res) => {
    try {
        const { userId } = extractParams(req);
        
        if (!userId) {
            return sendResponse(req, res, { 
                success: false, 
                error: 'User ID is required' 
            }, 400);
        }

        const result = await pool.query(
            'SELECT * FROM products WHERE user_id = $1 ORDER BY name',
            [userId]
        );
        
        sendResponse(req, res, { 
            success: true, 
            data: result.rows,
            count: result.rows.length,
            message: 'Products loaded successfully'
        });
    } catch (error) {
        console.error('Error loading products:', error);
        sendResponse(req, res, { 
            success: false, 
            error: error.message 
        }, 500);
    }
};

app.post('/api/neon/products', handleProducts);
app.get('/api/neon/products', handleProducts);

// Get database stats with JSONP support
app.get('/api/neon/stats', async (req, res) => {
    try {
        const userDataCount = await pool.query('SELECT COUNT(*) FROM user_data');
        const transactionsCount = await pool.query('SELECT COUNT(*) FROM transactions');
        const productsCount = await pool.query('SELECT COUNT(*) FROM products');
        
        const responseData = {
            success: true,
            data: {
                user_data: parseInt(userDataCount.rows[0].count),
                transactions: parseInt(transactionsCount.rows[0].count),
                products: parseInt(productsCount.rows[0].count),
                server_time: new Date().toISOString(),
                jsonp_requests: req.isJSONP ? 'supported' : 'not_used'
            }
        };
        sendResponse(req, res, responseData);
    } catch (error) {
        console.error('Error getting stats:', error);
        sendResponse(req, res, { 
            success: false, 
            error: error.message 
        }, 500);
    }
});

// Enhanced JSONP test endpoint with multiple formats
app.get('/api/neon/jsonp-test', (req, res) => {
    const testData = {
        success: true,
        message: 'JSONP is working perfectly!',
        timestamp: new Date().toISOString(),
        method: req.method,
        jsonp_support: true,
        query: req.query,
        request_type: req.isJSONP ? 'JSONP' : 'Regular JSON'
    };
    sendResponse(req, res, testData);
});

// JSONP demo endpoint for frontend testing
app.get('/api/neon/jsonp-demo', (req, res) => {
    const demoData = {
        success: true,
        message: '🎉 JSONP Demo Successful!',
        data: {
            app: 'GDFarms',
            version: '2.0.0',
            feature: 'Neon PostgreSQL Sync',
            status: 'Operational',
            jsonp: 'Enabled'
        },
        timestamp: new Date().toISOString()
    };
    sendResponse(req, res, demoData);
});

// 404 handler with JSONP support
app.use('*', (req, res) => {
    const errorData = { 
        success: false, 
        error: 'Endpoint not found',
        available_endpoints: [
            'GET /',
            'GET /health',
            'GET/POST /api/neon/user-data',
            'GET/POST /api/neon/load-user-data',
            'GET/POST /api/neon/delete-user-data',
            'GET/POST /api/neon/transaction',
            'GET/POST /api/neon/products',
            'GET /api/neon/stats',
            'GET /api/neon/jsonp-test',
            'GET /api/neon/jsonp-demo'
        ],
        jsonp_support: true,
        jsonp_usage: 'Add ?callback=yourFunction to any GET endpoint'
    };
    sendResponse(req, res, errorData, 404);
});

// Enhanced error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Unhandled error:', error);
    const errorData = { 
        success: false, 
        error: 'Internal server error',
        message: error.message,
        code: 'SERVER_ERROR',
        timestamp: new Date().toISOString()
    };
    sendResponse(req, res, errorData, 500);
});

// Server startup
app.listen(port, () => {
    console.log(`🚀 GDFarms Server v2.0.0 running on port ${port}`);
    console.log(`📊 Health check: http://localhost:${port}/health`);
    console.log(`🌐 Frontend: https://malawiwaves.neocities.org`);
    console.log(`🗄️ Database: Neon PostgreSQL connected`);
    console.log(`📡 JSONP Support: ✅ ENABLED`);
    console.log(`🎯 Test JSONP: https://gdfarms-app-gdjf.onrender.com/api/neon/jsonp-test?callback=test`);
    console.log(`🎯 Demo JSONP: https://gdfarms-app-gdjf.onrender.com/api/neon/jsonp-demo?callback=demo`);
});
