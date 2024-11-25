const { Telegraf, Scenes, session } = require('telegraf');
const { CrossChainTradingBot } = require('./trading-bot');
const schedule = require('node-schedule');
const { EnhancedTradingAnalyzer } = require('./tradingDecision');


class RiskManager {
    constructor(config) {
        this.maxLossPerTrade = config.maxLossPerTrade || 2;
        this.maxDailyLoss = config.maxDailyLoss || 6;
        this.maxPositionSize = config.maxPositionSize || 5;
        this.dailyLoss = 0;
        this.resetDailyLoss();
    }

    resetDailyLoss() {
        schedule.scheduleJob('0 0 * * *', () => {
            this.dailyLoss = 0;
        });
    }

    async validateTrade(trade) {
        if (this.dailyLoss >= this.maxDailyLoss) {
            return {
                valid: false,
                reason: `Daily loss limit of ${this.maxDailyLoss}% reached`
            };
        }

        const potentialLoss = trade.size * (trade.stopLoss / 100);
        if (potentialLoss > this.maxLossPerTrade) {
            return {
                valid: false,
                reason: `Trade risk exceeds maximum loss per trade of ${this.maxLossPerTrade}%`
            };
        }

        return { valid: true };
    }
}

class TechnicalStrategyManager {
    constructor(config) {
        this.strategies = new Map();
        this.riskManager = new RiskManager(config);
        this.initializeTechnicalStrategies();
    }

    initializeTechnicalStrategies() {
        // Breakout Strategy
        this.addStrategy('breakout', {
            name: 'Smart Breakout Trading',
            description: 'Trades breakouts with volume confirmation',
            entryConditions: {
                lookbackPeriod: 20,
                volumeIncrease: 50,
                breakoutPercentage: 2,
                stopLoss: 2,
                takeProfitTargets: [6, 12, 18],
                positionSizing: [
                    { percentage: 40, target: 6 },
                    { percentage: 30, target: 12 },
                    { percentage: 30, target: 18 }
                ]
            }
        });

        // Moving Average Strategy
        this.addStrategy('movingAverages', {
            name: 'Triple Moving Average Crossover',
            description: 'Uses 8, 21, 55 EMAs with volume confirmation',
            entryConditions: {
                fastEMA: 8,
                mediumEMA: 21,
                slowEMA: 55,
                volumeThreshold: 30,
                stopLoss: 2,
                takeProfitTargets: [5, 10, 15],
                positionSizing: [
                    { percentage: 40, target: 5 },
                    { percentage: 30, target: 10 },
                    { percentage: 30, target: 15 }
                ]
            }
        });

        // Volume Analysis Strategy
        this.addStrategy('volumeAnalysis', {
            name: 'Smart Volume Analysis',
            description: 'Trades based on volume patterns',
            entryConditions: {
                volumeIncreaseThreshold: 100,
                priceRangeThreshold: 1.5,
                stopLoss: 2,
                takeProfitTargets: [4, 8, 12],
                positionSizing: [
                    { percentage: 40, target: 4 },
                    { percentage: 30, target: 8 },
                    { percentage: 30, target: 12 }
                ]
            }
        });
    }

    addStrategy(id, strategy) {
        this.strategies.set(id, {
            ...strategy,
            enabled: false,
            timestamp: Date.now()
        });
    }

    async validateStrategy(strategy, trade) {
        return await this.riskManager.validateTrade({
            ...trade,
            stopLoss: strategy.entryConditions.stopLoss
        });
    }
}

