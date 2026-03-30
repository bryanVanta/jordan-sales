/**
 * Search Service (SerpApi)
 */

class SearchService {
  async searchCompanies(query, limit = 10) {
    // TODO: Implement SerpApi integration
    console.log(`Searching for: ${query}`);
    return [];
  }

  async getCompanyInfo(companyName) {
    // TODO: Implement company info lookup
    console.log(`Getting info for: ${companyName}`);
    return null;
  }
}

module.exports = new SearchService();

// Adjust search query to focus on specific hotels or companies
const generateSearchQueries = (location) => {
  const specificHotels = ["Shangri-La", "Marriott", "Four Seasons", "InterContinental"];
  return specificHotels.map((hotel) => `${hotel} ${location}`);
};

const searchQueries = generateSearchQueries("Kuala Lumpur, Malaysia");

// Integrate AI filtering into the search workflow
const { isWorthScraping } = require("../services/aiService");

const filterWithAI = async (results) => {
  const filteredResults = [];

  for (const result of results) {
    const { title, url } = result;
    const worthScraping = await isWorthScraping(title, url);

    if (worthScraping) {
      filteredResults.push(result);
    } else {
      console.log(`Excluded by AI: ${title} (${url})`);
    }
  }

  return filteredResults;
};

const searchResults = await filterWithAI(searchQueries);

// Adjust filtering logic to ensure specific hotel names are prioritized
const isRelevantResult = (result) => {
  const irrelevantKeywords = [
    "directory site",
    "listicle",
    "overview",
    "guide",
    "luxury hotels",
    "kuala lumpur hotels",
  ];
  const specificHotels = ["shangri-la", "marriott", "four seasons", "intercontinental"];

  const title = result.title.toLowerCase();
  const url = result.url.toLowerCase();

  // Exclude irrelevant results
  if (irrelevantKeywords.some((kw) => title.includes(kw) || url.includes(kw))) {
    return false;
  }

  // Always include specific hotel names
  if (specificHotels.some((hotel) => title.includes(hotel) || url.includes(hotel))) {
    return true;
  }

  // Default to AI evaluation for other cases
  return true; // Let AI handle the rest
};

const filteredResults = searchResults.filter(isRelevantResult);
