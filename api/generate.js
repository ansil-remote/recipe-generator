import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import axios from 'axios';

export default async (req, res) => {
  const { ingredients, carbs = 30 } = req.body;
  
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

  try {
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
        }
      }
    );

    const recipe = JSON.parse(response.data.choices[0].message.content);
    res.status(200).json(recipe);

  } catch (error) {
    res.status(500).json({ 
      error: "Recipe generation failed",
      details: error.response?.data || error.message 
    });
  }
};