// Load environment variables
require('dotenv').config();

// Import the consolidated bot
const ConsolidatedTelegramTradingBot = require('./src/trading-bot');

// Validate required environment variables
const requiredEnvVars = [
    'TELEGRAM_BOT_TOKEN',
    'AUTHORIZED_USERS',
    'ETHERSCAN_API_KEY',
    'SOLSCAN_API_KEY'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingEnvVars.forEach(envVar => console.error(`   - ${envVar}`));
    process.exit(1);
}

// Configuration object
const config = {
    // Bot Configuration
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    AUTHORIZED_USERS: process.env.AUTHORIZED_USERS,

    // Blockchain API Keys
    ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
    SOLSCAN_API_KEY: process.env.SOLSCAN_API_KEY,

    // Risk Management Settings
    maxLossPerTrade: parseFloat(process.env.MAX_LOSS_PER_TRADE) || 2,
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS) || 6,
    maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE) || 5,

    // Trading Settings
    defaultTradingPair: process.env.DEFAULT_TRADING_PAIR || 'USDT',
    tradingEnabled: process.env.TRADING_ENABLED === 'true',
    testMode: process.env.TEST_MODE === 'true',
};

// Error handling for process-wide exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    // Implement your error notification system here
    // For example, send to admin's telegram
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // Implement your error notification system here
});

// Create and start the bot
async function startBot() {
    console.log('🚀 Starting Trading Bot...');
    
    try {
        const bot = new ConsolidatedTelegramTradingBot(config);
        await bot.start();

        console.log('✅ Bot successfully started');
        console.log(`👥 Authorized Users: ${config.AUTHORIZED_USERS}`);
        console.log(`🔬 Test Mode: ${config.testMode ? 'Enabled' : 'Disabled'}`);
        console.log(`📈 Trading: ${config.tradingEnabled ? 'Enabled' : 'Disabled'}`);

        // Periodic health check
        setInterval(() => {
            const memoryUsage = process.memoryUsage();
            console.log('\n🔍 Health Check:');
            console.log(`Memory Usage: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
        }, 300000); // Every 5 minutes

    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        process.exit(1);
    }
}

// Start the bot
startBot();