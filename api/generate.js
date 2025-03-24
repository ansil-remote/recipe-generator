import axios from 'axios';

export default async (req, res) => {
  try {
    // Validate request body
    if (!req.body || !req.body.ingredients) {
      return res.status(400).json({
        error: "Invalid request",
        message: "Please provide ingredients parameter"
      });
    }

    // Validate environment configuration
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ Missing OpenAI API Key in environment variables');
      return res.status(500).json({
        error: "Server configuration error",
        message: "API key not configured"
      });
    }

    const { ingredients, carbs = 30 } = req.body;
    
    // Validate ingredients input
    if (typeof ingredients !== 'string' || ingredients.trim().length < 3) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Please provide valid ingredients list"
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

    // Make API call to OpenAI
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10-second timeout
      }
    );

    // Validate OpenAI response
    if (!response.data?.choices?.[0]?.message?.content) {
      console.error('❌ Invalid response structure from OpenAI:', response.data);
      return res.status(500).json({
        error: "AI service error",
        message: "Unexpected response format"
      });
    }

    // Parse and validate recipe JSON
    try {
      const recipe = JSON.parse(response.data.choices[0].message.content);
      
      // Validate required recipe fields
      if (!recipe.title || !recipe.ingredients || !recipe.instructions) {
        throw new Error("Missing required recipe fields");
      }
      
      return res.status(200).json(recipe);
      
    } catch (parseError) {
      console.error('❌ JSON Parsing Error:', parseError);
      console.debug('Raw AI Response:', response.data.choices[0].message.content);
      return res.status(500).json({
        error: "Data format error",
        message: "Failed to parse recipe response"
      });
    }

  } catch (error) {
    // Handle different error types
    console.error('🔥 API Error:', error.message);
    
    if (error.response) {
      console.error('OpenAI API Response Error:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    
    const errorMessage = error.response?.data?.error?.message || error.message;
    
    return res.status(500).json({ 
      error: "Recipe generation failed",
      details: errorMessage 
    });
    // Rate limiter (1 request every 5 seconds per IP)
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 5 * 1000, // 5 seconds
  max: 1
});

export default async (req, res) => {
  await limiter(req, res); // Apply rate limiting
  // ... rest of your code
};
  }
};
