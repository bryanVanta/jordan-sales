// AI Service to evaluate the relevance of search results
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

/**
 * Evaluate if a search result is worth scraping.
 * @param {string} title - The title of the search result.
 * @param {string} url - The URL of the search result.
 * @returns {Promise<boolean>} - True if worth scraping, false otherwise.
 */
const isWorthScraping = async (title, url) => {
  const specificHotels = ["Shangri-La", "Marriott", "Four Seasons", "InterContinental"];

  // Fallback: Include known specific hotels
  if (specificHotels.some((hotel) => title.toLowerCase().includes(hotel.toLowerCase()))) {
    return true;
  }

  const prompt = `Evaluate if the following search result represents a specific company or hotel worth scraping:

Title: ${title}
URL: ${url}

Respond with "yes" if it is worth scraping, otherwise "no".`;

  try {
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt,
      max_tokens: 10,
    });

    const decision = response.data.choices[0].text.trim().toLowerCase();
    return decision === "yes";
  } catch (error) {
    console.error("AI evaluation failed:", error);
    return false; // Default to not scraping if AI fails
  }
};

module.exports = { isWorthScraping };