class ConsolidatedTelegramTradingBot {
    constructor(config) {
        this.bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);
        this.tradingBot = new CrossChainTradingBot(config);
        this.strategyManager = new TechnicalStrategyManager(config);
        this.enhancedAnalyzer = new EnhancedTradingAnalyzer();
        this.authorizedUsers = new Set(config.AUTHORIZED_USERS.split(','));
        this.setupBot();
    }

    setupBot() {
        this.bot.use(session());
        this.bot.use(this.authMiddleware());
        this.setupCommands();
        this.setupErrorHandler();
        this.setupTradingEvents();
    }

    authMiddleware() {
        return async (ctx, next) => {
            if (!this.authorizedUsers.has(ctx.from.id.toString())) {
                await ctx.reply('⛔ Unauthorized access. Please contact admin for access.');
                return;
            }
            return next();
        };
    }

    setupCommands() {
        // Basic commands
        this.setupBasicCommands();
        // Strategy commands
        this.setupStrategyCommands();
        // Analysis commands
        this.setupAnalysisCommands();
    }

    setupAnalysisCommands() {
        this.bot.command('analyze', async (ctx) => {
            try {
                const [_, tokenAddress, chain] = ctx.message.text.split(' ');
                
                if (!tokenAddress || !chain) {
                    await ctx.reply('⚠️ Usage: /analyze <token_address> <chain>');
                    return;
                }

                await ctx.reply('🔍 Analyzing token... Please wait.');

                const analysis = await this.enhancedAnalyzer.analyzeTradeOpportunity(tokenAddress, chain);
                await this.sendAnalysisReport(ctx, analysis);
            } catch (error) {
                await ctx.reply(`❌ Error during analysis: ${error.message}`);
            }
        });
    }

      async sendAnalysisReport(ctx, analysis) {
        const { overallScore, details, recommendation } = analysis;
        
        const report = `📊 Token Analysis Report

🎯 Overall Score: ${(overallScore * 100).toFixed(2)}%

🐋 Whale Activity:
• Recent Buys: ${details.whaleActivity.buys.volume} tokens
• Avg Hold Time: ${details.whaleActivity.avgHoldTime} days
• Avg Trade Size: ${details.whaleActivity.avgTradeSize} tokens

📈 Token Metrics:
• Liquidity Depth: ${details.tokenMetrics.liquidityDepth}
• Volume Profile: ${details.tokenMetrics.volumeProfile}
• Price Impact: ${details.tokenMetrics.priceImpact}%

💰 Smart Money Flow:
• Inflow Rate: ${details.smartMoneyFlow.inflow}
• Outflow Rate: ${details.smartMoneyFlow.outflow}
• Pattern: ${details.smartMoneyFlow.pattern}

⚠️ Risk Assessment:
• Manipulation Risk: ${details.manipulationScore.washTrading}%
• Front Running Risk: ${details.manipulationScore.frontRunning}%
• Contract Safety: ${details.manipulationScore.contractSafety}%

📝 Recommendation:
• Action: ${recommendation.action}
• Position Size: ${recommendation.size}%
• Entry Timing: ${recommendation.timing}
• Stop Loss: ${recommendation.stopLoss}%
• Take Profit: ${recommendation.takeProfit.join('%, ')}%`;

        await ctx.reply(report);
    }

    setupBasicCommands() {
        this.bot.command('start', async (ctx) => {
            await ctx.reply(
                '🤖 Welcome to Cross-Chain Trading Bot!\n\n' +
                'Available commands:\n' +
                '/watch <token_address> <chain> - Monitor a token\n' +
                '/analyze <token_address> <chain> - Analyze a token\n' +
                '/portfolio - View your portfolio\n' +
                '/settings - Configure bot settings\n' +
                '/status - View bot status\n' +
                '/strategy - Manage trading strategies\n' +
                '/help - Show this help message'
            );
        });

        this.bot.command('portfolio', async (ctx) => {
            try {
                const portfolio = await this.tradingBot.getPortfolio();
                await this.sendPortfolioReport(ctx, portfolio);
            } catch (error) {
                await ctx.reply(`❌ Error: ${error.message}`);
            }
        });

        this.bot.command('settings', (ctx) => {
            this.sendSettingsMenu(ctx);
        });

        this.bot.command('status', async (ctx) => {
            const status = await this.tradingBot.getStatus();
            await this.sendStatusReport(ctx, status);
        });
    }

    setupStrategyCommands() {
        this.bot.command('strategy', async (ctx) => {
            const [_, action, strategyId] = ctx.message.text.split(' ');
            
            if (action === 'list') {
                const strategies = Array.from(this.strategyManager.strategies.entries())
                    .map(([id, strategy]) => `
🔹 ${id}: ${strategy.name}
📝 ${strategy.description}
🛑 Stop Loss: ${strategy.entryConditions.stopLoss}%
📈 Take Profits: ${strategy.entryConditions.takeProfitTargets.join('%, ')}%
                    `).join('\n');
                
                await ctx.reply(`📊 Available Strategies:\n${strategies}`);
                return;
            }

            if (action === 'activate' && strategyId) {
                const strategy = this.strategyManager.strategies.get(strategyId);
                if (strategy) {
                    strategy.enabled = true;
                    await ctx.reply(`✅ Strategy "${strategy.name}" activated`);
                    return;
                }
            }
        });

        this.bot.command('settp', async (ctx) => {
            const [_, strategyId, ...targets] = ctx.message.text.split(' ');
            
            if (!strategyId || targets.length === 0) {
                await ctx.reply('⚠️ Usage: /settp <strategy> <target1> <target2> <target3>');
                return;
            }

            const strategy = this.strategyManager.strategies.get(strategyId);
            if (!strategy) {
                await ctx.reply('❌ Strategy not found');
                return;
            }

            const takeProfitTargets = targets.map(t => parseFloat(t))
                                           .filter(t => !isNaN(t))
                                           .sort((a, b) => a - b);

            strategy.entryConditions.takeProfitTargets = takeProfitTargets;
            strategy.entryConditions.positionSizing = this.calculatePositionSizing(takeProfitTargets);

            await ctx.reply(this.formatTakeProfitUpdate(strategyId, takeProfitTargets, strategy));
        });

        this.bot.command('watchwhales', async (ctx) => {
            const [_, tokenAddress, chain] = ctx.message.text.split(' ');
            
            if (!tokenAddress || !chain) {
                await ctx.reply('⚠️ Usage: /watchwhales <token_address> <chain>');
                return;
            }

            try {
                const whaleActivity = await this.enhancedAnalyzer.getWhaleActivity(tokenAddress, chain);
                const whaleScore = this.enhancedAnalyzer.calculateWhaleScore({
                    recentBuys: whaleActivity.buys,
                    holdingTime: whaleActivity.avgHoldTime,
                    tradeSize: whaleActivity.avgTradeSize,
                    walletAge: whaleActivity.walletAge
                });

                await ctx.reply(`🐋 Whale Activity Report

Score: ${(whaleScore * 100).toFixed(2)}%
Recent Buy Volume: ${whaleActivity.buys.volume}
Average Holding Time: ${whaleActivity.avgHoldTime} days
Average Trade Size: ${whaleActivity.avgTradeSize}
Wallet Age: ${whaleActivity.walletAge} days`);
            } catch (error) {
                await ctx.reply(`❌ Error monitoring whale activity: ${error.message}`);
            }
        });

        this.bot.command('analyze', async (ctx) => {
            const [_, symbol] = ctx.message.text.split(' ');
            if (!symbol) {
                await ctx.reply('⚠️ Usage: /analyze <symbol>');
                return;
            }

            try {
                const analysis = await this.analyzePair(symbol);
                await this.sendAnalysisReport(ctx, analysis);
            } catch (error) {
                await ctx.reply(`❌ Error: ${error.message}`);
            }
        });
    }

    async analyzePair(symbol) {
        // Implement technical analysis based on active strategy
        const activeStrategy = Array.from(this.strategyManager.strategies.values())
            .find(strategy => strategy.enabled);
        
        if (!activeStrategy) {
            throw new Error('No active strategy found');
        }

        // Get market data and perform analysis
        const analysis = await this.performAnalysis(symbol, activeStrategy);
        return analysis;
    }

    async executeTrade(trade) {
        const activeStrategy = Array.from(this.strategyManager.strategies.values())
            .find(strategy => strategy.enabled);
        
        if (!activeStrategy) {
            throw new Error('No active strategy found');
        }

        const validation = await this.strategyManager.validateStrategy(activeStrategy, trade);
        if (!validation.valid) {
            throw new Error(`Trade validation failed: ${validation.reason}`);
        }

        trade.takeProfitTargets = activeStrategy.entryConditions.takeProfitTargets
            .map((target, index) => ({
                price: trade.entryPrice * (1 + target / 100),
                positionSize: activeStrategy.entryConditions.positionSizing[index].percentage / 100 * trade.size
            }));

        trade.stopLoss = activeStrategy.entryConditions.stopLoss;

        return await this.executeTrade(trade);
    }

    setupTradingEvents() {
        this.tradingBot.on('trade', async (trade) => {
            // Enhance trade analysis with the new analyzer
            const enhancedAnalysis = await this.enhancedAnalyzer.analyzeTradeOpportunity(
                trade.tokenAddress,
                trade.chain
            );

            // Only proceed with trade if analysis score is favorable
            if (enhancedAnalysis.overallScore >= 0.7) {
                for (const userId of this.authorizedUsers) {
                    await this.sendTradeNotification(userId, {
                        ...trade,
                        analysis: enhancedAnalysis
                    });
                }
            } else {
                console.log(`Trade rejected due to low analysis score: ${enhancedAnalysis.overallScore}`);
            }
        });

        this.tradingBot.on('error', async (error) => {
            for (const userId of this.authorizedUsers) {
                await this.sendErrorNotification(userId, error);
            }
        });

        this.tradingBot.on('analysis', async (analysis) => {
            if (analysis.opportunity.score >= 80) {
                for (const userId of this.authorizedUsers) {
                    await this.sendOpportunityAlert(userId, analysis);
                }
            }
        });
    }

    // Helper methods
    calculatePositionSizing(targets) {
        return targets.map((target, index) => ({
            percentage: index === 0 ? 40 : 30,
            target: target
        }));
    }

    async sendTradeNotification(userId, trade) {
        const message = `🚨 Trade Alert!

${trade.action === 'BUY' ? '🟢' : '🔴'} ${trade.action} ${trade.symbol}
💰 Amount: ${trade.amount}
💵 Price: ${trade.price}
🎯 Target: ${trade.target}%
🛑 Stop Loss: ${trade.stopLoss}%

📊 Analysis Score: ${(trade.analysis.overallScore * 100).toFixed(2)}%
🐋 Whale Score: ${(trade.analysis.details.whaleScore * 100).toFixed(2)}%
⚡ Smart Money Score: ${(trade.analysis.details.smartMoneyScore * 100).toFixed(2)}%
⚠️ Risk Score: ${(trade.analysis.details.riskScore * 100).toFixed(2)}%`;

        try {
            await this.bot.telegram.sendMessage(userId, message);
        } catch (error) {
            console.error(`Failed to send trade notification to ${userId}:`, error);
        }
    }

    formatTakeProfitUpdate(strategyId, targets, strategy) {
        return `✅ Take profit targets set for ${strategyId}:
${targets.map((target, index) => 
    `Target ${index + 1}: ${target}% (${strategy.entryConditions.positionSizing[index].percentage}% of position)`
).join('\n')}`;
    }
    
    setupErrorHandler() {
        this.bot.catch((error) => {
            console.error('Bot error:', error);
        });
    }

    async start() {
        this.tradingBot.start();
        await this.bot.launch();
        console.log('🤖 Consolidated Trading Bot is running');

        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }
}

// Configuration
const config = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    AUTHORIZED_USERS: process.env.AUTHORIZED_USERS,
    ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
    SOLSCAN_API_KEY: process.env.SOLSCAN_API_KEY,
    maxLossPerTrade: 2,
    maxDailyLoss: 6,
    maxPositionSize: 5
};

module.exports = ConsolidatedTelegramTradingBot;