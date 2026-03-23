/*
// Load environment variables from .env file
require('dotenv').config();

// Import the tools we installed
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

// Create the express app — this is your server
const app = express();
const PORT = process.env.PORT || 3000;

// CORS allows your frontend HTML files to talk to this server
// Without this the browser would block the connection
app.use(cors());

// This tells express to understand JSON data sent from the frontend
app.use(express.json());

// Create the Anthropic client using your API key from .env
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── HEALTH CHECK ───────────────────────────────────────────
// This is a simple test endpoint — if you visit localhost:3000
// in your browser and see "SUWE backend is running", it works
app.get('/', (req, res) => {
  res.json({ message: 'SUWE backend is running' });
});

// ─── AI ENDPOINT ────────────────────────────────────────────
// This is the main endpoint your frontend will call
// It receives the vendor's business data and returns AI insights
app.post('/api/insights', async (req, res) => {
  try {
    // Pull the vendor data sent from the frontend
    const { vendorName, sales, totalRevenue, totalCost, topProducts } = req.body;

    // This is the instruction we give Claude — the "system prompt"
    // It tells Claude who it is and how to respond
    const systemPrompt = `You are SUWE's AI business advisor for Nigerian market vendors and traders. 
    You have deep knowledge of Nigerian markets, local commodity prices, seasonal patterns, 
    and the informal economy. You understand how prices fluctuate in markets like Lagos Island, 
    Onitsha, Oshodi, Kano central market, and similar Nigerian trading hubs.
    
    Always respond in clear, simple English that a market trader can understand.
    Always give specific, actionable advice — not vague suggestions.
    Always reference Nigerian market realities — naira values, local goods, local seasons.
    Format your response as a JSON object with these exact keys:
    - profitSummary: a 2-sentence summary of how the business is doing
    - topRecommendation: the single most important thing the vendor should do right now
    - priceAlert: any price movement prediction for their top products in the next 2-4 weeks
    - restockAdvice: what to restock and when based on their sales pattern
    - healthScore: a number from 0 to 100 representing overall business health`;

    // This is the actual question we ask Claude, filled with the vendor's real data
    const userMessage = `Here is the sales data for ${vendorName}:
    - Total Revenue this week: ₦${totalRevenue}
    - Total Cost of Goods this week: ₦${totalCost}
    - Actual Profit: ₦${totalRevenue - totalCost}
    - Top selling products: ${topProducts}
    - Number of sales logged: ${sales}
    
    Please analyse this and give your insights.`;

    // Call Claude with the system prompt and user message
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage }
      ],
    });

    // Extract Claude's response text
    const responseText = message.content[0].text;

    // Parse the JSON that Claude returns
    const insights = JSON.parse(responseText);

    // Send it back to the frontend
    res.json({ success: true, insights });

  } catch (error) {
    console.error('Error calling Claude:', error);
    res.status(500).json({ success: false, error: 'Failed to generate insights' });
  }
});

// ─── START THE SERVER ────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`SUWE backend running on http://localhost:${PORT}`);
}); */


require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.get('/', (req, res) => {
  res.json({ message: 'SUWE backend is running' });
});

app.post('/api/insights', async (req, res) => {
  try {
    const { vendorName, sales, totalRevenue, totalCost, topProducts, productList } = req.body;

    const systemPrompt = `You are SUWE's AI business advisor for Nigerian market vendors and traders.
    You have deep knowledge of Nigerian markets, local commodity prices, seasonal patterns,
    and the informal economy. You understand price cycles in Lagos Island, Onitsha, Oshodi, 
    Kano central market and similar Nigerian trading hubs.

    You MUST respond with ONLY a valid JSON object — no explanation text before or after.
    No markdown, no backticks, just raw JSON.

    Return this exact structure:
    {
      "healthScore": <number 0-100>,
      "healthLabel": <"Critical" | "Struggling" | "Stable" | "Growing" | "Thriving">,
      "profitSummary": <2 sentence summary of business health in plain English>,
      "topRecommendation": <single most important action the vendor should take right now>,
      "priceAlert": <specific price movement prediction for their products in next 2-4 weeks>,
      "restockAdvice": <what to restock and when>,
      "weeklyTrend": {
        "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "revenue": [<7 estimated daily revenue figures based on typical Nigerian market patterns>],
        "cost": [<7 estimated daily cost figures — always lower than revenue>]
      },
      "productBreakdown": {
        "labels": [<array of product names from their list>],
        "salesShare": [<array of percentage share for each product, must add up to 100>]
      },
      "priceForcast": {
        "labels": ["Week 1", "Week 2", "Week 3", "Week 4"],
        "predicted": [<4 weekly price index figures from 0-100 showing price trend for their top product>]
      },
      "alerts": [
        <array of 2-3 short alert strings, e.g. "Tomato prices expected to rise 20% before Christmas">
      ]
    }`;

    const userMessage = `Vendor name: ${vendorName}
    Total Revenue this week: ₦${totalRevenue}
    Total Cost of Goods this week: ₦${totalCost}
    Profit this week: ₦${totalRevenue - totalCost}
    Number of sales transactions: ${sales}
    Products sold: ${topProducts}
    Full product list with quantities: ${JSON.stringify(productList)}
    
    Analyse this Nigerian market vendor's data and return the JSON insights.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage }
      ],
    });

    // Get Claude's raw response text
    const responseText = message.content[0].text;

    // Clean it just in case Claude adds any stray characters
    const cleaned = responseText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    // Parse into a real JavaScript object
    const insights = JSON.parse(cleaned);

    res.json({ success: true, insights });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate insights' });
  }
});

app.listen(PORT, () => {
  console.log(`SUWE backend running on http://localhost:${PORT}`);
});