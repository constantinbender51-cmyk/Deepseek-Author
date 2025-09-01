const axios = require('axios');

// === Configuration ===
// IMPORTANT: Replace this with your actual DeepSeek API Key.
const DEEPSEEK_API_KEY = 'sk-YOUR_API_KEY_HERE'; 

// The API endpoint for chat completions. This is correct as per the provided code.
const DEEPSEEK_CHAT_API = 'https://api.deepseek.com/v1/chat/completions';

/**
 * Sends a message to the DeepSeek chat API to get an AI-generated response.
 *
 * @param {Array} messages - An array of message objects to send to the API. 
 * Each object should have a 'role' and 'content'.
 * e.g., [{ role: "user", content: "What is the capital of France?" }]
 * @returns {Promise<string|null>} A promise that resolves with the content of the AI's response,
 * or null if an error occurs.
 */
async function callDeepSeekChat(messages) {
  if (DEEPSEEK_API_KEY === 'sk-YOUR_API_KEY_HERE') {
    console.error('API key not configured. Please update the DEEPSEEK_API_KEY constant.');
    return null;
  }
  
  try {
    const response = await axios.post(DEEPSEEK_CHAT_API, {
      model: "deepseek-chat", // The model to use
      messages: messages,
      temperature: 0.7,        // Controls the randomness of the response
      max_tokens: 1000         // The maximum number of tokens to generate
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      }
    });

    const aiResponseContent = response.data.choices[0]?.message?.content;
    return aiResponseContent;
  } catch (error) {
    console.error(`Error calling DeepSeek API: ${error.response?.data?.error?.message || error.message}`);
    return null;
  }
}

// === Example Usage ===
async function main() {
  const examplePrompt = [
    {
      role: "user",
      content: "Explain the concept of futures trading in simple terms."
    }
  ];

  console.log("Sending a request to the DeepSeek API...");
  const aiResponse = await callDeepSeekChat(examplePrompt);

  if (aiResponse) {
    console.log("\nDeepSeek's response:");
    console.log(aiResponse);
  } else {
    console.log("Failed to get a response from the API.");
  }
}

// Run the example
main();
