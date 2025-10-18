const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'https://malawiwaves.neocities.org',
        'https://gdfarms-blip.github.io'
    ],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ 
            status: 'OK', 
            message: 'GDFarms API is running!',
            database: 'Connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'ERROR', 
            message: 'Database connection failed',
            error: error.message 
        });
    }
});

// API info endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'GDFarms API Server',
        frontend: 'https://malawiwaves.neocities.org',
        version: '1.0.0',
        health: '/health',
        status: 'running'
    });
});

// Save user data
app.post('/api/neon/user-data', async (req, res) => {
    try {
        const { userId, data } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'User ID is required' 
            });
        }

        const result = await pool.query(
            `INSERT INTO user_data (user_id, data) 
             VALUES ($1, $2) 
             ON CONFLICT (user_id) 
             DO UPDATE SET data = $2, updated_at = NOW() 
             RETURNING *`,
            [userId, data]
        );
        
        res.json({ 
            success: true, 
            data: result.rows[0],
            message: 'Data saved successfully'
        });
    } catch (error) {
        console.error('Error saving user data:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Load user data
app.post('/api/neon/load-user-data', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'User ID is required' 
            });
        }

        const result = await pool.query(
            'SELECT data FROM user_data WHERE user_id = $1',
            [userId]
        );
        
        if (result.rows.length > 0) {
            res.json({ 
                success: true, 
                data: result.rows[0].data,
                message: 'Data loaded successfully'
            });
        } else {
            res.json({ 
                success: true, 
                data: null,
                message: 'No data found for user'
            });
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Save individual transaction
app.post('/api/neon/transaction', async (req, res) => {
    try {
        const { userId, transaction } = req.body;
        
        if (!userId || !transaction) {
            return res.status(400).json({ 
                success: false, 
                error: 'User ID and transaction data are required' 
            });
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
        
        res.json({ 
            success: true, 
            data: result.rows[0],
            message: 'Transaction saved successfully'
        });
    } catch (error) {
        console.error('Error saving transaction:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Load transactions with filters
app.post('/api/neon/transactions', async (req, res) => {
    try {
        const { userId, filters = {} } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'User ID is required' 
            });
        }

        let query = 'SELECT * FROM transactions WHERE user_id = $1';
        const params = [userId];
        let paramCount = 1;
        
        if (filters.date) {
            paramCount++;
            query += ` AND date = $${paramCount}`;
            params.push(filters.date);
        }
        
        if (filters.productId) {
            paramCount++;
            query += ` AND product_id = $${paramCount}`;
            params.push(filters.productId);
        }

        if (filters.startDate && filters.endDate) {
            paramCount++;
            query += ` AND date BETWEEN $${paramCount}`;
            params.push(filters.startDate);
            paramCount++;
            query += ` AND $${paramCount}`;
            params.push(filters.endDate);
        }
        
        query += ' ORDER BY date DESC, created_at DESC';
        
        const result = await pool.query(query, params);
        
        res.json({ 
            success: true, 
            data: result.rows,
            count: result.rows.length,
            message: 'Transactions loaded successfully'
        });
    } catch (error) {
        console.error('Error loading transactions:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Save individual product
app.post('/api/neon/product', async (req, res) => {
    try {
        const { userId, product } = req.body;
        
        if (!userId || !product) {
            return res.status(400).json({ 
                success: false, 
                error: 'User ID and product data are required' 
            });
        }

        const result = await pool.query(
            `INSERT INTO products (user_id, name, order_price, selling_price, reserve_stock, market_stock) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             ON CONFLICT (user_id, name) 
             DO UPDATE SET 
                 order_price = $3, selling_price = $4, 
                 reserve_stock = $5, market_stock = $6, updated_at = NOW()
             RETURNING *`,
            [
                userId, 
                product.name, 
                product.orderPrice || 0, 
                product.sellingPrice || 0, 
                product.reserveStock || 0, 
                product.marketStock || 0
            ]
        );
        
        res.json({ 
            success: true, 
            data: result.rows[0],
            message: 'Product saved successfully'
        });
    } catch (error) {
        console.error('Error saving product:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Load products
app.post('/api/neon/products', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'User ID is required' 
            });
        }

        const result = await pool.query(
            'SELECT * FROM products WHERE user_id = $1 ORDER BY name',
            [userId]
        );
        
        res.json({ 
            success: true, 
            data: result.rows,
            count: result.rows.length,
            message: 'Products loaded successfully'
        });
    } catch (error) {
        console.error('Error loading products:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Delete user data
app.post('/api/neon/delete-user-data', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'User ID is required' 
            });
        }

        await pool.query('DELETE FROM user_data WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM products WHERE user_id = $1', [userId]);
        
        res.json({ 
            success: true, 
            message: 'User data deleted successfully' 
        });
    } catch (error) {
        console.error('Error deleting user data:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get database stats
app.get('/api/neon/stats', async (req, res) => {
    try {
        const userDataCount = await pool.query('SELECT COUNT(*) FROM user_data');
        const transactionsCount = await pool.query('SELECT COUNT(*) FROM transactions');
        const productsCount = await pool.query('SELECT COUNT(*) FROM products');
        
        res.json({
            success: true,
            data: {
                user_data: parseInt(userDataCount.rows[0].count),
                transactions: parseInt(transactionsCount.rows[0].count),
                products: parseInt(productsCount.rows[0].count),
                server_time: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        error: 'Endpoint not found',
        available_endpoints: [
            'GET /',
            'GET /health',
            'POST /api/neon/user-data',
            'POST /api/neon/load-user-data',
            'POST /api/neon/transaction',
            'POST /api/neon/transactions',
            'POST /api/neon/product',
            'POST /api/neon/products',
            'POST /api/neon/delete-user-data',
            'GET /api/neon/stats'
        ]
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        message: error.message 
    });
});

app.listen(port, () => {
    console.log(`🚀 GDFarms Server running on port ${port}`);
    console.log(`📊 Health check: http://localhost:${port}/health`);
    console.log(`🌐 Frontend: https://malawiwaves.neocities.org`);
    console.log(`🗄️ Database: Neon PostgreSQL connected`);
});
