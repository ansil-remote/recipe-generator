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
  // ✅ Ensure only POST requests are allowed
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed", message: "Use POST request only" });
  }

  // ✅ Rate limiting by IP
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const limit = 5; // Allow 5 requests per minute

  if (rateLimitCache.get(ip) >= limit) {
    return res.status(429).json({
      error: "Too many requests",
      message: "Please try again in a minute"
    });
  }
  rateLimitCache.set(ip, (rateLimitCache.get(ip) || 0) + 1);

  try {
    // ✅ Parse request body safely
    const body = await req.json().catch(() => null);

    if (!body || !body.ingredients?.trim()) {
      return res.status(400).json({
        error: "Invalid request",
        message: "Please provide an 'ingredients' parameter"
      });
    }

    // ✅ Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ Missing OpenAI API Key');
      return res.status(500).json({
        error: "Server error",
        message: "API key not configured"
      });
    }

    const { ingredients, carbs = 30 } = body;

    // ✅ Validate ingredients input
    if (typeof ingredients !== 'string' || ingredients.trim().length < 3) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Ingredients list must be at least 3 characters long"
      });
    }

    const prompt = `You are a diabetes nutritionist AI. Create a recipe with:
    - Ingredients: ${ingredients}
    - Requirements:
      * Low glycemic index (GI < 50)
      * Max ${carbs}g net carbs/serving
      * Diabetic-friendly substitutions
      * Cooking time estimate
    Format as JSON:
    {
      "title": "Recipe name",
      "ingredients": ["1 cup ingredient (GI=XX)"],
      "instructions": ["Step 1..."],
      "nutrition": {"carbs": "Xg", "protein": "Xg", "gi": X},
      "tips": "Diabetes-friendly tip"
    }`;

    // ✅ Call OpenAI API
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    // ✅ Ensure response contains valid content
    const content = response.data.choices[0]?.message?.content;
    if (!content) {
      console.error('❌ Empty AI response');
      return res.status(500).json({
        error: "AI service error",
        message: "No content received from OpenAI"
      });
    }

    // ✅ Parse and validate JSON
    try {
      const recipe = JSON.parse(content);
      if (!recipe.title || !recipe.ingredients || !recipe.instructions) {
        throw new Error("Missing required fields in recipe");
      }
      return res.status(200).json(recipe);
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError.message);
      console.debug('Raw Content:', content);
      return res.status(500).json({
        error: "Format error",
        message: "Failed to parse recipe JSON"
      });
    }

  } catch (error) {
    console.error('🔥 API Error:', error.message);
    if (error.response) {
      console.error('OpenAI Error:', error.response.status, error.response.data);
    }
    return res.status(500).json({
      error: "Generation failed",
      details: error.response?.data?.error?.message || error.message
    });
  }
};
