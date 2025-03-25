import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const LRUCache = require('lru-cache');
import axios from 'axios';

// Rate limiter configuration
const rateLimitCache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 // 1-minute window
});

export default async (req, res) => {
  // Ensure only POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ 
      error: "Method Not Allowed", 
      message: "Use POST requests only" 
    });
  }

  // Rate limiting (5 requests/minute per IP)
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const limit = 5;
  if (rateLimitCache.get(ip) >= limit) {
    return res.status(429).json({ 
      error: "Too many requests", 
      message: "Limit: 5 requests/minute" 
    });
  }
  rateLimitCache.set(ip, (rateLimitCache.get(ip) || 0) + 1);

  try {
    // Parse request body
    const body = await req.json().catch(() => null);
    if (!body || !body.ingredients?.trim()) {
      return res.status(400).json({ 
        error: "Invalid request", 
        message: "Provide ingredients (e.g., 'chicken, broccoli')" 
      });
    }

    // Validate OpenAI key
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ Missing OpenAI API Key');
      return res.status(500).json({ 
        error: "Server error", 
        message: "API key not configured" 
      });
    }

    const { ingredients, carbs = 30 } = body;

    // Validate input
    if (typeof ingredients !== 'string' || ingredients.trim().length < 3) {
      return res.status(400).json({ 
        error: "Invalid input", 
        message: "Enter at least 3 characters" 
      });
    }

    // Structured AI Prompt
    const prompt = `You are a diabetes nutritionist AI. Strictly follow these rules:
    1. Create a recipe using: ${ingredients}
    2. Requirements:
       - Low glycemic index (GI < 50)
       - Max ${carbs}g net carbs/serving
       - Diabetic-friendly substitutions
       - Cooking time estimate
    3. Format as VALID JSON:
    {
      "title": "Recipe name",
      "ingredients": ["1 cup ingredient (GI=XX)"],
      "instructions": ["Step 1..."],
      "nutrition": {"carbs": "Xg", "protein": "Xg", "gi": X},
      "tips": "Diabetes-friendly tip"
    }
    Do NOT include markdown or extra text. Only JSON.`;

    // OpenAI API Call
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5, // Controls creativity (0=strict, 1=random)
        response_format: { type: "json_object" } // Force JSON
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000 // 20-second timeout
      }
    );

    // Validate response
    const content = response.data.choices[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ 
        error: "Empty response", 
        message: "OpenAI returned no content" 
      });
    }

    // Parse JSON
    try {
      const recipe = JSON.parse(content);
      if (!recipe.title || !recipe.ingredients || !recipe.instructions) {
        throw new Error("Missing required fields");
      }
      return res.status(200).json(recipe);
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', content);
      return res.status(500).json({ 
        error: "Invalid format", 
        message: "AI returned invalid JSON" 
      });
    }

  } catch (error) {
    console.error('🔥 API Error:', error.message);
    return res.status(500).json({ 
      error: "Generation failed", 
      details: error.response?.data?.error?.message || error.message 
    });
  }
};
